import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { authenticateAdminRequest, isAdminPath, normalizeAdminPath } from './lib/auth';

export const onRequest = defineMiddleware(async (context, next) => {
  const normalizedPath = normalizeAdminPath(context.url.pathname);
  const isAdmin = isAdminPath(context.url.pathname);

  // 1. Guard ALL /admin/** and /api/admin/** by path prefix BEFORE routing.
  // Any admin request without a valid Access JWT returns 401/403, never 404,
  // across all HTTP methods (GET, POST, PUT, DELETE, HEAD, OPTIONS).
  if (isAdmin) {
    const workerEnv = (env || {}) as any;
    const adminEmails =
      workerEnv.ADMIN_EMAILS ||
      workerEnv.ADMIN_EMAIL ||
      import.meta.env.ADMIN_EMAILS;
    const expectedAud =
      workerEnv.CF_ACCESS_AUD ||
      import.meta.env.CF_ACCESS_AUD;
    const teamDomain =
      workerEnv.CF_ACCESS_TEAM_DOMAIN ||
      import.meta.env.CF_ACCESS_TEAM_DOMAIN;
    const devBypassAuth =
      workerEnv.DEV_BYPASS_AUTH === 'true' ||
      import.meta.env.DEV;

    const auth = await authenticateAdminRequest({
      isDev: import.meta.env.DEV,
      host: context.request.headers.get('host'),
      jwtAssertion: context.request.headers.get('Cf-Access-Jwt-Assertion'),
      adminEmails,
      expectedAud,
      teamDomain,
      devBypassAuth,
    });

    if (!auth.authenticated) {
      const statusCode = auth.statusCode || 401;
      const headers = new Headers();
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
      headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
      headers.set('X-Frame-Options', 'SAMEORIGIN');
      headers.set('Strict-Transport-Security', 'max-age=15552000');
      headers.set('X-Robots-Tag', 'noindex, nofollow');
      headers.set(
        'Content-Security-Policy',
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"
      );

      if (context.request.method === 'HEAD') {
        return new Response(null, { status: statusCode, headers });
      }

      const isJsonRequest =
        normalizedPath.startsWith('/api/') ||
        context.request.headers.get('accept')?.includes('application/json');

      if (isJsonRequest) {
        headers.set('Content-Type', 'application/json; charset=utf-8');
        return new Response(
          JSON.stringify({ error: auth.error || 'Unauthorized' }),
          { status: statusCode, headers }
        );
      }

      headers.set('Content-Type', 'text/html; charset=utf-8');
      const title = statusCode === 403 ? '403 Forbidden' : '401 Unauthorized';
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${statusCode} ${title}</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; background: #0a0a0a; color: #f5f5f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
    .card { max-width: 28rem; width: 100%; border: 1px solid #262626; border-radius: 0.75rem; padding: 2rem; background: #171717; text-align: center; }
    h1 { font-size: 1.25rem; font-weight: 600; margin: 0 0 0.75rem; }
    p { font-size: 0.875rem; color: #a3a3a3; line-height: 1.5; margin: 0 0 1.5rem; }
    a { font-size: 0.8125rem; color: #34d399; text-decoration: none; font-family: ui-monospace, monospace; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${statusCode} ${title}</h1>
    <p>${auth.error || 'Authentication required.'}</p>
    <a href="/">&larr; Return to sodops.uz</a>
  </div>
</body>
</html>`;
      return new Response(html, { status: statusCode, headers });
    }

    // Pass authenticated context to route locals
    (context.locals as any).auth = auth;
  }

  const response = await next();

  // 2. Defense-in-depth HTTP security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('Strict-Transport-Security', 'max-age=15552000');

  // 3. Strict X-Robots-Tag: noindex on ALL hosts while SITE_INDEXING is off (default).
  // When SITE_INDEXING is on, only non-sodops.uz hosts receive noindex.
  const siteIndexing = (
    (env as any)?.SITE_INDEXING ||
    import.meta.env.SITE_INDEXING ||
    'off'
  ).toLowerCase();
  const host = (context.request.headers.get('host') || context.url.host || '').toLowerCase().split(':')[0];
  if (siteIndexing !== 'on' || (host && host !== 'sodops.uz')) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }

  // 4. Strict Content-Security-Policy:
  // Public pages strictly enforce `script-src 'self' <hashes>` with ZERO 'unsafe-inline'
  // scripts, allowing only Astro's deterministic island hydrators while preventing stored XSS.
  const islandHashes = [
    "'sha256-UIrFqcaitjA3OKa9mHKajg3N+0Y7tW9+y0o3QmMFeZQ='", // astro-island prebuilt (prod)
    "'sha256-At4sXbunobuxXv56+YxR7rwL4c3n8ubyPDiI7CIowSo='", // astro-island prebuilt (dev)
    "'sha256-1BvDVWLr3QCC20uHhUDi27eDFVJpk1uMQJGIWKUks2I='", // client:load inline event
    "'sha256-xIb/Pa7FUshAu4ihwjchYcQpyCI8eS8kt40GpOAYCz8='", // client:idle inline event
    "'sha256-0O7iB6zr9x0r6X6eWYITC9V5q+yWCGAoFvcysBGbY9Q='", // client:visible inline event
    "'sha256-kmZE/W8I1iuTnl1b3yqzv9/DQZenPngd3NjSKMQl7y0='", // client:media inline event
    "'sha256-Y8t0ntteBwH+PqGKUyjWW3CAk+BNJKSoQc0xZ68FjhM='", // client:only inline event
    "'sha256-JyMRBoWf5xKkIHA91+XciwlF9qxXSpUtHUfMhj/UwH4='", // client:load module
    "'sha256-gK91o4B1sIvZ5Zk5xWte6bPczb0wSS92QD05OkSpV4E='", // client:idle module
    "'sha256-hG8Kp+fYqr9xLENy/bYaRcb9Z0JE7h55rIwwd8OVPMw='", // client:visible module
  ];

  const scriptSrcDirective = isAdmin
    ? "script-src 'self' 'unsafe-inline'"
    : `script-src 'self' https://static.cloudflareinsights.com ${islandHashes.join(' ')}`;

  const cspDirectives = [
    "default-src 'self'",
    scriptSrcDirective,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self' https://cloudflareinsights.com",
    "frame-src 'self' https://sodops.uz https://*.sodops.uz",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];

  response.headers.set('Content-Security-Policy', cspDirectives.join('; '));

  return response;
});
