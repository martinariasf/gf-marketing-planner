import path from 'node:path'
import fs from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Serve ../clients/ at /data/* during dev so the React app can fetch
// the same paths it will hit in production (Caddy serves /data/* from
// /opt/marketing-planner/clients/).
function clientsDataPlugin(): Plugin {
  const clientsDir = path.resolve(__dirname, '..', 'clients')
  return {
    name: 'gf-clients-data',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith('/data/')) return next()
        const rel = decodeURIComponent(req.url.replace(/^\/data\//, '').split('?')[0])
        const filePath = path.join(clientsDir, rel)
        if (!filePath.startsWith(clientsDir)) {
          res.statusCode = 403
          return res.end('Forbidden')
        }
        fs.stat(filePath, (err, stat) => {
          if (err || !stat.isFile()) {
            res.statusCode = 404
            return res.end('Not found')
          }
          const ext = path.extname(filePath).toLowerCase()
          const mime: Record<string, string> = {
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.webp': 'image/webp',
            '.svg': 'image/svg+xml',
            '.txt': 'text/plain',
            '.log': 'text/plain',
          }
          res.setHeader('Content-Type', mime[ext] || 'application/octet-stream')
          res.setHeader('Cache-Control', 'no-store')
          fs.createReadStream(filePath).pipe(res)
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), clientsDataPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
})
