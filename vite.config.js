import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

const USERS_FILE   = path.resolve('./data/users.json')
const INVITES_FILE = path.resolve('./data/invites.json')
const ROLES_FILE   = path.resolve('./data/roles.json')
const DATA_FILE    = path.resolve('./data/data.json')
const LOGS_FILE    = path.resolve('./data/logs.json')
const UPLOADS_DIR  = path.resolve('./data/uploads')

const MIME_TYPES = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif',  '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf', '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.odt': 'application/vnd.oasis.opendocument.text',
}

function makeApiPlugin() {
  const readJson = (file, fallback = '[]') => {
    try { return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : fallback }
    catch { return fallback }
  }
  const writeJson = (file, body, res) => {
    try {
      const tmp = file + '.tmp'
      fs.writeFileSync(tmp, body, 'utf-8')
      fs.renameSync(tmp, file)
      res.end('{"ok":true}')
    }
    catch { res.statusCode = 500; res.end('{"error":"write failed"}') }
  }
  const handle = (file, fallback = '[]') => (req, res) => {
    res.setHeader('Content-Type', 'application/json')
    if (req.method === 'GET') {
      res.end(readJson(file, fallback))
    } else if (req.method === 'POST') {
      let body = ''
      req.on('data', chunk => body += chunk)
      req.on('end', () => { writeJson(file, body, res) })
    } else {
      res.statusCode = 405; res.end('{"error":"method not allowed"}')
    }
  }
  return {
    name: 'koalitales-api',
    configureServer(server) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true })

      // ── Upload de fichiers ──
      server.middlewares.use('/api/upload', (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        if (req.method !== 'POST') { res.statusCode = 405; res.end('{"error":"method not allowed"}'); return }
        const rawName = req.headers['x-filename'] ? decodeURIComponent(req.headers['x-filename']) : 'file'
        const ext = path.extname(rawName).toLowerCase()
        const safeName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`
        const filePath = path.join(UPLOADS_DIR, safeName)
        const chunks = []
        req.on('data', chunk => chunks.push(chunk))
        req.on('end', () => {
          try {
            fs.writeFileSync(filePath, Buffer.concat(chunks))
            res.end(JSON.stringify({ ok: true, url: `/uploads/${safeName}`, originalName: rawName }))
          } catch { res.statusCode = 500; res.end('{"error":"upload failed"}') }
        })
      })

      // ── Suppression d'un fichier uploadé ──
      server.middlewares.use('/api/delete-upload', (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        if (req.method !== 'POST') { res.statusCode = 405; res.end('{"error":"method not allowed"}'); return }
        let body = ''
        req.on('data', chunk => body += chunk)
        req.on('end', () => {
          try {
            const { filename } = JSON.parse(body)
            const safePath = path.join(UPLOADS_DIR, path.basename(filename))
            if (fs.existsSync(safePath)) fs.unlinkSync(safePath)
            res.end('{"ok":true}')
          } catch { res.statusCode = 500; res.end('{"error":"delete failed"}') }
        })
      })

      // ── Serve des fichiers uploadés ──
      server.middlewares.use('/uploads', (req, res) => {
        const filename = req.url.replace(/^\//, '').split('?')[0]
        const filePath = path.join(UPLOADS_DIR, path.basename(filename))
        if (!fs.existsSync(filePath)) { res.statusCode = 404; res.end('Not found'); return }
        const ext = path.extname(filename).toLowerCase()
        res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream')
        res.setHeader('Cache-Control', 'public, max-age=31536000')
        res.end(fs.readFileSync(filePath))
      })

      server.middlewares.use('/api/users',   handle(USERS_FILE))
      server.middlewares.use('/api/invites', handle(INVITES_FILE))
      server.middlewares.use('/api/roles',   handle(ROLES_FILE))
      server.middlewares.use('/api/data',    handle(DATA_FILE, 'null'))
      server.middlewares.use('/api/logs',    handle(LOGS_FILE))
    }
  }
}

export default defineConfig({
  plugins: [react(), makeApiPlugin()],
  server: {
    host: '0.0.0.0',
    port: 80,
  },
})
