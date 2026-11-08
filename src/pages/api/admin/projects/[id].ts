import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { resolveAdminAuth } from '../../../../lib/admin-request-auth';
import { ensureSiteCopyTables } from '../../../../lib/site-content';

export const prerender = false;
const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const editableFields = ['name', 'description'] as const;

export const PUT: APIRoute = async ({ params, request, locals }) => {
  const auth = await resolveAdminAuth(request, locals);
  if (!auth.authenticated) return Response.json({error:'Unauthorized'}, {status:401,headers});
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return Response.json({error:'Origin rejected'}, {status:403,headers});
  }
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return Response.json({error:'JSON required'}, {status:415,headers});
  }
  if (!env.DB) return Response.json({error:'Database unavailable'}, {status:503,headers});
  const id = params.id;
  if (!id || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
    return Response.json({error:'Invalid project ID'}, {status:400,headers});
  }
  if (Number(request.headers.get('content-length')) > 4096) {
    return Response.json({error:'Payload too large'}, {status:413,headers});
  }
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object') return Response.json({error:'Invalid JSON'}, {status:400,headers});
    const { field, value } = body as Record<string,unknown>;
    if (typeof field !== 'string' || !editableFields.includes(field as typeof editableFields[number])) {
      return Response.json({error:'Field is not editable'}, {status:400,headers});
    }
    if (typeof value !== 'string' || !value.trim() || new TextEncoder().encode(value).length > (field === 'name' ? 160 : 2000)) {
      return Response.json({error:'Invalid text or too long'}, {status:400,headers});
    }
    const existing = await env.DB.prepare('SELECT id, name, description FROM projects WHERE id = ?')
      .bind(id).first<{id:string;name:string;description:string}>();
    if (!existing) return Response.json({error:'Project not found'}, {status:404,headers});
    await ensureSiteCopyTables(env.DB);
    await env.DB.batch([
      env.DB.prepare(`UPDATE projects SET ${field} = ? WHERE id = ?`).bind(value,id),
      env.DB.prepare('INSERT INTO site_content_history (key,old_value,new_value,updated_by) VALUES (?,?,?,?)')
        .bind(`project.${id}.${field}`, existing[field as 'name' | 'description'], value, auth.email || 'admin'),
    ]);
    try {
      const { cache } = await import('cloudflare:workers');
      if (cache && typeof cache.purge === 'function') await cache.purge({tags:['home','projects']});
    } catch (error) { console.warn('[Project editor] Cache purge unavailable',error); }
    return Response.json({ok:true,id,field,value}, {headers});
  } catch (error) {
    console.error('[Project editor] Save failed',error);
    return Response.json({error:'Unable to save project'}, {status:500,headers});
  }
};
