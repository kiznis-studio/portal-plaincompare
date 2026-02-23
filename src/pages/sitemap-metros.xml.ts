import type { APIRoute } from 'astro';
import { getAllMetros } from '../lib/db';

export const GET: APIRoute = async ({ locals, site }) => {
  const base = site?.href || 'https://plaincompare.com/';
  const db = locals.runtime.env.DB;
  const metros = await getAllMetros(db);

  const urls = metros.map(m =>
    `  <url><loc>${base}search?q=${encodeURIComponent(m.name.split(',')[0])}</loc><changefreq>monthly</changefreq></url>`
  ).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
};
