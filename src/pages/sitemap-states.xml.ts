import type { APIRoute } from 'astro';
import { getAllStates } from '../lib/db';

export const GET: APIRoute = async ({ locals }) => {
  const db = locals.runtime.env.DB;
  const states = await getAllStates(db);

  const urls = states.map(s =>
    `  <url><loc>${BASE}/search?q=${encodeURIComponent(s.name)}&amp;type=state</loc><changefreq>monthly</changefreq></url>`
  ).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
};
