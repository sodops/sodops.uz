import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
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
    // Generate valid base64url payload with wrong email
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
