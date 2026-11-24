import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { minify } from 'html-minifier-terser';

const outDir = resolve(import.meta.dirname, 'build');

// Keep the production HTML in the same shape the old webpack build produced:
// a classic <script> at the end of <body>, a plain stylesheet <link> at the end
// of <head>, relative asset URLs, and html-webpack-plugin's minifier defaults.
function legacyHtml() {
  return {
    name: 'legacy-html',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      async handler(html) {
        let script = '';
        let style = '';
        html = html
          .replace(/\s*<script type="module" crossorigin src="\/([^"]+)"><\/script>/, (_, src) => {
            script = `<script src="${src}"></script>`;
            return '';
          })
          .replace(/\s*<link rel="stylesheet" crossorigin href="\/([^"]+)">/, (_, href) => {
            style = `<link href="${href}" rel="stylesheet">`;
            return '';
          });
        if (!script || !style) {
          throw new Error('legacy-html: expected Vite to inject one script and one stylesheet');
        }
        html = html
          .replace('</head>', `${style}</head>`)
          .replace('<!-- Cloudflare Web Analytics -->', `${script}<!-- Cloudflare Web Analytics -->`);

        return minify(html, {
          collapseWhitespace: true,
          keepClosingSlash: true,
          removeComments: true,
          removeRedundantAttributes: true,
          removeScriptTypeAttributes: true,
          removeStyleLinkTypeAttributes: true,
          useShortDoctype: true,
        });
      },
    },
  };
}

// The old build also served the hero image at /assets/images/; keep that URL alive.
function legacyHeroCopy() {
  return {
    name: 'legacy-hero-copy',
    apply: 'build',
    async closeBundle() {
      await mkdir(resolve(outDir, 'assets/images'), { recursive: true });
      await copyFile(
        resolve(outDir, 'src/assets/images/hero_image.jpg'),
        resolve(outDir, 'assets/images/hero_image.jpg'),
      );
    },
  };
}

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  build: {
    outDir,
    emptyOutDir: true,
    sourcemap: true,
    modulePreload: false,
    // Keep classic CSS syntax (e.g. `min-width` media queries) for older Safari.
    cssTarget: ['chrome87', 'edge88', 'firefox78', 'safari14'],
    rolldownOptions: {
      output: {
        entryFileNames: 'js/app.[hash:8].js',
        assetFileNames: ({ names }) =>
          names.some((n) => n.endsWith('.css')) ? 'bundle.css' : 'assets/[name]-[hash][extname]',
      },
    },
  },
  plugins: [legacyHtml(), legacyHeroCopy()],
});
