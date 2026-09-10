import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/TraderGame/' : '/',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
});
