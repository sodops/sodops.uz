// Cloudflare Access JWT Authentication & Defense-in-Depth Verification
// For /admin/* and /api/admin/*

export interface AuthContext {
  isDev: boolean;
  host: string | null;
  jwtAssertion: string | null;
  adminEmail: string;
  expectedAud?: string;
  devBypassAuth?: boolean;
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
  const { isDev, host, jwtAssertion, adminEmail, devBypassAuth, expectedAud } = context;

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
    if (expectedAud && payload.aud && !payload.aud.includes(expectedAud)) {
      return {
        authenticated: false,
        error: 'Audience mismatch',
      };
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
