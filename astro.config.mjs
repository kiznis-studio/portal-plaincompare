import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';

function rawFonts(ext) {
  return {
    name: 'vite-plugin-raw-fonts',
    transform(_, id) {
      if (ext.some(e => id.endsWith(e))) {
        const buffer = fs.readFileSync(id);
        return { code: `export default new Uint8Array([${buffer.join(',')}]).buffer`, map: null };
      }
    },
  };
}

export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    platformProxy: { enabled: true },
  }),
  site: 'https://plaincompare.com',
  vite: {
    plugins: [tailwindcss(), rawFonts(['.ttf'])],
  },
  assetsInclude: ['**/*.wasm'],
});
