import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import {
  isDevAuthBypassAllowed,
  authenticateAdminRequest,
  parseAllowedEmails,
  clearJwksCache,
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
    const emails = parseAllowedEmails('me@sodops.uz, Sodiq@Github.com , second@domain.org');
    assert.deepEqual(emails, ['me@sodops.uz', 'sodiq@github.com', 'second@domain.org']);
  });

  it('parses array of emails', () => {
    const emails = parseAllowedEmails(['me@sodops.uz', 'sodiq@github.com']);
    assert.deepEqual(emails, ['me@sodops.uz', 'sodiq@github.com']);
  });

  it('falls back to adminEmail', () => {
    const emails = parseAllowedEmails(undefined, 'me@sodops.uz');
    assert.deepEqual(emails, ['me@sodops.uz']);
  });

  it('returns empty array when neither provided', () => {
    const emails = parseAllowedEmails(undefined, undefined);
    assert.deepEqual(emails, []);
  });
});

describe('Authentication: Production Fail-Closed Rules', () => {
  const adminEmails = 'me@sodops.uz,sodiq@github.com';
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
    assert.equal(result.email, 'me@sodops.uz');
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
        email: 'me@sodops.uz',
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
  const adminEmails = 'me@sodops.uz,sodiq@github.com';
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
    const fullPayload = {
      iss: `https://${teamDomain}`,
      ...payload,
    };
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
      email: 'me@sodops.uz',
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

    assert.equal(result.authenticated, true);
    assert.equal(result.email, 'me@sodops.uz');
  });

  it('valid signed token with secondary GitHub email passes', async () => {
    const token = await createSignedJwt({
      email: 'sodiq@github.com',
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

    assert.equal(result.authenticated, true);
    assert.equal(result.email, 'sodiq@github.com');
  });

  it('strictly rejects token signed with attacker key (wrong signature)', async () => {
    const token = await createSignedJwt(
      {
        email: 'me@sodops.uz',
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
      publicKey,
    });

    assert.equal(result.authenticated, false);
    assert.match(result.error!, /Invalid JWT cryptographic signature/);
  });

  it('strictly rejects token with mismatched aud claim', async () => {
    const token = await createSignedJwt({
      email: 'me@sodops.uz',
      aud: 'wrong-audience-tag',
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
    assert.match(result.error!, /Audience mismatch/);
  });

  it('strictly rejects token with wrong iss claim (issuer mismatch)', async () => {
    const token = await createSignedJwt({
      email: 'me@sodops.uz',
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

  it('strictly rejects expired token', async () => {
    const token = await createSignedJwt({
      email: 'me@sodops.uz',
      aud: expectedAud,
      exp: Math.floor(Date.now() / 1000) - 120, // expired 2 minutes ago
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
    assert.match(result.error!, /JWT assertion expired/);
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
    assert.match(result.error!, /Unauthorized email address/);
  });

  it('successfully fetches and verifies public key via mock JWKS endpoint', async () => {
    const token = await createSignedJwt({
      email: 'me@sodops.uz',
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
    assert.equal(result.email, 'me@sodops.uz');
  });
});
