import type { APIRoute } from 'astro';
import { searchCounties } from '../../lib/db';

export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim() || '';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);

  if (q.length < 2) {
    return new Response(JSON.stringify({ counties: [] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const db = (locals as any).runtime.env.DB;
  const counties = await searchCounties(db, q, limit);

  return new Response(JSON.stringify({ counties }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
    },
  });
};
