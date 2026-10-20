import { execFileSync } from 'node:child_process';
import { defineConfig, type Plugin } from 'vite';

const LOADER_ATTR = 'data-balls-analytics-loader';

function analyticsLoaderPlugin(): Plugin {
  return {
    name: 'cat-balls-analytics-loader',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        if (html.includes(LOADER_ATTR)) return html;
        const loader = execFileSync('node', ['scripts/analytics-loader.mjs'], {
          encoding: 'utf-8',
        }).trim();
        if (!loader.includes(LOADER_ATTR)) {
          throw new Error(`analytics loader did not emit ${LOADER_ATTR}`);
        }
        return html.replace('</head>', `    ${loader}\n  </head>`);
      },
    },
  };
}

export default defineConfig({
  plugins: [analyticsLoaderPlugin()],
  base: './',
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    environment: 'node',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*',
      'scripts/analytics.test.mjs',
    ],
  },
});
