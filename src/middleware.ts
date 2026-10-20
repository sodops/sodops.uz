import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();

  // 1. Defense-in-depth HTTP security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');

  // 2. Strict X-Robots-Tag: noindex for any preview host other than sodops.uz
  const host = (context.request.headers.get('host') || context.url.host || '').toLowerCase().split(':')[0];
  if (host && host !== 'sodops.uz') {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }

  // 3. Strict Content-Security-Policy:
  // Public pages strictly enforce `script-src 'self' <hashes>` with ZERO 'unsafe-inline'
  // scripts, allowing only Astro's deterministic island hydrators while preventing stored XSS.
  const isAdmin =
    context.url.pathname.startsWith('/admin') ||
    context.url.pathname.startsWith('/api/admin');

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
    "font-src 'self' data:",
    "connect-src 'self' https://cloudflareinsights.com",
    "frame-src 'self' https://sodops.uz https://*.sodops.uz",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];

  response.headers.set('Content-Security-Policy', cspDirectives.join('; '));

  return response;
});
