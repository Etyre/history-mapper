import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

const DATA_FILE = path.resolve(import.meta.dirname, 'data.json')

function dataApiPlugin(): Plugin {
  return {
    name: 'data-api',
    configureServer(server) {
      server.middlewares.use('/api/data', (req, res) => {
        if (req.method === 'GET') {
          try {
            const data = fs.readFileSync(DATA_FILE, 'utf-8')
            res.setHeader('Content-Type', 'application/json')
            res.end(data)
          } catch {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ spans: [] }))
          }
        } else if (req.method === 'POST') {
          let body = ''
          req.on('data', (chunk: Buffer) => { body += chunk.toString() })
          req.on('end', () => {
            try {
              JSON.parse(body) // validate
              fs.writeFileSync(DATA_FILE, body, 'utf-8')
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: true }))
            } catch {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Invalid JSON' }))
            }
          })
        } else {
          res.statusCode = 405
          res.end()
        }
      })
    },
  }
}

function fullReloadOnTsChange(): Plugin {
  return {
    name: 'full-reload-on-ts',
    handleHotUpdate({ file, server }) {
      // Force full reload for non-component .ts files
      if (file.endsWith('.ts') && !file.endsWith('.tsx')) {
        server.ws.send({ type: 'full-reload' })
        return []
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), dataApiPlugin(), fullReloadOnTsChange()],
})
