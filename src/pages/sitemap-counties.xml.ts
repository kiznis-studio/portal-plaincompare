import type { APIRoute } from 'astro';
import { getPopularComparisons, getAllCounties } from '../lib/db';

export const GET: APIRoute = async ({ site, locals }) => {
  const base = site?.href || 'https://plaincompare.com/';
  const db = (locals as any).runtime.env.DB;

  const [comparisons, counties] = await Promise.all([
    getPopularComparisons(db, 'county', 500),
    getAllCounties(db),
  ]);

  const urls: string[] = [];

  // Counties listing page
  urls.push(`${base}counties`);

  // Popular county comparisons
  for (const c of comparisons) {
    urls.push(`${base}compare/counties/${c.slug_a}-vs-${c.slug_b}`);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `  <url><loc>${url}</loc><changefreq>monthly</changefreq></url>`).join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
};
