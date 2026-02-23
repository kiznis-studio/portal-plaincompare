import type { APIRoute } from 'astro';
import { searchMetros, searchStates } from '../../lib/db';

export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim() || '';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);

  if (!q) {
    return new Response(JSON.stringify({ metros: [], states: [] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const db = locals.runtime.env.DB;
  const [metros, states] = await Promise.all([
    searchMetros(db, q, limit),
    searchStates(db, q, 10),
  ]);

  return new Response(JSON.stringify({ metros, states }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
