import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import https from 'https'
import { execFile, spawn } from 'child_process'

const USERS_FILE   = path.resolve('./data/users.json')
const INVITES_FILE = path.resolve('./data/invites.json')
const ROLES_FILE   = path.resolve('./data/roles.json')
const DATA_FILE    = path.resolve('./data/data.json')
const LOGS_FILE    = path.resolve('./data/logs.json')
const UPLOADS_DIR  = path.resolve('./data/uploads')
const QONTO_FILE   = path.resolve('../qonto-secrets.json')  // Hors du dossier site/, hors scope fs.allow

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

      // ── Config Qonto (clé API stockée côté serveur uniquement) ──
      server.middlewares.use('/api/qonto-config', (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        if (req.method === 'GET') {
          try {
            const cfg = fs.existsSync(QONTO_FILE) ? JSON.parse(fs.readFileSync(QONTO_FILE, 'utf-8')) : {}
            res.end(JSON.stringify({ configured: !!(cfg.slug && cfg.key), slug: cfg.slug || '' }))
          } catch { res.end(JSON.stringify({ configured: false, slug: '' })) }
        } else if (req.method === 'POST') {
          let body = ''
          req.on('data', chunk => body += chunk)
          req.on('end', () => {
            try {
              const { slug, key } = JSON.parse(body)
              if (!slug || !key) { res.statusCode = 400; res.end('{"error":"slug et clé requis"}'); return }
              const tmp = QONTO_FILE + '.tmp'
              fs.writeFileSync(tmp, JSON.stringify({ slug: slug.trim(), key: key.trim() }), 'utf-8')
              fs.renameSync(tmp, QONTO_FILE)
              res.end('{"ok":true}')
            } catch { res.statusCode = 500; res.end('{"error":"write failed"}') }
          })
        } else { res.statusCode = 405; res.end('{"error":"method not allowed"}') }
      })

      // ── Synchronisation solde Qonto ──
      server.middlewares.use('/api/qonto-sync', (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        if (req.method !== 'POST') { res.statusCode = 405; res.end('{"error":"method not allowed"}'); return }
        try {
          const cfg = fs.existsSync(QONTO_FILE) ? JSON.parse(fs.readFileSync(QONTO_FILE, 'utf-8')) : {}
          if (!cfg.slug || !cfg.key) { res.statusCode = 400; res.end('{"error":"Qonto non configuré"}'); return }
          const authHeader = `${cfg.slug}:${cfg.key}`
          const options = {
            hostname: 'thirdparty.qonto.com',
            path: '/v2/organization',
            method: 'GET',
            headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
          }
          const req2 = https.request(options, (res2) => {
            let data = ''
            res2.on('data', chunk => data += chunk)
            res2.on('end', () => {
              try {
                if (res2.statusCode !== 200) {
                  res.statusCode = 502
                  res.end(JSON.stringify({ error: `Qonto API ${res2.statusCode}`, detail: data }))
                  return
                }
                const org = JSON.parse(data).organization
                const accounts = org?.bank_accounts || []
                const balance = accounts.reduce((sum, a) => sum + (a.balance || 0), 0)
                res.end(JSON.stringify({ ok: true, balance, accounts: accounts.length, syncedAt: new Date().toISOString() }))
              } catch (e) { res.statusCode = 502; res.end(JSON.stringify({ error: 'parse error', detail: e.message })) }
            })
          })
          req2.on('error', e => { res.statusCode = 502; res.end(JSON.stringify({ error: e.message })) })
          req2.end()
        } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: e.message })) }
      })

      // ── Notifications Telegram ──
      server.middlewares.use('/api/notify', (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        if (req.method !== 'POST') { res.statusCode = 405; res.end('{"error":"method not allowed"}'); return }
        let body = ''
        req.on('data', chunk => body += chunk)
        req.on('end', () => {
          try {
            const { event, username } = JSON.parse(body)
            const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || ''
            let msg = ''
            if (event === 'login_ok')     msg = `🌐 Site — Connexion\n👤 ${username}\n🌐 IP : ${ip}`
            else if (event === 'login_fail') msg = `⚠️ Site — Tentative ratée\n👤 ${username}\n🌐 IP : ${ip}`
            else if (event === 'logout')  msg = `🌐 Site — Déconnexion\n👤 ${username}\n🌐 IP : ${ip}`
            if (msg) execFile('/usr/local/bin/tg-notify', [msg, ip], () => {})
            res.end('{"ok":true}')
          } catch { res.statusCode = 400; res.end('{"error":"bad request"}') }
        })
      })

      // ── Export sauvegarde (.tar.gz du dossier data/) ──
      server.middlewares.use('/api/export', (req, res) => {
        if (req.method !== 'GET') { res.statusCode = 405; res.end('{"error":"method not allowed"}'); return }
        const date = new Date().toISOString().split('T')[0]
        const filename = `sasalele-backup-${date}.tar.gz`
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
        res.setHeader('Content-Type', 'application/gzip')
        const tar = spawn('tar', ['-czf', '-', 'data'], { cwd: path.resolve('.') })
        tar.stdout.pipe(res)
        tar.stderr.on('data', () => {})
        tar.on('error', () => { if (!res.headersSent) { res.statusCode = 500; res.end() } })
      })

      // ── Import sauvegarde ──
      server.middlewares.use('/api/import', (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        if (req.method !== 'POST') { res.statusCode = 405; res.end('{"error":"method not allowed"}'); return }
        const chunks = []
        req.on('data', chunk => chunks.push(chunk))
        req.on('end', () => {
          const tmpFile = path.join('/tmp', `sasalele-import-${Date.now()}.tar.gz`)
          try {
            fs.writeFileSync(tmpFile, Buffer.concat(chunks))
            // Validation : vérifier que data/data.json est présent dans l'archive
            execFile('tar', ['-tzf', tmpFile], (err, stdout) => {
              if (err) {
                try { fs.unlinkSync(tmpFile) } catch {}
                res.statusCode = 400
                res.end(JSON.stringify({ error: 'Archive invalide ou corrompue' }))
                return
              }
              const files = stdout.split('\n').map(f => f.trim())
              if (!files.some(f => f === 'data/data.json')) {
                try { fs.unlinkSync(tmpFile) } catch {}
                res.statusCode = 400
                res.end(JSON.stringify({ error: 'Archive invalide : data/data.json introuvable. Vérifiez que c\'est bien une sauvegarde Sasalele.' }))
                return
              }
              // Extraction dans le dossier courant (écrase data/)
              execFile('tar', ['-xzf', tmpFile, '-C', path.resolve('.')], (err2) => {
                try { fs.unlinkSync(tmpFile) } catch {}
                if (err2) {
                  res.statusCode = 500
                  res.end(JSON.stringify({ error: 'Erreur lors de l\'extraction : ' + err2.message }))
                  return
                }
                res.end(JSON.stringify({ ok: true }))
              })
            })
          } catch (e) {
            try { fs.unlinkSync(tmpFile) } catch {}
            res.statusCode = 500
            res.end(JSON.stringify({ error: e.message }))
          }
        })
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
    port: 3000,
    watch: {
      ignored: ['**/.git/**', '**/node_modules/**'],
    },
    fs: {
      allow: ['.'],
      deny: ['.bash_history', '.bashrc', '.profile', '.ssh', '.env', '.git', '.claude', '**/.git/**'],
    },
  },
})
