import type { APIRoute } from 'astro';
import { getLifeScore } from '../../../lib/db';
import { DIMENSION_LABELS, gradeColor } from '../../../lib/scores';
import type { Dimension } from '../../../lib/scores';
import { renderOgImage } from '../../../lib/og';

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

  const dimElements = dims.map(d => {
    const val = score[`${d}_score` as keyof typeof score] as number | null;
    const label = DIMENSION_LABELS[d];
    return {
      type: 'div',
      props: {
        style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' },
        children: [
          { type: 'span', props: { style: { fontSize: '14px', color: '#94a3b8' }, children: label } },
          { type: 'span', props: { style: { fontSize: '20px', fontWeight: 700, color: '#ffffff' }, children: val !== null ? String(Math.round(val)) : '—' } },
        ],
      },
    };
  });

  const typeLabel = score.type === 'state' ? 'State' : 'Metro';
  const titleSize = score.name.length > 35 ? 36 : 44;

  const element = {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: '1200px',
        height: '630px',
        background: 'linear-gradient(135deg, #042f2e 0%, #134e4a 50%, #0f766e 100%)',
        padding: '60px',
        fontFamily: 'Inter',
        color: '#ffffff',
      },
      children: [
        {
          type: 'div',
          props: {
            style: { display: 'flex', alignItems: 'center', marginBottom: '24px' },
            children: [
              {
                type: 'div',
                props: {
                  style: { width: '36px', height: '36px', borderRadius: '8px', background: '#0d9488', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 700, marginRight: '12px' },
                  children: 'P',
                },
              },
              { type: 'span', props: { style: { fontSize: '24px', fontWeight: 700, color: '#0d9488' }, children: 'PlainCompare' } },
              { type: 'span', props: { style: { fontSize: '18px', color: '#94a3b8', marginLeft: '12px' }, children: 'Life Score' } },
            ],
          },
        },
        { type: 'div', props: { style: { fontSize: '18px', color: '#94a3b8', marginBottom: '8px' }, children: `${typeLabel} Quality of Life Rating` } },
        { type: 'div', props: { style: { fontSize: `${titleSize}px`, fontWeight: 700, color: '#ffffff', lineHeight: 1.2, marginBottom: '24px' }, children: score.name } },
        {
          type: 'div',
          props: {
            style: { display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '40px' },
            children: [
              {
                type: 'div',
                props: {
                  style: { width: '100px', height: '100px', borderRadius: '24px', background: `${gc}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' },
                  children: [
                    { type: 'span', props: { style: { fontSize: '48px', fontWeight: 700, color: gc }, children: score.grade } },
                  ],
                },
              },
              {
                type: 'div',
                props: {
                  style: { display: 'flex', flexDirection: 'column' },
                  children: [
                    { type: 'span', props: { style: { fontSize: '56px', fontWeight: 700, color: '#ffffff' }, children: score.composite_score.toFixed(1) } },
                    { type: 'span', props: { style: { fontSize: '18px', color: '#94a3b8' }, children: 'out of 100' } },
                  ],
                },
              },
            ],
          },
        },
        {
          type: 'div',
          props: {
            style: { display: 'flex', justifyContent: 'space-between', marginTop: 'auto', padding: '16px 0', borderTop: '1px solid rgba(255,255,255,0.1)' },
            children: dimElements,
          },
        },
      ],
    },
  };

  return renderOgImage(element);
};
