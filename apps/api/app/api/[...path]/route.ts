// Every /api/* request goes to the framework-free router in @stride/server.
import { handle } from '@stride/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function adapt(req: Request): Promise<Response> {
  const url = new URL(req.url);
  let body: unknown;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const type = req.headers.get('content-type') ?? '';
    const text = await req.text();
    if (text.length > 1_000_000) return Response.json({ error: { code: 'invalid', message: 'Requête trop volumineuse.' } }, { status: 413 });
    if (text) {
      if (!type.includes('application/json')) return Response.json({ error: { code: 'invalid', message: 'JSON attendu.' } }, { status: 415 });
      try {
        body = JSON.parse(text);
      } catch {
        return Response.json({ error: { code: 'invalid', message: 'JSON invalide.' } }, { status: 400 });
      }
    }
  }
  const res = await handle({
    method: req.method,
    path: url.pathname.replace(/^\/api/, '') || '/',
    query: url.searchParams,
    headers: req.headers,
    body,
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined,
  });
  const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...res.headers };
  if (res.redirect) return new Response(null, { status: 302, headers: { ...headers, location: res.redirect } });
  if (res.status === 204 || res.body === undefined) return new Response(null, { status: res.status, headers });
  return Response.json(res.body, { status: res.status, headers });
}

export { adapt as GET, adapt as POST, adapt as PATCH, adapt as DELETE };
