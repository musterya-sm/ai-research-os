// AI Research OS sync server — zero dependencies (Node 20+).
// Accounts, shared workspaces with roles, PDF storage, live updates (SSE), arXiv / Semantic Scholar
// proxies, and static hosting of the built app. Data lives in JSON files under DATA_DIR.
import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import { existsSync, createReadStream } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT) || 5190
const DATA = process.env.DATA_DIR || path.join(here, 'data')
const DIST = path.join(here, '..', 'dist')
const WRITERS = ['Owner', 'Editor']
const ROLES = ['Editor', 'Commenter', 'Viewer']

await fs.mkdir(path.join(DATA, 'ws'), { recursive: true })
await fs.mkdir(path.join(DATA, 'pdf'), { recursive: true })

// ---- tiny JSON "database" ---------------------------------------------------------------
const DB_FILE = path.join(DATA, 'db.json')
const db = existsSync(DB_FILE) ? JSON.parse(await fs.readFile(DB_FILE, 'utf8')) : { users: {}, sessions: {}, workspaces: {} }
let saving = Promise.resolve()
// Serialised atomic writes: write a temp file, then rename over the original.
const writeJson = (file, data) => (saving = saving.then(async () => { const tmp = `${file}.${process.pid}.tmp`; await fs.writeFile(tmp, JSON.stringify(data)); await fs.rename(tmp, file) }))
const saveDb = () => writeJson(DB_FILE, db)
const wsFile = id => path.join(DATA, 'ws', `${id}.json`)
const pdfFile = (ws, pid) => path.join(DATA, 'pdf', ws, crypto.createHash('sha256').update(pid).digest('hex') + '.json')

const sha = s => crypto.createHash('sha256').update(s).digest('hex')
const newId = (n = 12) => crypto.randomBytes(n).toString('base64url')
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex')
const userByEmail = email => Object.values(db.users).find(u => u.email === email)
const pubUser = u => ({ id: u.id, email: u.email, name: u.name })

// ---- http helpers -----------------------------------------------------------------------
const send = (res, code, body, headers = {}) => {
  res.writeHead(code, { 'content-type': 'application/json', ...headers })
  res.end(body === undefined ? '' : JSON.stringify(body))
}
class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code } }
const fail = (code, msg) => { throw new HttpError(code, msg) }

async function readJson(req, limit) {
  let size = 0
  const chunks = []
  for await (const c of req) { size += c.length; if (size > limit) fail(413, 'Request too large'); chunks.push(c) }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { fail(400, 'Invalid JSON') }
}

function authUser(req, url) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '') || url.searchParams.get('token') || ''
  const s = token && db.sessions[sha(token)]
  const u = s && db.users[s.userId]
  if (!u) fail(401, 'Not signed in')
  return u
}

function membership(wsId, user) {
  const ws = db.workspaces[wsId]
  if (!ws) fail(404, 'Workspace not found')
  const m = ws.members.find(m => m.email === user.email)
  if (!m) fail(403, 'Not a member of this workspace')
  return { ws, role: m.role }
}

// Basic brute-force protection on auth endpoints: 20 attempts per IP per 10 minutes.
const attempts = new Map()
function throttle(req) {
  const ip = req.socket.remoteAddress, now = Date.now()
  const a = (attempts.get(ip) || []).filter(t => now - t < 6e5)
  if (a.length >= 20) fail(429, 'Too many attempts, try again later')
  attempts.set(ip, [...a, now])
}

// ---- live updates -----------------------------------------------------------------------
const streams = new Map() // wsId -> Set<res>
function broadcast(wsId, event) {
  for (const res of streams.get(wsId) || []) res.write(`data: ${JSON.stringify(event)}\n\n`)
}

const wsSummary = (ws, email) => ({ id: ws.id, name: ws.name, version: ws.version, updatedAt: ws.updatedAt, role: ws.members.find(m => m.email === email)?.role })
const membersOut = ws => ws.members.map(m => { const u = userByEmail(m.email); return { email: m.email, role: m.role, name: u?.name || m.email, joined: !!u } })

// ---- routes -----------------------------------------------------------------------------
async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1) // drop "api"
  const M = req.method

  if (parts[0] === 'auth') {
    if (M !== 'POST') fail(405, 'Method not allowed')
    if (parts[1] === 'logout') { const t = (req.headers.authorization || '').replace(/^Bearer /, ''); delete db.sessions[sha(t)]; await saveDb(); return send(res, 204) }
    throttle(req)
    const b = await readJson(req, 10_000)
    const email = String(b.email || '').trim().toLowerCase(), pw = String(b.password || '')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(400, 'Enter a valid email')
    let user
    if (parts[1] === 'signup') {
      if (pw.length < 8) fail(400, 'Password must be at least 8 characters')
      if (userByEmail(email)) fail(409, 'An account with this email already exists')
      const salt = newId(16)
      user = { id: newId(), email, name: String(b.name || email.split('@')[0]).slice(0, 80), salt, hash: hashPw(pw, salt), createdAt: Date.now() }
      db.users[user.id] = user
    } else if (parts[1] === 'login') {
      user = userByEmail(email)
      const ok = user && crypto.timingSafeEqual(Buffer.from(hashPw(pw, user.salt), 'hex'), Buffer.from(user.hash, 'hex'))
      if (!ok) fail(401, 'Wrong email or password')
    } else fail(404, 'Not found')
    const token = newId(32)
    db.sessions[sha(token)] = { userId: user.id, at: Date.now() }
    await saveDb()
    return send(res, 200, { token, user: pubUser(user) })
  }

  const user = authUser(req, url)

  if (parts[0] === 'me' && M === 'GET') {
    const workspaces = Object.values(db.workspaces).filter(w => w.members.some(m => m.email === user.email)).map(w => wsSummary(w, user.email))
    return send(res, 200, { user: pubUser(user), workspaces })
  }

  if (parts[0] !== 'workspaces') fail(404, 'Not found')

  if (parts.length === 1 && M === 'POST') {
    const b = await readJson(req, 25e6)
    const ws = { id: newId(9), name: String(b.name || 'My workspace').slice(0, 80), owner: user.id, members: [{ email: user.email, role: 'Owner' }], version: 1, updatedAt: Date.now() }
    db.workspaces[ws.id] = ws
    await writeJson(wsFile(ws.id), b.doc && typeof b.doc === 'object' ? b.doc : {})
    await saveDb()
    return send(res, 201, wsSummary(ws, user.email))
  }

  const wsId = parts[1]
  if (!/^[\w-]{6,20}$/.test(wsId || '')) fail(404, 'Not found')
  const { ws, role } = membership(wsId, user)
  const sub = parts[2]

  if (!sub && M === 'GET') {
    const doc = JSON.parse(await fs.readFile(wsFile(ws.id), 'utf8').catch(() => '{}'))
    return send(res, 200, { ...wsSummary(ws, user.email), doc, members: membersOut(ws) })
  }
  if (!sub && M === 'PATCH') {
    if (role !== 'Owner') fail(403, 'Only the owner can rename the workspace')
    const b = await readJson(req, 10_000)
    ws.name = String(b.name || ws.name).slice(0, 80); await saveDb()
    return send(res, 200, wsSummary(ws, user.email))
  }

  if (sub === 'doc' && M === 'PUT') {
    if (!WRITERS.includes(role)) fail(403, `${role}s can't edit this workspace`)
    const b = await readJson(req, 25e6)
    // Optimistic concurrency: the client must have merged the latest version first.
    if (b.baseVersion !== ws.version) {
      const doc = JSON.parse(await fs.readFile(wsFile(ws.id), 'utf8').catch(() => '{}'))
      return send(res, 409, { version: ws.version, doc })
    }
    if (!b.doc || typeof b.doc !== 'object') fail(400, 'Missing doc')
    await writeJson(wsFile(ws.id), b.doc)
    ws.version++; ws.updatedAt = Date.now(); await saveDb()
    broadcast(ws.id, { type: 'update', version: ws.version, by: user.name, client: String(b.client || '') })
    return send(res, 200, { version: ws.version })
  }

  if (sub === 'events' && M === 'GET') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
    res.write(`data: ${JSON.stringify({ type: 'hello', version: ws.version })}\n\n`)
    if (!streams.has(ws.id)) streams.set(ws.id, new Set())
    streams.get(ws.id).add(res)
    const ping = setInterval(() => res.write(': ping\n\n'), 25000)
    req.on('close', () => { clearInterval(ping); streams.get(ws.id)?.delete(res) })
    return
  }

  if (sub === 'members') {
    const email = decodeURIComponent(parts[3] || '').toLowerCase()
    if (M === 'GET') return send(res, 200, membersOut(ws))
    if (role !== 'Owner') fail(403, 'Only the owner can manage members')
    if (M === 'POST') {
      const b = await readJson(req, 10_000)
      const e = String(b.email || '').trim().toLowerCase()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) fail(400, 'Enter a valid email')
      if (ws.members.some(m => m.email === e)) fail(409, 'Already a member')
      ws.members.push({ email: e, role: ROLES.includes(b.role) ? b.role : 'Viewer' })
    } else if (M === 'PATCH') {
      const b = await readJson(req, 10_000)
      const m = ws.members.find(m => m.email === email)
      if (!m || m.role === 'Owner') fail(400, 'Cannot change this member')
      if (!ROLES.includes(b.role)) fail(400, 'Unknown role')
      m.role = b.role
    } else if (M === 'DELETE') {
      if (email === user.email) fail(400, 'The owner cannot be removed')
      ws.members = ws.members.filter(m => m.email !== email)
    } else fail(405, 'Method not allowed')
    await saveDb()
    broadcast(ws.id, { type: 'members' })
    return send(res, 200, membersOut(ws))
  }

  if (sub === 'pdfs') {
    const pid = decodeURIComponent(parts[3] || '')
    const dir = path.join(DATA, 'pdf', ws.id)
    if (!pid && M === 'GET') {
      const index = JSON.parse(await fs.readFile(path.join(dir, 'index.json'), 'utf8').catch(() => '[]'))
      return send(res, 200, index)
    }
    if (!pid || pid.length > 200) fail(400, 'Bad paper id')
    if (M === 'GET') {
      const f = pdfFile(ws.id, pid)
      if (!existsSync(f)) fail(404, 'No PDF stored for this paper')
      res.writeHead(200, { 'content-type': 'application/json' })
      return createReadStream(f).pipe(res)
    }
    if (M === 'PUT') {
      if (!WRITERS.includes(role)) fail(403, `${role}s can't upload files`)
      const b = await readJson(req, 80e6)
      if (typeof b.data !== 'string') fail(400, 'Missing data')
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(pdfFile(ws.id, pid), JSON.stringify({ name: String(b.name || 'paper.pdf'), pages: Number(b.pages) || 0, text: String(b.text || ''), data: b.data }))
      const idxFile = path.join(dir, 'index.json')
      const index = new Set(JSON.parse(await fs.readFile(idxFile, 'utf8').catch(() => '[]')))
      index.add(pid)
      await writeJson(idxFile, [...index])
      return send(res, 200, { ok: true })
    }
  }
  fail(404, 'Not found')
}

// Pass-through proxies so the built app works without the Vite dev server.
const PROXIES = { '/arxiv/': 'https://export.arxiv.org/api/', '/s2/': 'https://api.semanticscholar.org/' }
async function proxy(req, res, url, prefix) {
  const upstream = PROXIES[prefix] + url.pathname.slice(prefix.length) + url.search
  const key = req.headers['x-api-key']
  const r = await fetch(upstream, { headers: { 'user-agent': 'ai-research-os', ...(key ? { 'x-api-key': key } : {}) } })
  res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'text/plain' })
  res.end(Buffer.from(await r.arrayBuffer()))
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' }
async function serveStatic(res, url) {
  if (!existsSync(DIST)) return send(res, 404, { error: 'Build the app first: npm run build' })
  let file = path.normalize(path.join(DIST, decodeURIComponent(url.pathname)))
  if (file !== DIST && !file.startsWith(DIST + path.sep)) return send(res, 403, { error: 'Forbidden' })
  if (!existsSync(file) || (await fs.stat(file)).isDirectory()) file = path.join(DIST, 'index.html') // SPA fallback
  const ext = path.extname(file)
  res.writeHead(200, { 'content-type': TYPES[ext] || 'application/octet-stream', 'cache-control': file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache' })
  createReadStream(file).pipe(res)
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  // Bearer tokens (not cookies) authenticate requests, so permissive CORS doesn't enable CSRF.
  res.setHeader('access-control-allow-origin', '*')
  res.setHeader('access-control-allow-headers', 'authorization, content-type, x-api-key')
  res.setHeader('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  if (req.method === 'OPTIONS') return send(res, 204)
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url)
    const prefix = Object.keys(PROXIES).find(p => url.pathname.startsWith(p))
    if (prefix) return await proxy(req, res, url, prefix)
    return await serveStatic(res, url)
  } catch (e) {
    const known = e instanceof HttpError
    if (!res.headersSent) send(res, known ? e.code : 500, { error: known ? e.message : 'Server error' })
    if (!known) console.error(e)
  }
}).listen(PORT, () => console.log(`AI Research OS server on http://localhost:${PORT}`))
