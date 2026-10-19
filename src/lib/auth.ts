// Cloudflare Access JWT Authentication & Defense-in-Depth Verification
// For /admin/* and /api/admin/*

export interface AuthContext {
  isDev: boolean;
  host: string | null;
  jwtAssertion: string | null;
  adminEmail: string;
  expectedAud?: string;
  devBypassAuth?: boolean;
  publicKey?: CryptoKey;
}

export interface AuthResult {
  authenticated: boolean;
  email?: string;
  error?: string;
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
 * Authenticates an incoming request using defense-in-depth principles.
 */
export async function authenticateAdminRequest(
  context: AuthContext
): Promise<AuthResult> {
  const { isDev, host, jwtAssertion, adminEmail, devBypassAuth, expectedAud, publicKey } =
    context;

  if (!adminEmail) {
    return {
      authenticated: false,
      error: 'ADMIN_EMAIL is not configured in environment',
    };
  }

  // 1. Check local development bypass
  if (devBypassAuth) {
    if (isDevAuthBypassAllowed(isDev, host)) {
      return {
        authenticated: true,
        email: adminEmail,
      };
    }
    // Fail closed if bypass attempted on non-dev or non-localhost
    return {
      authenticated: false,
      error: 'DEV_BYPASS_AUTH rejected: Not on localhost in development mode',
    };
  }

  // 2. Production Cloudflare Access Assertion Check
  if (!jwtAssertion) {
    return {
      authenticated: false,
      error: 'Missing Cf-Access-Jwt-Assertion header',
    };
  }

  try {
    // Basic JWT structure check (header.payload.signature)
    const parts = jwtAssertion.split('.');
    if (parts.length !== 3) {
      return {
        authenticated: false,
        error: 'Malformed JWT assertion',
      };
    }

    // Cryptographic signature verification using Web Crypto (RS256)
    if (publicKey) {
      const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
      const signatureBytes = base64UrlToUint8Array(parts[2]);
      const valid = await crypto.subtle.verify(
        { name: 'RSASSA-PKCS1-v1_5' },
        publicKey,
        signatureBytes as unknown as BufferSource,
        data as unknown as BufferSource
      );
      if (!valid) {
        return {
          authenticated: false,
          error: 'Invalid JWT cryptographic signature',
        };
      }
    }

    // Decode payload
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const payload = JSON.parse(jsonPayload);

    // Verify expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return {
        authenticated: false,
        error: 'JWT assertion expired',
      };
    }

    // Verify Audience (if expectedAud configured)
    if (expectedAud && payload.aud) {
      const audMatches = Array.isArray(payload.aud)
        ? payload.aud.includes(expectedAud)
        : payload.aud === expectedAud;
      if (!audMatches) {
        return {
          authenticated: false,
          error: 'Audience mismatch',
        };
      }
    }

    // Verify authorized admin email matches ADMIN_EMAIL env var
    if (!payload.email || payload.email.toLowerCase() !== adminEmail.toLowerCase()) {
      return {
        authenticated: false,
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
      error: `JWT parsing error: ${err?.message || 'Unknown error'}`,
    };
  }
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
