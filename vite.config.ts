import { defineConfig } from 'vite';

export default defineConfig({
  base: '/balls/',
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    environment: 'node',
  },
});
