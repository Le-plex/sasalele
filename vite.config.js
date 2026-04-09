import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import https from 'https'
import { execFile } from 'child_process'
import os from 'os'

const IS_WINDOWS = process.platform === 'win32'

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
        const buf = fs.readFileSync(filePath)
        res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream')
        res.setHeader('Content-Length', buf.length)
        res.setHeader('Cache-Control', 'public, max-age=31536000')
        res.end(buf)
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
            const parsed = JSON.parse(body)
            const { event, username, docType, ref } = parsed
            const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || ''
            let msg = ''
            if (event === 'login_ok')     msg = `🌐 Site — Connexion\n👤 ${username}\n🌐 IP : ${ip}`
            else if (event === 'login_fail') msg = `⚠️ Site — Tentative ratée\n👤 ${username}\n🌐 IP : ${ip}`
            else if (event === 'logout')  msg = `🌐 Site — Déconnexion\n👤 ${username}\n🌐 IP : ${ip}`
            else if (event === 'doc_print') msg = `🖨️ Sasalele — Document généré\n📄 ${docType || '?'}\n📋 ${ref || '—'}\n👤 ${username || '?'}`
            if (msg && !IS_WINDOWS && fs.existsSync('/usr/local/bin/tg-notify'))
              execFile('/usr/local/bin/tg-notify', [msg, event === 'doc_print' ? '' : ip], () => {})
            res.end('{"ok":true}')
          } catch { res.statusCode = 400; res.end('{"error":"bad request"}') }
        })
      })

      // ── Export sauvegarde (.tar.gz du dossier data/) ──
      server.middlewares.use('/api/export', (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        if (req.method !== 'GET') { res.statusCode = 405; res.end('{"error":"method not allowed"}'); return }
        const date = new Date().toISOString().split('T')[0]
        const tmpFile = path.join(os.tmpdir(), `sasalele-export-${Date.now()}.tar.gz`)
        const serveName = `sasalele-backup-${date}-${Date.now()}.tar.gz`
        const servePath = path.join(UPLOADS_DIR, serveName)
        execFile('tar', ['-czf', tmpFile, 'data'], { cwd: path.resolve('.') }, (err) => {
          if (err) { res.statusCode = 500; res.end(JSON.stringify({ error: 'tar failed: ' + err.message })); return }
          try {
            fs.copyFileSync(tmpFile, servePath)
            fs.unlinkSync(tmpFile)
            // Suppression automatique après 5 minutes
            setTimeout(() => { try { fs.unlinkSync(servePath) } catch {} }, 5 * 60 * 1000)
            res.end(JSON.stringify({ ok: true, url: `/uploads/${serveName}` }))
          } catch (e) {
            res.statusCode = 500; res.end(JSON.stringify({ error: e.message }))
          }
        })
      })

      // ── Import sauvegarde ──
      server.middlewares.use('/api/import', (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        if (req.method !== 'POST') { res.statusCode = 405; res.end('{"error":"method not allowed"}'); return }
        const chunks = []
        req.on('data', chunk => chunks.push(chunk))
        req.on('end', () => {
          const tmpFile = path.join(os.tmpdir(), `sasalele-import-${Date.now()}.tar.gz`)
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

      // ── Réinitialisation complète (Panic Button) ──
      server.middlewares.use('/api/reset', (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        if (req.method !== 'POST') { res.statusCode = 405; res.end('{"error":"method not allowed"}'); return }
        let body = ''
        req.on('data', chunk => body += chunk)
        req.on('end', () => {
          try {
            const { assocName } = JSON.parse(body)
            if (!assocName) { res.statusCode = 400; res.end('{"error":"Nom manquant"}'); return }
            // Vérifier que le nom correspond à celui stocké
            const data = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) : null
            const realName = data?.assoc?.name || ''
            if (assocName.trim() !== realName.trim()) {
              res.statusCode = 403; res.end(JSON.stringify({ error: 'Nom incorrect' })); return
            }
            // Réinitialiser tous les fichiers JSON
            const writeJson = (file, content) => {
              const tmp = file + '.tmp'
              fs.writeFileSync(tmp, content, 'utf-8')
              fs.renameSync(tmp, file)
            }
            writeJson(DATA_FILE, 'null')
            writeJson(USERS_FILE, '[]')
            writeJson(INVITES_FILE, '[]')
            writeJson(ROLES_FILE, '[]')
            writeJson(LOGS_FILE, '[]')
            // Vider le dossier uploads
            if (fs.existsSync(UPLOADS_DIR)) {
              for (const f of fs.readdirSync(UPLOADS_DIR)) {
                try { fs.unlinkSync(path.join(UPLOADS_DIR, f)) } catch {}
              }
            }
            res.end('{"ok":true}')
          } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: e.message })) }
        })
      })

      // ── Vérification des mises à jour ──
      server.middlewares.use('/api/update-check', (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        if (req.method !== 'GET') { res.statusCode = 405; res.end('{"error":"method not allowed"}'); return }
        const cwd = path.resolve('.')
        execFile('git', ['fetch', 'origin'], { cwd }, (fetchErr) => {
          if (fetchErr) { res.statusCode = 500; res.end(JSON.stringify({ error: 'git fetch échoué — le repo est-il accessible ? ' + fetchErr.message })); return }
          execFile('git', ['rev-parse', 'HEAD'], { cwd }, (e1, localHash) => {
            execFile('git', ['rev-parse', 'origin/main'], { cwd }, (e2, remoteHash) => {
              if (e1 || e2) { res.statusCode = 500; res.end(JSON.stringify({ error: 'Impossible de lire les commits git' })); return }
              const local = localHash.trim()
              const remote = remoteHash.trim()
              if (local === remote) { res.end(JSON.stringify({ upToDate: true, current: local.slice(0, 7) })); return }
              execFile('git', ['log', `${local}..${remote}`, '--oneline', '--no-decorate'], { cwd }, (e3, log) => {
                const commits = (log || '').trim().split('\n').filter(Boolean).map(line => {
                  const [hash, ...rest] = line.split(' ')
                  return { hash, message: rest.join(' ') }
                })
                res.end(JSON.stringify({ upToDate: false, current: local.slice(0, 7), remote: remote.slice(0, 7), commits }))
              })
            })
          })
        })
      })

      // ── Application d'une mise à jour ──
      server.middlewares.use('/api/update-apply', (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        if (req.method !== 'POST') { res.statusCode = 405; res.end('{"error":"method not allowed"}'); return }
        const cwd = path.resolve('.')
        // Détecter ce qui va changer avant le pull
        execFile('git', ['diff', 'HEAD', 'origin/main', '--name-only'], { cwd }, (e0, changedFiles) => {
          const files = (changedFiles || '').trim().split('\n').filter(Boolean)
          const needsInstall = files.includes('package.json')
          const needsRestart = files.some(f => f === 'vite.config.js' || f === 'package.json')
          execFile('git', ['fetch', 'origin'], { cwd }, (fetchErr) => {
            if (fetchErr) { res.statusCode = 500; res.end(JSON.stringify({ error: 'git fetch échoué : ' + fetchErr.message })); return }
            execFile('git', ['reset', '--hard', 'origin/main'], { cwd }, (resetErr, resetOut) => {
              if (resetErr) { res.statusCode = 500; res.end(JSON.stringify({ error: 'git reset échoué : ' + resetErr.message })); return }
              const finish = () => {
                res.end(JSON.stringify({ ok: true, needsRestart, needsInstall, log: resetOut.trim() }))
                if (needsRestart && !IS_WINDOWS) {
                  setTimeout(() => execFile('systemctl', ['restart', 'sasalele'], { detached: true }, () => {}), 1500)
                }
              }
              if (needsInstall) {
                execFile('npm', ['install', '--silent'], { cwd }, () => finish())
              } else {
                finish()
              }
            })
          })
        })
      })

      server.middlewares.use('/api/users',   handle(USERS_FILE))
      server.middlewares.use('/api/invites', handle(INVITES_FILE))
      server.middlewares.use('/api/roles',   handle(ROLES_FILE))
      server.middlewares.use('/api/data',    handle(DATA_FILE, 'null'))

      // ── Journal d'activité + notification Telegram automatique ──
      server.middlewares.use('/api/logs', (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        if (req.method === 'GET') {
          res.end(readJson(LOGS_FILE))
        } else if (req.method === 'POST') {
          let body = ''
          req.on('data', chunk => body += chunk)
          req.on('end', () => {
            try {
              const incoming = JSON.parse(body)
              if (Array.isArray(incoming) && incoming.length > 0 && incoming[0]?.id) {
                let currentFirstId = null
                try {
                  const cur = JSON.parse(readJson(LOGS_FILE, '[]'))
                  if (Array.isArray(cur) && cur.length > 0) currentFirstId = cur[0]?.id
                } catch {}
                if (incoming[0].id !== currentFirstId && !IS_WINDOWS && fs.existsSync('/usr/local/bin/tg-notify')) {
                  const e = incoming[0]
                  const ICONS = { AJOUT: '✅', SUPPR: '🗑️', MODIF: '✏️', 'GÉNÈRE': '🖨️' }
                  const icon = ICONS[e.action] || '📋'
                  const msg = `${icon} Sasalele — ${e.action} ${e.target}\n👤 ${e.user || '?'}\n📝 ${e.details || '—'}`
                  execFile('/usr/local/bin/tg-notify', [msg], () => {})
                }
              }
              writeJson(LOGS_FILE, body, res)
            } catch { res.statusCode = 400; res.end('{"error":"bad request"}') }
          })
        } else {
          res.statusCode = 405; res.end('{"error":"method not allowed"}')
        }
      })
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
