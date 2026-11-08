import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { resolveAdminAuth } from '../../../lib/admin-request-auth';
import {
  SITE_COPY, isSiteCopyKey, validateSiteCopyInput,
  ensureSiteCopyTables, loadSiteCopy, setSiteCopy, resetSiteCopy,
} from '../../../lib/site-content';

export const prerender = false;
const jsonHeaders = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' };

function forbidden(): Response { return Response.json({error: 'Unauthorized'}, {status:401,headers:jsonHeaders}); }
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  return origin !== null && origin === new URL(request.url).origin;
}
async function purgeCopyCache() {
  try {
    const { cache } = await import('cloudflare:workers');
    if (cache && typeof cache.purge === 'function') {
      await cache.purge({ tags: ['home', 'blog', 'pages', 'projects'] });
    }
  } catch (error) { console.warn('[Visual Editor] Cache purge unavailable', error); }
}
async function authorize(request: Request, locals: App.Locals) {
  const auth = await resolveAdminAuth(request, locals);
  return auth.authenticated ? auth : null;
}
export const GET: APIRoute = async ({ request, locals }) => {
  if (!await authorize(request, locals)) return forbidden();
  if (!env.DB) return Response.json({error:'Database unavailable'}, {status:503,headers:jsonHeaders});
  const overrides = await loadSiteCopy(env.DB);
  return Response.json({defaults:SITE_COPY, overrides}, {headers:jsonHeaders});
};
export const PUT: APIRoute = async ({ request, locals }) => {
  const auth = await authorize(request, locals);
  if (!auth) return forbidden();
  if (!sameOrigin(request)) return Response.json({error:'Origin rejected'}, {status:403,headers:jsonHeaders});
  if (!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({error:'JSON required'}, {status:415,headers:jsonHeaders});
  if (!env.DB) return Response.json({error:'Database unavailable'}, {status:503,headers:jsonHeaders});
  const contentSize = Number(request.headers.get('content-length'));
  if (contentSize > 8192) return Response.json({error:'Payload too large'}, {status:413,headers:jsonHeaders});
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object') return Response.json({error:'Invalid payload'}, {status:400,headers:jsonHeaders});
    const { key, value } = body as { key: unknown; value: unknown };
    const problem = validateSiteCopyInput(key,value);
    if (problem) return Response.json({error:problem}, {status:400,headers:jsonHeaders});
    await setSiteCopy(env.DB, key as keyof typeof SITE_COPY, value as string, auth.email || 'admin');
    await purgeCopyCache();
    return Response.json({ok:true,key,value}, {headers:jsonHeaders});
  } catch (error) {
    console.error('[Visual Editor] Save failed',error);
    return Response.json({error:'Unable to save content'}, {status:500,headers:jsonHeaders});
  }
};
export const DELETE: APIRoute = async ({ request, locals }) => {
  const auth = await authorize(request, locals);
  if (!auth) return forbidden();
  if (!sameOrigin(request)) return Response.json({error:'Origin rejected'}, {status:403,headers:jsonHeaders});
  if (!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({error:'JSON required'}, {status:415,headers:jsonHeaders});
  if (!env.DB) return Response.json({error:'Database unavailable'}, {status:503,headers:jsonHeaders});
  try {
    const body: unknown = await request.json();
    const key = (body && typeof body === 'object' ? (body as {key?: unknown}).key : null);
    if (!isSiteCopyKey(key)) return Response.json({error:'Invalid field'}, {status:400,headers:jsonHeaders});
    await resetSiteCopy(env.DB, key, auth.email || 'admin');
    await purgeCopyCache();
    return Response.json({ok:true,key,value:SITE_COPY[key]}, {headers:jsonHeaders});
  } catch (error) {
    console.error('[Visual Editor] Reset failed',error);
    return Response.json({error:'Unable to reset content'}, {status:500,headers:jsonHeaders});
  }
};
