import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
// The 235 infographics already live in ./inspironics/{thumbs,full}. Rather than
// duplicating ~48 MB into public/, serve that folder at /images in dev and copy
// it into dist/images at build time.
const IMAGE_SRC = path.join(ROOT, 'inspironics')

const MIME = {
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

function inspironicsImages() {
  return {
    name: 'inspironics-images',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith('/images/')) return next()
        const rel = decodeURIComponent(req.url.slice('/images/'.length).split('?')[0])
        const file = path.join(IMAGE_SRC, rel)
        if (!file.startsWith(IMAGE_SRC) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          return next()
        }
        res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream')
        res.setHeader('Cache-Control', 'public, max-age=3600')
        fs.createReadStream(file).pipe(res)
      })
    },
    closeBundle() {
      const out = path.join(ROOT, 'dist', 'images')
      for (const dir of ['thumbs', 'full']) {
        const from = path.join(IMAGE_SRC, dir)
        if (fs.existsSync(from)) fs.cpSync(from, path.join(out, dir), { recursive: true })
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), inspironicsImages()],
  server: { port: 5173, open: true },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          pdf: ['jspdf'],
          motion: ['framer-motion'],
        },
      },
    },
    chunkSizeWarningLimit: 1200,
  },
})
