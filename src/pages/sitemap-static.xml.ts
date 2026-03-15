import type { APIRoute } from 'astro';

const BASE = 'https://plaincompare.com';

export const GET: APIRoute = async () => {
  const pages = [
    '/', '/metros', '/states', '/counties', '/rankings',
    '/rankings/cheapest-metros', '/rankings/safest-states', '/rankings/highest-paying',
    '/rankings/best-schools', '/rankings/cheapest-childcare', '/rankings/cleanest-environment',
    '/search', '/about', '/privacy', '/terms',
    '/guides', '/guides/how-to-compare-cities', '/guides/what-metro-data-tells-you',
    '/guides/data-driven-relocation', '/guides/how-to-use-data-for-relocation-decisions',
    '/guides/fastest-growing-metros-in-america',
  ];
  const urls = pages.map(p => `  <url><loc>${BASE}${p}</loc><changefreq>weekly</changefreq></url>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
};
