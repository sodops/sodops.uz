import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import {
  isDevAuthBypassAllowed,
  authenticateAdminRequest,
  parseAllowedEmails,
  clearJwksCache,
  normalizeAdminPath,
  isAdminPath,
  extractAccessJwt,
} from './auth';

describe('Authentication: isDevAuthBypassAllowed', () => {
  it('allows bypass when isDev is true and host is localhost', () => {
    assert.equal(isDevAuthBypassAllowed(true, 'localhost'), true);
    assert.equal(isDevAuthBypassAllowed(true, 'localhost:4321'), true);
    assert.equal(isDevAuthBypassAllowed(true, '127.0.0.1:8787'), true);
  });

  it('strictly rejects bypass when isDev is false, even on localhost', () => {
    assert.equal(isDevAuthBypassAllowed(false, 'localhost'), false);
    assert.equal(isDevAuthBypassAllowed(false, 'localhost:4321'), false);
    assert.equal(isDevAuthBypassAllowed(false, '127.0.0.1'), false);
  });

  it('strictly rejects bypass when host is not localhost/127.0.0.1', () => {
    assert.equal(isDevAuthBypassAllowed(true, 'sodops.uz'), false);
    assert.equal(isDevAuthBypassAllowed(true, 'preview.sodops.uz'), false);
    assert.equal(isDevAuthBypassAllowed(true, '192.168.1.5'), false);
    assert.equal(isDevAuthBypassAllowed(true, null), false);
  });
});

describe('Authentication: parseAllowedEmails', () => {
  it('parses comma-separated string of emails', () => {
    const emails = parseAllowedEmails('admin@example.com, Other@Example.com , second@domain.org');
    assert.deepEqual(emails, ['admin@example.com', 'other@example.com', 'second@domain.org']);
  });

  it('parses array of emails', () => {
    const emails = parseAllowedEmails(['admin@example.com', 'other@example.com']);
    assert.deepEqual(emails, ['admin@example.com', 'other@example.com']);
  });

  it('falls back to adminEmail', () => {
    const emails = parseAllowedEmails(undefined, 'admin@example.com');
    assert.deepEqual(emails, ['admin@example.com']);
  });

  it('returns empty array when neither provided', () => {
    const emails = parseAllowedEmails(undefined, undefined);
    assert.deepEqual(emails, []);
  });
});

describe('Authentication: Production Fail-Closed Rules', () => {
  const adminEmails = 'admin@example.com,other@example.com';
  const expectedAud = 'aud-test-123';
  const teamDomain = 'sodops.cloudflareaccess.com';

  it('authenticates via dev bypass on localhost in dev mode', async () => {
    const result = await authenticateAdminRequest({
      isDev: true,
      host: 'localhost:4321',
      jwtAssertion: null,
      adminEmails,
      devBypassAuth: true,
    });
    assert.equal(result.authenticated, true);
    assert.equal(result.email, 'admin@example.com');
  });

  it('fails closed when dev bypass attempted in production', async () => {
    const result = await authenticateAdminRequest({
      isDev: false,
      host: 'sodops.uz',
      jwtAssertion: null,
      adminEmails,
      expectedAud,
      teamDomain,
      devBypassAuth: true,
    });
    assert.equal(result.authenticated, false);
    assert.match(result.error!, /rejected/i);
  });

  it('fails closed when CF_ACCESS_AUD is missing in production', async () => {
    const result = await authenticateAdminRequest({
      isDev: false,
      host: 'sodops.uz',
      jwtAssertion: 'a.b.c',
      adminEmails,
      expectedAud: undefined,
      teamDomain,
    });
    assert.equal(result.authenticated, false);
    assert.match(result.error!, /missing CF_ACCESS_AUD/);
  });

  it('fails closed when CF_ACCESS_TEAM_DOMAIN is missing in production (and no key provided)', async () => {
    const result = await authenticateAdminRequest({
      isDev: false,
      host: 'sodops.uz',
      jwtAssertion: 'a.b.c',
      adminEmails,
      expectedAud,
      teamDomain: undefined,
    });
    assert.equal(result.authenticated, false);
    assert.match(result.error!, /missing CF_ACCESS_TEAM_DOMAIN/);
  });

  it('fails closed when JWT is missing in production', async () => {
    const result = await authenticateAdminRequest({
      isDev: false,
      host: 'sodops.uz',
      jwtAssertion: null,
      adminEmails,
      expectedAud,
      teamDomain,
    });
    assert.equal(result.authenticated, false);
    assert.match(result.error!, /Missing Cf-Access-Jwt-Assertion/);
  });

  it('strictly rejects tokens with alg: none or unsupported algorithms', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        email: 'admin@example.com',
        aud: expectedAud,
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    ).toString('base64url');
    const token = `${header}.${payload}.sig`;

    const result = await authenticateAdminRequest({
      isDev: false,
      host: 'sodops.uz',
      jwtAssertion: token,
      adminEmails,
      expectedAud,
      teamDomain,
    });
    assert.equal(result.authenticated, false);
    assert.match(result.error!, /Unsupported JWT algorithm/);
  });
});

describe('Authentication: Cryptographic JWT Verification (RSA Key Pair & Multi-Email)', () => {
  const adminEmails = 'admin@example.com,other@example.com';
  const expectedAud = 'cf-access-aud-sodops-uz';
  const teamDomain = 'sodops.cloudflareaccess.com';
  let publicKey: CryptoKey;
  let privateKey: CryptoKey;
  let attackerPrivateKey: CryptoKey;
  let testJwk: JsonWebKey;

  before(async () => {
    clearJwksCache();
    // Generate valid RSA key pair
    const keys: any = generateKeyPairSync('rsa' as any, {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'jwk' },
      privateKeyEncoding: { type: 'pkcs8', format: 'jwk' },
    });

    testJwk = { ...keys.publicKey, kid: 'test-key-id-1', alg: 'RS256' };

    publicKey = await crypto.subtle.importKey(
      'jwk',
      keys.publicKey as JsonWebKey,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );

    privateKey = await crypto.subtle.importKey(
      'jwk',
      keys.privateKey as JsonWebKey,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );

    // Generate attacker key pair
    const attackerKeys: any = generateKeyPairSync('rsa' as any, {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'jwk' },
      privateKeyEncoding: { type: 'pkcs8', format: 'jwk' },
    });

    attackerPrivateKey = await crypto.subtle.importKey(
      'jwk',
      attackerKeys.privateKey as JsonWebKey,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );
  });

  async function createSignedJwt(
    payload: Record<string, unknown>,
    signingKey: CryptoKey = privateKey,
    kid: string = 'test-key-id-1'
  ): Promise<string> {
    const fullPayload: Record<string, unknown> = {
      iss: `https://${teamDomain}`,
      ...payload,
    };
    if ('iss' in payload && payload.iss === undefined) {
      delete fullPayload.iss;
    }
    if ('aud' in payload && payload.aud === undefined) {
      delete fullPayload.aud;
    }
    if ('exp' in payload && payload.exp === undefined) {
      delete fullPayload.exp;
    }
    const header = Buffer.from(
      JSON.stringify({ alg: 'RS256', typ: 'JWT', kid })
    ).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
    const data = new TextEncoder().encode(`${header}.${encodedPayload}`);

    const signature = await crypto.subtle.sign(
      { name: 'RSASSA-PKCS1-v1_5' },
      signingKey,
      data
    );
    const encodedSig = Buffer.from(signature).toString('base64url');

    return `${header}.${encodedPayload}.${encodedSig}`;
  }

  it('valid signed token with primary email passes', async () => {
    const token = await createSignedJwt({
      email: 'admin@example.com',
      aud: expectedAud,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const result = await authenticateAdminRequest({
      isDev: false,
      host: 'sodops.uz',
      jwtAssertion: token,
      adminEmails,
      expectedAud,
      teamDomain,
      publicKey,
    });

    assert.equal(result.authenticated, true);
    assert.equal(result.email, 'admin@example.com');
  });

  it('valid signed token with secondary GitHub email passes', async () => {
    const token = await createSignedJwt({
      email: 'other@example.com',
      aud: expectedAud,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const result = await authenticateAdminRequest({
      isDev: false,
      host: 'sodops.uz',
      jwtAssertion: token,
      adminEmails,
      expectedAud,
      teamDomain,
      publicKey,
    });

    assert.equal(result.authenticated, true);
    assert.equal(result.email, 'other@example.com');
  });

  it('strictly rejects token signed with attacker key (wrong signature)', async () => {
    const token = await createSignedJwt(
      {
        email: 'admin@example.com',
        aud: expectedAud,
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      attackerPrivateKey
    );

    const result = await authenticateAdminRequest({
      isDev: false,
      host: 'sodops.uz',
      jwtAssertion: token,
      adminEmails,
      expectedAud,
      teamDomain,
      publicKey,
    });

    assert.equal(result.authenticated, false);
    assert.match(result.error!, /Invalid JWT cryptographic signature/);
  });

  it('strictly rejects token with mismatched aud claim', async () => {
    const token = await createSignedJwt({
      email: 'admin@example.com',
      aud: 'wrong-audience-tag',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const result = await authenticateAdminRequest({
      isDev: false,
      host: 'sodops.uz',
      jwtAssertion: token,
      adminEmails,
      expectedAud,
      teamDomain,
      publicKey,
    });

    assert.equal(result.authenticated, false);
    assert.match(result.error!, /Audience mismatch/);
  });

  it('strictly rejects token with missing aud claim', async () => {
    const token = await createSignedJwt({
      email: 'admin@example.com',
      aud: undefined,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const result = await authenticateAdminRequest({
      isDev: false,
      host: 'sodops.uz',
      jwtAssertion: token,
      adminEmails,
      expectedAud,
      teamDomain,
      publicKey,
    });

    assert.equal(result.authenticated, false);
    assert.match(result.error!, /Missing required aud claim/);
  });

  it('strictly rejects token with wrong iss claim (issuer mismatch)', async () => {
    const token = await createSignedJwt({
      email: 'admin@example.com',
      aud: expectedAud,
      iss: 'https://evil.cloudflareaccess.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const result = await authenticateAdminRequest({
      isDev: false,
      host: 'sodops.uz',
      jwtAssertion: token,
      adminEmails,
      expectedAud,
      teamDomain,
      publicKey,
    });

    assert.equal(result.authenticated, false);
    assert.match(result.error!, /Issuer mismatch/);
  });

  it('strictly rejects token with missing iss claim', async () => {
    const token = await createSignedJwt({
      email: 'admin@example.com',
      aud: expectedAud,
      iss: undefined,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const result = await authenticateAdminRequest({
      isDev: false,
      host: 'sodops.uz',
      jwtAssertion: token,
      adminEmails,
      expectedAud,
      teamDomain,
      publicKey,
    });

    assert.equal(result.authenticated, false);
    assert.match(result.error!, /Missing required iss claim/);
  });

  it('strictly rejects expired token', async () => {
    const token = await createSignedJwt({
      email: 'admin@example.com',
      aud: expectedAud,
      exp: Math.floor(Date.now() / 1000) - 120, // expired 2 minutes ago
    });

    const result = await authenticateAdminRequest({
      isDev: false,
      host: 'sodops.uz',
      jwtAssertion: token,
      adminEmails,
      expectedAud,
      teamDomain,
      publicKey,
    });

    assert.equal(result.authenticated, false);
    assert.match(result.error!, /JWT assertion expired/);
  });

  it('strictly rejects token with missing exp claim', async () => {
    const token = await createSignedJwt({
      email: 'admin@example.com',
      aud: expectedAud,
      exp: undefined,
    });

    const result = await authenticateAdminRequest({
      isDev: false,
      host: 'sodops.uz',
      jwtAssertion: token,
      adminEmails,
      expectedAud,
      teamDomain,
      publicKey,
    });

    assert.equal(result.authenticated, false);
    assert.match(result.error!, /Missing required exp claim/);
  });

  it('strictly rejects token with unauthorized email not in ADMIN_EMAILS', async () => {
    const token = await createSignedJwt({
      email: 'intruder@domain.com',
      aud: expectedAud,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const result = await authenticateAdminRequest({
      isDev: false,
      host: 'sodops.uz',
      jwtAssertion: token,
      adminEmails,
      expectedAud,
      publicKey,
    });

    assert.equal(result.authenticated, false);
    assert.equal(result.statusCode, 403);
    assert.match(result.error!, /Unauthorized email address/);
  });

  it('successfully fetches and verifies public key via mock JWKS endpoint', async () => {
    const token = await createSignedJwt({
      email: 'admin@example.com',
      aud: expectedAud,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    // Mock fetch for JWKS certs URL
    const mockFetch = async (url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes('/cdn-cgi/access/certs')) {
        return new Response(JSON.stringify({ keys: [testJwk] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('Not found', { status: 404 });
    };

    const result = await authenticateAdminRequest({
      isDev: false,
      host: 'sodops.uz',
      jwtAssertion: token,
      adminEmails,
      expectedAud,
      teamDomain,
      fetchFn: mockFetch as any,
    });

    assert.equal(result.authenticated, true);
    assert.equal(result.email, 'admin@example.com');
  });
});

describe('Admin Boundary: Path Normalization & Prefix Matching', () => {
  it('normalizes standard admin paths', () => {
    assert.equal(normalizeAdminPath('/admin'), '/admin');
    assert.equal(normalizeAdminPath('/admin/'), '/admin');
    assert.equal(normalizeAdminPath('/Admin'), '/admin');
    assert.equal(normalizeAdminPath('//admin'), '/admin');
    assert.equal(normalizeAdminPath('/%61dmin'), '/admin');
    assert.equal(normalizeAdminPath('/admin/../admin'), '/admin');
    assert.equal(normalizeAdminPath('/api/admin'), '/api/admin');
    assert.equal(normalizeAdminPath('/api/admin/posts'), '/api/admin/posts');
    assert.equal(normalizeAdminPath('/api/admin%2Fposts'), '/api/admin/posts');
    assert.equal(normalizeAdminPath('/api/ADMIN/export'), '/api/admin/export');
  });

  it('matches all required admin path variations via isAdminPath', () => {
    const requiredAdminPaths = [
      '/admin',
      '/admin/',
      '/Admin',
      '//admin',
      '/%61dmin',
      '/admin/../admin',
      '/api/admin',
      '/api/admin/posts',
      '/api/admin%2Fposts',
      '/api/ADMIN/export',
      '/admin/new',
      '/admin/anything',
      '/api/admin/nonexistent',
      '/admin;param=1',
      '/api/admin;param/posts',
      '//admin//posts//',
      '/Admin/Upload',
    ];

    for (const p of requiredAdminPaths) {
      assert.equal(
        isAdminPath(p),
        true,
        `Expected '${p}' to match admin boundary`
      );
    }
  });

  it('strictly excludes non-admin public paths from admin boundary', () => {
    const publicPaths = [
      '/',
      '/blog',
      '/blog/hello-world',
      '/projects',
      '/uses',
      '/now',
      '/api/health',
      '/api/search.json',
      '/feed.xml',
      '/sitemap.xml',
      '/admin-not',
      '/administrator',
      '/api/admin-public',
    ];

    for (const p of publicPaths) {
      assert.equal(
        isAdminPath(p),
        false,
        `Expected '${p}' to NOT match admin boundary`
      );
    }
  });
});

describe('Admin Boundary: Clear Failure on Misconfigured Access', () => {
  it('fails closed with status 401 when CF_ACCESS_AUD is missing in production', async () => {
    const result = await authenticateAdminRequest({
      isDev: false,
      host: 'sodops.uz',
      jwtAssertion: 'header.payload.sig',
      adminEmails: 'admin@example.com',
      expectedAud: undefined,
      teamDomain: 'sodops.cloudflareaccess.com',
    });

    assert.equal(result.authenticated, false);
    assert.equal(result.statusCode, 401);
    assert.match(result.error!, /missing CF_ACCESS_AUD/);
  });

  it('fails closed with status 401 when CF_ACCESS_TEAM_DOMAIN is missing in production', async () => {
    const result = await authenticateAdminRequest({
      isDev: false,
      host: 'sodops.uz',
      jwtAssertion: 'header.payload.sig',
      adminEmails: 'admin@example.com',
      expectedAud: 'cf-access-aud-123',
      teamDomain: undefined,
    });

    assert.equal(result.authenticated, false);
    assert.equal(result.statusCode, 401);
    assert.match(result.error!, /missing CF_ACCESS_TEAM_DOMAIN/);
  });

  it('fails closed with status 401 when JWKS certs fetch fails or throws', async () => {
    const header = Buffer.from(
      JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'unknown-kid' })
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        iss: 'https://sodops.cloudflareaccess.com',
        aud: 'cf-access-aud-123',
        email: 'admin@example.com',
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    ).toString('base64url');
    const token = `${header}.${payload}.mockSignature`;

    // Mock fetch that simulates network or upstream error
    const failingFetch = async () => {
      return new Response('Internal Server Error', { status: 500 });
    };

    const result = await authenticateAdminRequest({
      isDev: false,
      host: 'sodops.uz',
      jwtAssertion: token,
      adminEmails: 'admin@example.com',
      expectedAud: 'cf-access-aud-123',
      teamDomain: 'sodops.cloudflareaccess.com',
      fetchFn: failingFetch as any,
    });

    assert.equal(result.authenticated, false);
    assert.equal(result.statusCode, 401);
    assert.match(result.error!, /Public key not found/);
  });

  it('fails closed with status 401 when ADMIN_EMAILS is missing or empty', async () => {
    const result = await authenticateAdminRequest({
      isDev: false,
      host: 'sodops.uz',
      jwtAssertion: 'some.jwt.token',
      adminEmails: '',
      expectedAud: 'cf-access-aud-123',
      teamDomain: 'sodops.cloudflareaccess.com',
    });

    assert.equal(result.authenticated, false);
    assert.equal(result.statusCode, 401);
    assert.match(result.error!, /No admin emails configured/);
  });
});

describe('Authentication: extractAccessJwt Header & Cookie Extraction', () => {
  it('extracts JWT from Cf-Access-Jwt-Assertion header', () => {
    const headers = new Headers({
      'Cf-Access-Jwt-Assertion': 'test.jwt.token',
    });
    assert.equal(extractAccessJwt(headers), 'test.jwt.token');
  });

  it('extracts JWT from CF_Authorization cookie when header is missing', () => {
    const headers = new Headers({
      cookie: 'theme=dark; CF_Authorization=cookie.jwt.token; other=val',
    });
    assert.equal(extractAccessJwt(headers), 'cookie.jwt.token');
  });

  it('handles URL-encoded and quoted CF_Authorization cookies', () => {
    const headers = new Headers({
      cookie: 'CF_Authorization="encoded%2Ejwt%2Etoken"',
    });
    assert.equal(extractAccessJwt(headers), 'encoded.jwt.token');
  });

  it('prefers Cf-Access-Jwt-Assertion header over cookie if both present', () => {
    const headers = new Headers({
      'Cf-Access-Jwt-Assertion': 'header.jwt.token',
      cookie: 'CF_Authorization=cookie.jwt.token',
    });
    assert.equal(extractAccessJwt(headers), 'header.jwt.token');
  });

  it('returns null when neither header nor cookie is present', () => {
    const headers = new Headers({
      cookie: 'theme=dark',
    });
    assert.equal(extractAccessJwt(headers), null);
    assert.equal(extractAccessJwt(null), null);
  });
});
