import type { APIRoute } from 'astro';
import { getAllLifeScoreRankings } from '../lib/db';

export const prerender = false;

export const GET: APIRoute = async ({ site, locals }) => {
  const base = site?.href || 'https://plaincompare.com/';
  const db = (locals as any).runtime.env.DB;

  const [metros, states] = await Promise.all([
    getAllLifeScoreRankings(db, 'metro'),
    getAllLifeScoreRankings(db, 'state'),
  ]);

  const urls: string[] = [];
  urls.push(`${base}score`);
  urls.push(`${base}score/rankings`);

  for (const m of metros) {
    urls.push(`${base}score/${m.slug}`);
  }
  for (const s of states) {
    urls.push(`${base}score/states/${s.slug}`);
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
