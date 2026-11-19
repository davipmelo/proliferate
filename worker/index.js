/**
 * Proxy CORS simples para a API do MPCFill (Cloudflare Worker).
 * Repassa /2/* (ou /api-mpcfill/2/*) para https://mpcfill.com e adiciona cabeçalhos CORS.
 * Publicação: `npx wrangler deploy` na raiz do projeto (usa wrangler.json).
 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    const path = url.pathname.replace(/^\/api-mpcfill/, '');
    if (!path.startsWith('/2/')) {
      return new Response('Proliferate — proxy MPCFill ativo', {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', ...CORS },
      });
    }

    const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer();
    const upstream = await fetch('https://mpcfill.com' + path + url.search, {
      method: request.method,
      headers: {
        'Content-Type': request.headers.get('content-type') || 'application/json',
        Origin: 'https://mpcfill.com',
        Referer: 'https://mpcfill.com/editor',
      },
      body,
    });
    const headers = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
