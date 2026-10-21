import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  authenticateAdminRequest,
  clearJwksCache,
  getAccessPublicKey,
} from './auth';
import { isAllowedMonitoringHost, isAllowedMonitoringUrl } from './status';

describe('Security Fuzz: JWT Edge Cases & Throttled JWKS Refetch', () => {
  let keyPair: CryptoKeyPair;
  let testKid = 'valid-test-kid-1';
  let teamDomain = 'test-team.cloudflareaccess.com';
  let expectedAud = 'expected-access-aud-12345';
  let allowedEmail = 'admin@sodops.uz';

  beforeEach(async () => {
    clearJwksCache();
    keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify']
    );
  });

  async function createSignedJwt(headerObj: any, payloadObj: any, privateKey: CryptoKey = keyPair.privateKey): Promise<string> {
    const toBase64Url = (obj: any) =>
      Buffer.from(JSON.stringify(obj))
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

    const header = toBase64Url(headerObj);
    const payload = toBase64Url(payloadObj);
    const data = new TextEncoder().encode(`${header}.${payload}`);

    const signature = await crypto.subtle.sign(
      { name: 'RSASSA-PKCS1-v1_5' },
      privateKey,
      data
    );

    const sigBase64 = Buffer.from(signature)
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    return `${header}.${payload}.${sigBase64}`;
  }

  it('rejects expired JWT token (exp in past)', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await createSignedJwt(
      { alg: 'RS256', kid: testKid },
      {
        iss: `https://${teamDomain}`,
        aud: expectedAud,
        email: allowedEmail,
        exp: now - 3600, // 1 hour ago
        iat: now - 7200,
      }
    );

    const result = await authenticateAdminRequest({
      isDev: false,
      host: 'sodops.uz',
      jwtAssertion: token,
      expectedAud,
      teamDomain,
      adminEmails: [allowedEmail],
      publicKey: keyPair.publicKey,
    });

    assert.equal(result.authenticated, false);
    assert.equal(result.statusCode, 401);
    assert.match(result.error || '', /expired/i);
  });

  it('rejects JWT with wrong issuer (iss mismatch)', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await createSignedJwt(
      { alg: 'RS256', kid: testKid },
      {
        iss: 'https://evil-team.cloudflareaccess.com',
        aud: expectedAud,
        email: allowedEmail,
        exp: now + 3600,
        iat: now,
      }
    );

    const result = await authenticateAdminRequest({
      isDev: false,
      host: 'sodops.uz',
      jwtAssertion: token,
      expectedAud,
      teamDomain,
      adminEmails: [allowedEmail],
      publicKey: keyPair.publicKey,
    });

    assert.equal(result.authenticated, false);
    assert.equal(result.statusCode, 401);
    assert.match(result.error || '', /issuer/i);
  });

  it('rejects JWT with wrong audience (aud mismatch)', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await createSignedJwt(
      { alg: 'RS256', kid: testKid },
      {
        iss: `https://${teamDomain}`,
        aud: 'attacker-aud-99999',
        email: allowedEmail,
        exp: now + 3600,
        iat: now,
      }
    );

    const result = await authenticateAdminRequest({
      isDev: false,
      host: 'sodops.uz',
      jwtAssertion: token,
      expectedAud,
      teamDomain,
      adminEmails: [allowedEmail],
      publicKey: keyPair.publicKey,
    });

    assert.equal(result.authenticated, false);
    assert.equal(result.statusCode, 401);
    assert.match(result.error || '', /audience/i);
  });

  it('strictly rejects alg: none attack', async () => {
    const now = Math.floor(Date.now() / 1000);
    const toBase64Url = (obj: any) =>
      Buffer.from(JSON.stringify(obj))
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

    const header = toBase64Url({ alg: 'none' });
    const payload = toBase64Url({
      iss: `https://${teamDomain}`,
      aud: expectedAud,
      email: allowedEmail,
      exp: now + 3600,
    });
    const noneToken = `${header}.${payload}.`;

    const result = await authenticateAdminRequest({
      isDev: false,
      host: 'sodops.uz',
      jwtAssertion: noneToken,
      expectedAud,
      teamDomain,
      adminEmails: [allowedEmail],
      publicKey: keyPair.publicKey,
    });

    assert.equal(result.authenticated, false);
    assert.equal(result.statusCode, 401);
    assert.match(result.error || '', /algorithm/i);
  });

  it('strictly rejects symmetric HMAC with public key (alg: HS256 key confusion attack)', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await createSignedJwt(
      { alg: 'HS256', kid: testKid },
      {
        iss: `https://${teamDomain}`,
        aud: expectedAud,
        email: allowedEmail,
        exp: now + 3600,
      }
    );

    const result = await authenticateAdminRequest({
      isDev: false,
      host: 'sodops.uz',
      jwtAssertion: token,
      expectedAud,
      teamDomain,
      adminEmails: [allowedEmail],
      publicKey: keyPair.publicKey,
    });

    assert.equal(result.authenticated, false);
    assert.equal(result.statusCode, 401);
    assert.match(result.error || '', /algorithm/i);
  });

  it('rejects tampered signature payload', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await createSignedJwt(
      { alg: 'RS256', kid: testKid },
      {
        iss: `https://${teamDomain}`,
        aud: expectedAud,
        email: allowedEmail,
        exp: now + 3600,
      }
    );

    // Tamper with payload
    const parts = token.split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify({
        iss: `https://${teamDomain}`,
        aud: expectedAud,
        email: 'attacker@evil.com',
        exp: now + 3600,
      })
    )
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    const result = await authenticateAdminRequest({
      isDev: false,
      host: 'sodops.uz',
      jwtAssertion: tamperedToken,
      expectedAud,
      teamDomain,
      adminEmails: [allowedEmail],
      publicKey: keyPair.publicKey,
    });

    assert.equal(result.authenticated, false);
    assert.equal(result.statusCode, 401);
    assert.match(result.error || '', /signature/i);
  });

  it('throttles JWKS refetches when unknown kid is requested repeatedly', async () => {
    let jwksFetchCount = 0;
    const mockJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    (mockJwk as any).kid = 'known-valid-kid';

    const mockFetch: typeof fetch = async (url) => {
      jwksFetchCount++;
      return new Response(JSON.stringify({ keys: [mockJwk] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    // First request with unknown kid -> fetches JWKS once
    const key1 = await getAccessPublicKey(teamDomain, 'unknown-kid-1', mockFetch);
    assert.equal(key1, null);
    assert.equal(jwksFetchCount, 1);

    // Second request immediately with another unknown kid -> throttled, does NOT refetch JWKS
    const key2 = await getAccessPublicKey(teamDomain, 'unknown-kid-2', mockFetch);
    assert.equal(key2, null);
    assert.equal(jwksFetchCount, 1); // Fetch count MUST remain 1 (throttled)

    // Third request with known valid kid -> served immediately from cached JWKS key set
    const keyKnown = await getAccessPublicKey(teamDomain, 'known-valid-kid', mockFetch);
    assert.ok(keyKnown);
    assert.equal(jwksFetchCount, 1); // Still 1, served from cache
  });

  it('fails closed when Cloudflare Access JWKS endpoint is down (503 Service Unavailable)', async () => {
    const mockDownFetch: typeof fetch = async () => {
      return new Response('Cloudflare Edge Error', { status: 503 });
    };

    const key = await getAccessPublicKey(teamDomain, 'any-kid', mockDownFetch);
    assert.equal(key, null);
  });
});

describe('Security Fuzz: SSRF & Monitoring Allowlist Matrix', () => {
  const hostileHosts = [
    // IPv4 private/internal ranges
    '127.0.0.1',
    '10.0.0.1',
    '172.16.0.1',
    '192.168.1.1',
    '0.0.0.0',
    // Cloudflare / AWS metadata service
    '169.254.169.254',
    // IPv6 loopback and private
    '::1',
    '[::1]',
    'fe80::1',
    '[fe80::1]',
    // Localhost / alias
    'localhost',
    'localhost.localdomain',
    // Suffix attacks
    'sodops.uz.evil.com',
    'mc.sodops.uz.attacker.io',
    // Prefix attacks
    'evilsodops.uz',
    'fakesodops.uz',
    // Special characters & delimiters
    'sodops.uz:8080',
    'sodops.uz/admin',
    'sodops.uz\\test',
    'sodops.uz@evil.com',
  ];

  for (const host of hostileHosts) {
    it(`strictly blocks hostile monitoring host: '${host}'`, () => {
      assert.equal(isAllowedMonitoringHost(host), false);
    });
  }

  const hostileUrls = [
    'http://169.254.169.254/latest/meta-data/',
    'http://127.0.0.1:8080/admin',
    'http://0.0.0.0:80',
    'http://[::1]:22',
    'http://localhost/',
    'http://sodops.uz.attacker.com',
    'https://sodops.uz@evil.com/health',
    'https://sodops.uz:secret@evil.com/',
    'ftp://sodops.uz/',
    'file:///etc/passwd',
    'gopher://sodops.uz:70/',
    'javascript:alert(1)',
  ];

  for (const url of hostileUrls) {
    it(`strictly blocks hostile SSRF URL: '${url}'`, () => {
      assert.equal(isAllowedMonitoringUrl(url), false);
    });
  }

  it('allows valid root and subdomains', () => {
    assert.equal(isAllowedMonitoringUrl('https://sodops.uz'), true);
    assert.equal(isAllowedMonitoringUrl('https://sodops.uz/api/health'), true);
    assert.equal(isAllowedMonitoringUrl('https://mc.sodops.uz:25565'), true);
    assert.equal(isAllowedMonitoringUrl('https://status.sodops.uz'), true);
  });
});
