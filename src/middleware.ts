import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();

  // 1. Defense-in-depth HTTP security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');

  // 2. Strict Content-Security-Policy:
  // Public pages strictly enforce `script-src 'self'` with ZERO 'unsafe-inline'
  // scripts, providing guaranteed defense-in-depth against stored XSS.
  const isAdmin =
    context.url.pathname.startsWith('/admin') ||
    context.url.pathname.startsWith('/api/admin');

  const cspDirectives = [
    "default-src 'self'",
    isAdmin ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-src 'self' https://sodops.uz https://*.sodops.uz",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];

  response.headers.set('Content-Security-Policy', cspDirectives.join('; '));

  return response;
});
