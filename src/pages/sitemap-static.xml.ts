import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ site }) => {
  const base = site?.href || 'https://plaincompare.com/';
  const pages = ['', 'metros', 'states', 'rankings', 'rankings/cheapest-metros', 'rankings/safest-states', 'rankings/highest-paying', 'rankings/best-schools', 'rankings/cheapest-childcare', 'rankings/cleanest-environment', 'search', 'about', 'privacy', 'terms'];
  const urls = pages.map(p => `  <url><loc>${base}${p}</loc><changefreq>weekly</changefreq></url>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
};
