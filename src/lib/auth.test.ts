import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { isDevAuthBypassAllowed, authenticateAdminRequest } from './auth';

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

describe('Authentication: authenticateAdminRequest', () => {
  const adminEmail = 'me@sodops.uz';

  it('authenticates via dev bypass on localhost in dev mode', async () => {
    const result = await authenticateAdminRequest({
      isDev: true,
      host: 'localhost:4321',
      jwtAssertion: null,
      adminEmail,
      devBypassAuth: true,
    });
    assert.equal(result.authenticated, true);
    assert.equal(result.email, adminEmail);
  });

  it('fails closed when dev bypass attempted in production', async () => {
    const result = await authenticateAdminRequest({
      isDev: false,
      host: 'sodops.uz',
      jwtAssertion: null,
      adminEmail,
      devBypassAuth: true,
    });
    assert.equal(result.authenticated, false);
    assert.match(result.error!, /rejected/i);
  });

  it('fails closed when JWT is missing in production', async () => {
    const result = await authenticateAdminRequest({
      isDev: false,
      host: 'sodops.uz',
      jwtAssertion: null,
      adminEmail,
    });
    assert.equal(result.authenticated, false);
    assert.match(result.error!, /Missing Cf-Access-Jwt-Assertion/);
  });

  it('fails closed when email does not match ADMIN_EMAIL', async () => {
    const payload = {
      email: 'attacker@evil.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;

    const result = await authenticateAdminRequest({
      isDev: false,
      host: 'sodops.uz',
      jwtAssertion: token,
      adminEmail,
    });
    assert.equal(result.authenticated, false);
    assert.match(result.error!, /Unauthorized email/);
  });
});

describe('Authentication: Cryptographic JWT Verification (RSA Key Pair)', () => {
  const adminEmail = 'me@sodops.uz';
  const expectedAud = 'cf-access-aud-sodops-uz';
  let publicKey: CryptoKey;
  let privateKey: CryptoKey;
  let attackerPrivateKey: CryptoKey;

  before(async () => {
    // Generate valid RSA key pair
    const keys: any = generateKeyPairSync('rsa' as any, {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'jwk' },
      privateKeyEncoding: { type: 'pkcs8', format: 'jwk' },
    });

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
    signingKey: CryptoKey = privateKey
  ): Promise<string> {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString(
      'base64url'
    );
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const data = new TextEncoder().encode(`${header}.${encodedPayload}`);

    const signature = await crypto.subtle.sign(
      { name: 'RSASSA-PKCS1-v1_5' },
      signingKey,
      data
    );
    const encodedSig = Buffer.from(signature).toString('base64url');

    return `${header}.${encodedPayload}.${encodedSig}`;
  }

  it('valid signed token with matching email and aud passes authentication', async () => {
    const token = await createSignedJwt({
      email: adminEmail,
      aud: expectedAud,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const result = await authenticateAdminRequest({
      isDev: false,
      host: 'sodops.uz',
      jwtAssertion: token,
      adminEmail,
      expectedAud,
      publicKey,
    });

    assert.equal(result.authenticated, true);
    assert.equal(result.email, adminEmail);
  });

  it('strictly rejects token signed with attacker key (wrong signature)', async () => {
    const token = await createSignedJwt(
      {
        email: adminEmail,
        aud: expectedAud,
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      attackerPrivateKey
    );

    const result = await authenticateAdminRequest({
      isDev: false,
      host: 'sodops.uz',
      jwtAssertion: token,
      adminEmail,
      expectedAud,
      publicKey,
    });

    assert.equal(result.authenticated, false);
    assert.match(result.error!, /Invalid JWT cryptographic signature/);
  });

  it('strictly rejects token with mismatched aud claim', async () => {
    const token = await createSignedJwt({
      email: adminEmail,
      aud: 'wrong-audience-tag',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const result = await authenticateAdminRequest({
      isDev: false,
      host: 'sodops.uz',
      jwtAssertion: token,
      adminEmail,
      expectedAud,
      publicKey,
    });

    assert.equal(result.authenticated, false);
    assert.match(result.error!, /Audience mismatch/);
  });

  it('strictly rejects expired token', async () => {
    const token = await createSignedJwt({
      email: adminEmail,
      aud: expectedAud,
      exp: Math.floor(Date.now() / 1000) - 120, // expired 2 minutes ago
    });

    const result = await authenticateAdminRequest({
      isDev: false,
      host: 'sodops.uz',
      jwtAssertion: token,
      adminEmail,
      expectedAud,
      publicKey,
    });

    assert.equal(result.authenticated, false);
    assert.match(result.error!, /JWT assertion expired/);
  });

  it('strictly rejects token with unauthorized email', async () => {
    const token = await createSignedJwt({
      email: 'intruder@domain.com',
      aud: expectedAud,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const result = await authenticateAdminRequest({
      isDev: false,
      host: 'sodops.uz',
      jwtAssertion: token,
      adminEmail,
      expectedAud,
      publicKey,
    });

    assert.equal(result.authenticated, false);
    assert.match(result.error!, /Unauthorized email address/);
  });

  it('strictly rejects when token is missing', async () => {
    const result = await authenticateAdminRequest({
      isDev: false,
      host: 'sodops.uz',
      jwtAssertion: null,
      adminEmail,
      expectedAud,
      publicKey,
    });

    assert.equal(result.authenticated, false);
    assert.match(result.error!, /Missing Cf-Access-Jwt-Assertion/);
  });
});
