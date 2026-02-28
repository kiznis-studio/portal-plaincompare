import type { APIRoute } from 'astro';
import { ImageResponse } from 'workers-og';
import { getLifeScore } from '../../../lib/db';
import { DIMENSION_LABELS, gradeColor } from '../../../lib/scores';
import type { Dimension } from '../../../lib/scores';
// @ts-ignore - handled by rawFonts vite plugin
import InterBoldData from '../../../assets/fonts/Inter-Bold.ttf';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  const slugPath = params.slug || '';
  const db = (locals as any).runtime.env.DB;

  const slug = slugPath.replace(/\.png$/, '').replace(/^states\//, '');
  if (!slug) return new Response('Not found', { status: 404 });

  const score = await getLifeScore(db, slug);
  if (!score) return new Response('Not found', { status: 404 });

  const gc = gradeColor(score.grade);
  const dims: Dimension[] = ['cost', 'wages', 'rent', 'crime', 'schools', 'childcare', 'enviro'];

  const dimHtml = dims.map(d => {
    const val = score[`${d}_score` as keyof typeof score] as number | null;
    const label = DIMENSION_LABELS[d];
    return `<div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
      <span style="font-size: 14px; color: #94a3b8;">${escapeHtml(label)}</span>
      <span style="font-size: 20px; font-weight: 700; color: #ffffff;">${val !== null ? Math.round(val) : '—'}</span>
    </div>`;
  }).join('');

  const typeLabel = score.type === 'state' ? 'State' : 'Metro';

  const html = `
    <div style="display: flex; flex-direction: column; width: 1200px; height: 630px; background: linear-gradient(135deg, #042f2e 0%, #134e4a 50%, #0f766e 100%); padding: 60px; font-family: Inter; color: #ffffff;">
      <div style="display: flex; align-items: center; margin-bottom: 24px;">
        <div style="width: 36px; height: 36px; border-radius: 8px; background: #0d9488; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 700; margin-right: 12px;">P</div>
        <span style="font-size: 24px; font-weight: 700; color: #0d9488;">PlainCompare</span>
        <span style="font-size: 18px; color: #94a3b8; margin-left: 12px;">Life Score</span>
      </div>
      <div style="font-size: 18px; color: #94a3b8; margin-bottom: 8px;">${typeLabel} Quality of Life Rating</div>
      <div style="font-size: ${score.name.length > 35 ? '36' : '44'}px; font-weight: 700; color: #ffffff; line-height: 1.2; margin-bottom: 24px;">${escapeHtml(score.name)}</div>
      <div style="display: flex; align-items: center; gap: 24px; margin-bottom: 40px;">
        <div style="width: 100px; height: 100px; border-radius: 24px; background: ${gc}22; display: flex; align-items: center; justify-content: center;">
          <span style="font-size: 48px; font-weight: 700; color: ${gc};">${escapeHtml(score.grade)}</span>
        </div>
        <div style="display: flex; flex-direction: column;">
          <span style="font-size: 56px; font-weight: 700; color: #ffffff;">${score.composite_score.toFixed(1)}</span>
          <span style="font-size: 18px; color: #94a3b8;">out of 100</span>
        </div>
      </div>
      <div style="display: flex; justify-content: space-between; margin-top: auto; padding: 16px 0; border-top: 1px solid rgba(255,255,255,0.1);">
        ${dimHtml}
      </div>
    </div>
  `;

  const response = new ImageResponse(html, {
    width: 1200,
    height: 630,
    fonts: [
      {
        name: 'Inter',
        data: InterBoldData,
        weight: 700,
        style: 'normal',
      },
    ],
  });
  response.headers.set('Cache-Control', 'public, max-age=86400, s-maxage=604800');
  return response;
};
