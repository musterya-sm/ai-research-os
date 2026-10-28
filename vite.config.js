import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// arXiv's export API does not send CORS headers, so route it (and Semantic Scholar) through the dev
// server. /api goes to the sync server (npm run server).
const proxy = {
  '/arxiv': { target: 'https://export.arxiv.org', changeOrigin: true, rewrite: p => p.replace(/^\/arxiv/, '/api') },
  '/s2': { target: 'https://api.semanticscholar.org', changeOrigin: true, rewrite: p => p.replace(/^\/s2/, '') },
  '/api': { target: 'http://localhost:5190' },
}
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    proxy,
  },
  preview: {
    port: 5180,
    proxy,
  },
})
