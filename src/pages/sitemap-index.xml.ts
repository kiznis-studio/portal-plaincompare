import type { APIRoute } from 'astro';

const BASE = 'https://plaincompare.com';

export const GET: APIRoute = async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${BASE}/sitemap-static.xml</loc></sitemap>
  <sitemap><loc>${BASE}/sitemap-metros.xml</loc></sitemap>
  <sitemap><loc>${BASE}/sitemap-states.xml</loc></sitemap>
  <sitemap><loc>${BASE}/sitemap-comparisons.xml</loc></sitemap>
  <sitemap><loc>${BASE}/sitemap-counties.xml</loc></sitemap>
  <sitemap><loc>${BASE}/sitemap-scores.xml</loc></sitemap>
</sitemapindex>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
};
