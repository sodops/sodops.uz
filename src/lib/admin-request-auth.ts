import { env } from 'cloudflare:workers';
import {
  authenticateAdminRequest,
  extractAccessJwt,
  type AuthResult,
} from './auth';

/**
 * Middleware authenticates every admin route first. Reuse that verified result,
 * but independently validate the Access assertion if the route is called outside
 * the middleware path (defense in depth).
 */
export async function resolveAdminAuth(
  request: Request,
  locals: App.Locals
): Promise<AuthResult> {
  const cached = (locals as App.Locals & { auth?: AuthResult }).auth;
  if (cached) return cached;

  return authenticateAdminRequest({
    isDev: import.meta.env.DEV,
    host: request.headers.get('host'),
    jwtAssertion: extractAccessJwt(request.headers),
    adminEmails: env.ADMIN_EMAILS || env.ADMIN_EMAIL,
    expectedAud: env.CF_ACCESS_AUD,
    teamDomain: env.CF_ACCESS_TEAM_DOMAIN,
    devBypassAuth: env.DEV_BYPASS_AUTH === 'true' || import.meta.env.DEV,
  });
}
