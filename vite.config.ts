import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { defineConfig, type Plugin } from 'vite';
import { timelineFileMiddleware } from './lib/timeline-server.mjs';

const timelinePath = fileURLToPath(new URL('./data/timeline.json', import.meta.url));
const [githubOwner, githubRepository] = (process.env.GITHUB_REPOSITORY ?? '').split('/');
const isAccountSite = githubRepository?.toLowerCase() === `${githubOwner}.github.io`.toLowerCase();
const githubPagesBase = process.env.GITHUB_ACTIONS === 'true' && githubRepository && !isAccountSite
  ? `/${githubRepository}/`
  : '/';

const liveTimeline: Plugin = {
  name: 'local-timeline-file',
  configureServer(server) {
    server.middlewares.use(timelineFileMiddleware(timelinePath));
  },
  configurePreviewServer(server) {
    server.middlewares.use(timelineFileMiddleware(timelinePath));
  },
  handleHotUpdate(context) {
    if (context.file.replaceAll('\\', '/') !== timelinePath.replaceAll('\\', '/')) return;
    context.server.ws.send({ type: 'custom', event: 'timeline:data-changed', data: {} });
    return [];
  },
  async generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'timeline.json',
      source: await readFile(timelinePath),
    });
  },
};

export default defineConfig({
  base: githubPagesBase,
  plugins: [react(), liveTimeline],
  css: { postcss: { plugins: [tailwindcss()] } },
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
    dedupe: ['react', 'react-dom'],
  },
  server: { host: 'localhost', port: 3000, strictPort: true },
  preview: { host: 'localhost', port: 3000, strictPort: true },
});
