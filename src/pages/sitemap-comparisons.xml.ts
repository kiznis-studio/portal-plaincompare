import type { APIRoute } from 'astro';
import { getPopularComparisons } from '../lib/db';

export const GET: APIRoute = async ({ locals }) => {
  const db = locals.runtime.env.DB;

  const [metroComps, stateComps] = await Promise.all([
    getPopularComparisons(db, 'metro', 5000),
    getPopularComparisons(db, 'state', 5000),
  ]);

  const metroUrls = metroComps.map(c =>
    `  <url><loc>${BASE}/compare/${c.slug_a}-vs-${c.slug_b}</loc><changefreq>monthly</changefreq></url>`
  );
  const stateUrls = stateComps.map(c =>
    `  <url><loc>${BASE}/compare/states/${c.slug_a}-vs-${c.slug_b}</loc><changefreq>monthly</changefreq></url>`
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${metroUrls.join('\n')}
${stateUrls.join('\n')}
</urlset>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
};
