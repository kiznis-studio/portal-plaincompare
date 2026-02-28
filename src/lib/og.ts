import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let fontData: ArrayBuffer | null = null;

function getFont(): ArrayBuffer {
  if (!fontData) {
    const fontPath = join(process.cwd(), 'src', 'assets', 'fonts', 'Inter-Bold.ttf');
    const buffer = readFileSync(fontPath);
    fontData = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  }
  return fontData;
}

export async function renderOgImage(element: any): Promise<Response> {
  const svg = await satori(element, {
    width: 1200,
    height: 630,
    fonts: [
      {
        name: 'Inter',
        data: getFont(),
        weight: 700,
        style: 'normal',
      },
    ],
  });

  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } });
  const png = resvg.render().asPng();

  return new Response(png, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400, s-maxage=604800',
    },
  });
}
