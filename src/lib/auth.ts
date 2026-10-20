// Cloudflare Access JWT Authentication & Defense-in-Depth Verification
// For /admin/* and /api/admin/*

export interface AuthContext {
  isDev: boolean;
  host: string | null;
  jwtAssertion?: string | null;
  cookieHeader?: string | null;
  headers?: Headers | null;
  adminEmails?: string | string[];
  adminEmail?: string;
  expectedAud?: string;
  teamDomain?: string;
  devBypassAuth?: boolean;
  publicKey?: CryptoKey;
  fetchFn?: typeof fetch;
}

export interface AuthResult {
  authenticated: boolean;
  statusCode?: 401 | 403 | 503;
  email?: string;
  error?: string;
}

/**
 * Normalizes an arbitrary request pathname for administrative security boundary checks.
 *
 * Normalization algorithm:
 * 1. Strip query string and hash
 * 2. Decode percent-encoding iteratively (resolves %61 -> a, %2F -> /, etc.)
 * 3. Lowercase all characters (case-insensitivity defense)
 * 4. Replace backslashes with forward slashes
 * 5. Strip matrix parameters (;param=...) from each path segment
 * 6. Resolve POSIX dot segments ('.' and '..') and collapse redundant slashes ('//' -> '/')
 * 7. Strip trailing slashes (except root '/')
 */
export function normalizeAdminPath(rawPath: string): string {
  if (!rawPath) return '/';

  // 1. Strip query string or hash if present
  let path = rawPath.split('?')[0].split('#')[0];

  // 2. Decode percent-encoding iteratively (up to 3 iterations, catching malformed URIs)
  for (let i = 0; i < 3; i++) {
    try {
      const decoded = decodeURIComponent(path);
      if (decoded === path) break;
      path = decoded;
    } catch {
      break;
    }
  }

  // 3. Lowercase
  path = path.toLowerCase();

  // 4. Normalize backslashes to forward slashes
  path = path.replace(/\\/g, '/');

  // 5. Split segments, strip matrix parameters from each segment, and resolve POSIX dot segments
  const rawSegments = path.split('/');
  const resolved: string[] = [];

  for (const seg of rawSegments) {
    // Strip matrix parameters (;foo=bar)
    const cleanSeg = seg.split(';')[0].trim();
    if (!cleanSeg || cleanSeg === '.') continue;
    if (cleanSeg === '..') {
      resolved.pop();
    } else {
      resolved.push(cleanSeg);
    }
  }

  return '/' + resolved.join('/');
}

/**
 * Returns true if the pathname targets the administrative boundary:
 * - /admin or /admin/**
 * - /api/admin or /api/admin/**
 */
export function isAdminPath(pathname: string): boolean {
  const normalized = normalizeAdminPath(pathname);
  return (
    normalized === '/admin' ||
    normalized.startsWith('/admin/') ||
    normalized === '/api/admin' ||
    normalized.startsWith('/api/admin/')
  );
}

// In-memory cache for imported JWKS CryptoKey instances across Worker requests
const jwksKeyCache = new Map<string, { key: CryptoKey; cachedAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour TTL

/**
 * Clears the JWKS key cache (primarily for unit testing)
 */
export function clearJwksCache(): void {
  jwksKeyCache.clear();
}

/**
 * Validates whether DEV_BYPASS_AUTH is permissible.
 * STRICT SECURITY REQUIREMENT:
 * DEV_BYPASS_AUTH must be honored ONLY when:
 * 1. import.meta.env.DEV is true, AND
 * 2. host is strictly localhost or 127.0.0.1.
 * In ANY other environment or host, this MUST fail closed.
 */
export function isDevAuthBypassAllowed(isDev: boolean, host: string | null): boolean {
  if (!isDev) return false;
  if (!host) return false;

  const hostname = host.split(':')[0].toLowerCase().trim();
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

/**
 * Parses allowed admin emails from string (comma-separated) or array.
 */
export function parseAllowedEmails(
  adminEmails?: string | string[],
  adminEmail?: string
): string[] {
  const result: string[] = [];
  if (Array.isArray(adminEmails)) {
    result.push(...adminEmails);
  } else if (typeof adminEmails === 'string') {
    result.push(...adminEmails.split(','));
  }
  if (adminEmail) {
    result.push(...adminEmail.split(','));
  }
  return result
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Extracts the Cloudflare Access JWT assertion from either:
 * 1. The `Cf-Access-Jwt-Assertion` request header (injected by Cloudflare Access proxy).
 * 2. The `CF_Authorization` cookie (set by Cloudflare Access on client browser sessions).
 */
export function extractAccessJwt(
  requestOrHeaders?: Request | Headers | { headers?: Headers } | null
): string | null {
  if (!requestOrHeaders) return null;

  const headers: Headers | null =
    'headers' in requestOrHeaders && requestOrHeaders.headers instanceof Headers
      ? requestOrHeaders.headers
      : requestOrHeaders instanceof Headers
        ? requestOrHeaders
        : null;

  if (!headers) return null;

  const header = headers.get('Cf-Access-Jwt-Assertion');
  if (header && header.trim() !== '') {
    return header.trim();
  }

  const cookieHeader = headers.get('cookie') || headers.get('Cookie');
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
    if (match && match[1]) {
      const raw = match[1].replace(/^"|"$/g, '').trim();
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }

  return null;
}

/**
 * Fetches and imports the Cloudflare Access public key from JWKS (/cdn-cgi/access/certs).
 */
export async function getAccessPublicKey(
  teamDomain: string,
  kid?: string,
  fetchFn: typeof fetch = fetch
): Promise<CryptoKey | null> {
  const normalizedDomain = teamDomain
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
  const cacheKey = `${normalizedDomain}:${kid || 'default'}`;
  const cached = jwksKeyCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
    return cached.key;
  }

  try {
    const certsUrl = `https://${normalizedDomain}/cdn-cgi/access/certs`;
    const res = await fetchFn(certsUrl);
    if (!res.ok) {
      return null;
    }
    const data: any = await res.json();
    if (!data.keys || !Array.isArray(data.keys) || data.keys.length === 0) {
      return null;
    }

    const jwk = kid
      ? data.keys.find((k: any) => k.kid === kid)
      : data.keys[0];

    if (!jwk) return null;

    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );

    jwksKeyCache.set(cacheKey, { key: cryptoKey, cachedAt: now });
    return cryptoKey;
  } catch {
    return null;
  }
}

/**
 * Authenticates an incoming request using defense-in-depth principles.
 * Fails closed (authenticated: false) if required parameters are missing or invalid.
 */
export async function authenticateAdminRequest(
  context: AuthContext
): Promise<AuthResult> {
  const {
    isDev,
    host,
    jwtAssertion,
    cookieHeader,
    headers,
    adminEmails,
    adminEmail,
    devBypassAuth,
    expectedAud,
    teamDomain,
    publicKey,
    fetchFn = fetch,
  } = context;

  const allowedEmails = parseAllowedEmails(adminEmails, adminEmail);
  if (allowedEmails.length === 0) {
    return {
      authenticated: false,
      statusCode: 401,
      error: 'No admin emails configured in ADMIN_EMAILS',
    };
  }

  // 1. Check local development bypass
  if (devBypassAuth) {
    if (isDevAuthBypassAllowed(isDev, host)) {
      return {
        authenticated: true,
        email: allowedEmails[0],
      };
    }
    // Fail closed if bypass attempted on non-dev or non-localhost
    return {
      authenticated: false,
      statusCode: 401,
      error: 'DEV_BYPASS_AUTH rejected: Not on localhost in development mode',
    };
  }

  // 2. Production: Enforce presence of CF_ACCESS_AUD
  if (!expectedAud || expectedAud.trim() === '') {
    return {
      authenticated: false,
      statusCode: 401,
      error: 'Access authentication not configured: missing CF_ACCESS_AUD',
    };
  }

  // 3. Production: Enforce presence of team domain (unless publicKey explicitly injected for testing)
  if (!publicKey && (!teamDomain || teamDomain.trim() === '')) {
    return {
      authenticated: false,
      statusCode: 401,
      error: 'Access authentication not configured: missing CF_ACCESS_TEAM_DOMAIN',
    };
  }

  // 4. Production: Enforce presence of Cf-Access-Jwt-Assertion header or CF_Authorization cookie
  let token = jwtAssertion;
  if (!token && headers) {
    token = extractAccessJwt(headers);
  }
  if (!token && cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
    if (match && match[1]) {
      const raw = match[1].replace(/^"|"$/g, '').trim();
      try {
        token = decodeURIComponent(raw);
      } catch {
        token = raw;
      }
    }
  }

  if (!token || token.trim() === '') {
    return {
      authenticated: false,
      statusCode: 401,
      error: 'Missing Cf-Access-Jwt-Assertion header or CF_Authorization cookie',
    };
  }

  try {
    // Basic JWT structure check (header.payload.signature)
    const parts = token.split('.');
    if (parts.length !== 3) {
      return {
        authenticated: false,
        statusCode: 401,
        error: 'Malformed JWT assertion',
      };
    }

    // Decode header to check alg and kid
    const headerJson = decodeBase64UrlString(parts[0]);
    const header = JSON.parse(headerJson);

    // Strictly enforce RS256 algorithm
    if (header.alg !== 'RS256') {
      return {
        authenticated: false,
        statusCode: 401,
        error: `Unsupported JWT algorithm '${header.alg}': only RS256 is accepted`,
      };
    }

    // Resolve public key: either injected (tests) or retrieved from JWKS
    let keyToUse = publicKey;
    if (!keyToUse && teamDomain) {
      const fetchedKey = await getAccessPublicKey(teamDomain, header.kid, fetchFn);
      if (!fetchedKey) {
        return {
          authenticated: false,
          statusCode: 401,
          error: `Public key not found for kid '${header.kid || 'default'}' from Access certs`,
        };
      }
      keyToUse = fetchedKey;
    }

    if (!keyToUse) {
      return {
        authenticated: false,
        statusCode: 401,
        error: 'Public key not available for JWT verification',
      };
    }

    // Cryptographic signature verification using Web Crypto (RS256)
    const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const signatureBytes = base64UrlToUint8Array(parts[2]);
    const valid = await crypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5' },
      keyToUse,
      signatureBytes as unknown as BufferSource,
      data as unknown as BufferSource
    );
    if (!valid) {
      return {
        authenticated: false,
        statusCode: 401,
        error: 'Invalid JWT cryptographic signature',
      };
    }

    // Decode payload
    const payloadJson = decodeBase64UrlString(parts[1]);
    const payload = JSON.parse(payloadJson);

    // Verify expiration (REQUIRED: must exist, be a number, and be in the future)
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp === undefined || payload.exp === null || typeof payload.exp !== 'number') {
      return {
        authenticated: false,
        statusCode: 401,
        error: 'Missing required exp claim',
      };
    }
    if (payload.exp < now) {
      return {
        authenticated: false,
        statusCode: 401,
        error: 'JWT assertion expired',
      };
    }

    // Verify Issuer (REQUIRED: must exist and match https://<teamDomain>)
    if (!payload.iss || typeof payload.iss !== 'string' || payload.iss.trim() === '') {
      return {
        authenticated: false,
        statusCode: 401,
        error: 'Missing required iss claim',
      };
    }
    if (teamDomain) {
      const normalizedDomain = teamDomain
        .replace(/^https?:\/\//, '')
        .replace(/\/+$/, '');
      const expectedIss = `https://${normalizedDomain}`;
      if (payload.iss !== expectedIss) {
        return {
          authenticated: false,
          statusCode: 401,
          error: `Issuer mismatch: expected '${expectedIss}', got '${payload.iss}'`,
        };
      }
    }

    // Verify Audience (REQUIRED: must exist and match expectedAud)
    if (!payload.aud) {
      return {
        authenticated: false,
        statusCode: 401,
        error: 'Missing required aud claim',
      };
    }
    const tokenAuds: string[] = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (tokenAuds.length === 0 || !tokenAuds.some(Boolean) || !tokenAuds.includes(expectedAud)) {
      return {
        authenticated: false,
        statusCode: 401,
        error: (!tokenAuds.some(Boolean)) ? 'Missing required aud claim' : 'Audience mismatch',
      };
    }

    // Verify authorized admin email matches one of the allowed ADMIN_EMAILS
    if (!payload.email || !allowedEmails.includes(payload.email.toLowerCase())) {
      return {
        authenticated: false,
        statusCode: 403,
        error: `Unauthorized email address: ${payload.email}`,
      };
    }

    return {
      authenticated: true,
      email: payload.email,
    };
  } catch (err: any) {
    return {
      authenticated: false,
      statusCode: 401,
      error: `JWT parsing error: ${err?.message || 'Unknown error'}`,
    };
  }
}

/**
 * Decodes a base64url string into a UTF-8 string.
 */
function decodeBase64UrlString(base64Url: string): string {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  const padded = pad ? base64 + '='.repeat(4 - pad) : base64;
  return decodeURIComponent(
    atob(padded)
      .split('')
      .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join('')
  );
}

/**
 * Helper to convert base64url string to Uint8Array for Web Crypto APIs.
 */
export function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  const padded = pad ? base64 + '='.repeat(4 - pad) : base64;
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
