import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// arXiv's export API does not send CORS headers, so route it through the dev server.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    proxy: { '/arxiv': { target: 'https://export.arxiv.org', changeOrigin: true, rewrite: p => p.replace(/^\/arxiv/, '/api') } },
  },
  preview: {
    port: 5180,
    proxy: { '/arxiv': { target: 'https://export.arxiv.org', changeOrigin: true, rewrite: p => p.replace(/^\/arxiv/, '/api') } },
  },
})
