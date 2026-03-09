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
      // GET/POST whole state
      server.middlewares.use('/api/data', (req, res, next) => {
        // Skip if this is a request to /api/data/spans*
        if (req.url && req.url.startsWith('/spans')) return next()
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

      // POST a new span: add to the spans array on disk
      // Usage: POST /api/data/spans  body: { id: "...", title: "...", ... }
      server.middlewares.use('/api/data/spans', (req, res, next) => {
        // Let PATCH requests through to the next handler
        if (req.method !== 'POST') return next()
        let body = ''
        req.on('data', (chunk: Buffer) => { body += chunk.toString() })
        req.on('end', () => {
          try {
            const newSpan = JSON.parse(body)
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'))
            data.spans.unshift(newSpan)
            fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8')
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true }))
          } catch {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'Invalid JSON' }))
          }
        })
      })

      // PATCH a single span: merge updates into the span on disk
      // Usage: PATCH /api/data/spans/:id  body: { subEvents: [...], title: "..." }
      server.middlewares.use('/api/data/spans/', (req, res) => {
        if (req.method !== 'PATCH') {
          res.statusCode = 405
          res.end()
          return
        }
        const spanId = req.url?.replace(/^\//, '') ?? ''
        if (!spanId) {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'Missing span ID' }))
          return
        }
        let body = ''
        req.on('data', (chunk: Buffer) => { body += chunk.toString() })
        req.on('end', () => {
          try {
            const updates = JSON.parse(body)
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'))
            const span = data.spans.find((s: { id: string }) => s.id === spanId)
            if (!span) {
              res.statusCode = 404
              res.end(JSON.stringify({ error: 'Span not found' }))
              return
            }
            Object.assign(span, updates)
            fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8')
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true }))
          } catch {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'Invalid JSON' }))
          }
        })
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
