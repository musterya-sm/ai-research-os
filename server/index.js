// AI Research OS sync server — zero dependencies (Node 20+).
// Accounts, shared workspaces with roles, PDF storage, live updates (SSE), arXiv / Semantic Scholar
// proxies, and static hosting of the built app. Data lives in Postgres when DATABASE_URL is set,
// otherwise in JSON files under DATA_DIR (see storage.js).
import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import { existsSync, createReadStream } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openStorage } from './storage.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT) || 5190
const DATA = process.env.DATA_DIR || path.join(here, 'data')
const DIST = path.join(here, '..', 'dist')
const WRITERS = ['Owner', 'Editor']
const ROLES = ['Editor', 'Commenter', 'Viewer']

const store = await openStorage({ dir: DATA, url: process.env.DATABASE_URL })

// ---- tiny JSON "database" ---------------------------------------------------------------
const db = await store.getJson('db', { users: {}, sessions: {}, workspaces: {} })
// Membership is keyed by user id. Older files keyed it by email: keep only members whose account exists.
for (const ws of Object.values(db.workspaces)) {
  ws.members = ws.members.map(m => m.userId ? m : { userId: Object.values(db.users).find(u => u.email === m.email)?.id, role: m.role }).filter(m => m.userId)
  ws.invites ||= []
}
const saveDb = () => store.putJson('db', db)
const wsKey = id => `ws/${id}`
const pdfKey = (ws, pid) => `pdf/${ws}/${crypto.createHash('sha256').update(pid).digest('hex')}`
const readDoc = id => store.getJson(wsKey(id), {})

const sha = s => crypto.createHash('sha256').update(s).digest('hex')
const newId = (n = 12) => crypto.randomBytes(n).toString('base64url')
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex')
const userByEmail = email => email && Object.values(db.users).find(u => u.email === email)
const userByName = name => Object.values(db.users).find(u => u.username === name)
const USERNAME = /^[a-z0-9][a-z0-9_.-]{2,23}$/
const RESERVED = new Set(['admin', 'root', 'api', 'me', 'support', 'help', 'login', 'signup', 'settings', 'account', 'anthropic', 'openai', 'system'])
const freeUsername = base => { let b = (base.toLowerCase().replace(/[^a-z0-9_.-]/g, '') || 'user').replace(/^[^a-z0-9]+/, '').slice(0, 20).padEnd(3, '0'), n = 0, u = b; while (userByName(u) || RESERVED.has(u)) u = `${b}${++n}`; return u }
const AVATARS = ['#8b5cf6', '#d4f53c', '#3b82f6', '#f472b6', '#f59e0b', '#10b981', '#ef4444', '#0d0d0d']
const cleanProfile = (p = {}, old = {}) => ({
  bio: String(p.bio ?? old.bio ?? '').slice(0, 500),
  affiliation: String(p.affiliation ?? old.affiliation ?? '').slice(0, 120),
  interests: (Array.isArray(p.interests) ? p.interests : old.interests || []).map(x => String(x).trim().slice(0, 40)).filter(Boolean).slice(0, 12),
  avatar: AVATARS.includes(p.avatar) ? p.avatar : old.avatar || AVATARS[0],
  public: typeof p.public === 'boolean' ? p.public : !!old.public,
})
const pubUser = u => ({ id: u.id, username: u.username, email: u.email || '', name: u.name, profile: cleanProfile(u.profile), createdAt: u.createdAt })
const SESSION_TTL = 90 * 864e5
// Older accounts were email-only: give each a username derived from its email.
for (const u of Object.values(db.users)) { if (!u.username) u.username = freeUsername((u.email || 'user').split('@')[0]); u.profile = cleanProfile(u.profile) }
// Drop expired sessions on start.
for (const [k, v] of Object.entries(db.sessions)) if (Date.now() - v.at > SESSION_TTL) delete db.sessions[k]
await saveDb()

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

// Session tokens are accepted only from the Authorization header, never from URLs (which end up in logs).
function authUser(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '')
  const s = token && db.sessions[sha(token)]
  const u = s && Date.now() - s.at < SESSION_TTL && db.users[s.userId]
  if (!u) fail(401, 'Not signed in')
  return u
}

function membership(wsId, user) {
  const ws = db.workspaces[wsId]
  if (!ws) fail(404, 'Workspace not found')
  const m = ws.members.find(m => m.userId === user.id)
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

// EventSource can't send headers, so the stream authenticates with a single-use ticket valid for 30s.
const tickets = new Map() // sha(ticket) -> { userId, wsId, exp }

// Invites are single-use links (7 days) rather than email matches: emails aren't verified, so binding
// access to an address would let anyone who signs up with it claim the seat.
const INVITE_TTL = 7 * 864e5
const liveInvites = ws => (ws.invites = ws.invites.filter(i => Date.now() - i.at < INVITE_TTL))

const wsSummary = (ws, user) => ({ id: ws.id, name: ws.name, version: ws.version, updatedAt: ws.updatedAt, role: ws.members.find(m => m.userId === user.id)?.role })
const membersOut = ws => ({
  members: ws.members.map(m => { const u = db.users[m.userId]; return { id: m.userId, username: u?.username || '', email: u?.email || '', name: u?.name || 'Deleted user', role: m.role } }),
  invites: liveInvites(ws).map(i => ({ id: i.id, label: i.label, role: i.role, at: i.at })),
})

// ---- routes -----------------------------------------------------------------------------
async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1) // drop "api"
  const M = req.method

  if (parts[0] === 'auth') {
    if (M !== 'POST') fail(405, 'Method not allowed')
    if (parts[1] === 'logout') { const t = (req.headers.authorization || '').replace(/^Bearer /, ''); delete db.sessions[sha(t)]; await saveDb(); return send(res, 204) }
    throttle(req)
    const b = await readJson(req, 10_000)
    const pw = String(b.password || '')
    let user
    if (parts[1] === 'signup') {
      const username = String(b.username || '').trim().toLowerCase(), email = String(b.email || '').trim().toLowerCase()
      if (!USERNAME.test(username)) fail(400, 'Username: 3–24 characters, letters, numbers, dot, dash or underscore')
      if (RESERVED.has(username) || userByName(username)) fail(409, 'That username is taken')
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(400, 'Enter a valid email, or leave it empty')
      if (email && userByEmail(email)) fail(409, 'An account with this email already exists')
      if (pw.length < 8) fail(400, 'Password must be at least 8 characters')
      if (pw.toLowerCase().includes(username)) fail(400, 'Password must not contain your username')
      const salt = newId(16)
      user = { id: newId(), username, email, name: String(b.name || username).trim().slice(0, 80) || username, salt, hash: hashPw(pw, salt), createdAt: Date.now(), profile: cleanProfile() }
      db.users[user.id] = user
    } else if (parts[1] === 'login') {
      // Sign in with a username or an email address.
      const id = String(b.login ?? b.username ?? b.email ?? '').trim().toLowerCase()
      user = id.includes('@') ? userByEmail(id) : userByName(id)
      const ok = user && crypto.timingSafeEqual(Buffer.from(hashPw(pw, user.salt), 'hex'), Buffer.from(user.hash, 'hex'))
      if (!ok) fail(401, 'Wrong username or password')
    } else fail(404, 'Not found')
    const token = newId(32)
    db.sessions[sha(token)] = { userId: user.id, at: Date.now() }
    await saveDb()
    return send(res, 200, { token, user: pubUser(user) })
  }

  // Lets the app warn when accounts live on a throwaway disk.
  if (parts[0] === 'health' && M === 'GET') return send(res, 200, { ok: true, storage: store.kind })

  // Public profile pages: only for users who switched "public profile" on.
  if (parts[0] === 'users' && parts[1] && M === 'GET') {
    const u = userByName(decodeURIComponent(parts[1]).toLowerCase())
    if (!u || !u.profile?.public) fail(404, 'No public profile with that username')
    // A few counts from the user's own workspace, never its contents.
    const own = Object.values(db.workspaces).find(w => w.owner === u.id)
    const doc = own ? await readDoc(own.id) : {}
    const papers = Array.isArray(doc.papers) ? doc.papers : []
    const stats = { papers: papers.length, read: papers.filter(p => p?.status === 'done').length, notes: Array.isArray(doc.highlights) ? doc.highlights.length : 0, projects: Array.isArray(doc.projects) ? doc.projects.length : 0 }
    const { email, id, ...pub } = pubUser(u)
    return send(res, 200, { ...pub, stats })
  }

  // SSE stream: authenticated by ticket (see events-ticket below).
  if (parts[0] === 'workspaces' && parts[2] === 'events' && M === 'GET') {
    const key = sha(url.searchParams.get('ticket') || '')
    const t = tickets.get(key)
    tickets.delete(key)
    if (!t || t.exp < Date.now() || t.wsId !== parts[1]) fail(401, 'Invalid or expired ticket')
    const { ws } = membership(t.wsId, db.users[t.userId] || fail(401, 'Not signed in'))
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
    res.write(`data: ${JSON.stringify({ type: 'hello', version: ws.version })}\n\n`)
    if (!streams.has(ws.id)) streams.set(ws.id, new Set())
    const entry = Object.assign(res, { userId: t.userId })
    streams.get(ws.id).add(entry)
    const ping = setInterval(() => res.write(': ping\n\n'), 25000)
    req.on('close', () => { clearInterval(ping); streams.get(ws.id)?.delete(entry) })
    return
  }

  const user = authUser(req)

  if (parts[0] === 'me' && !parts[1] && M === 'GET') {
    const workspaces = Object.values(db.workspaces).filter(w => w.members.some(m => m.userId === user.id)).map(w => wsSummary(w, user))
    return send(res, 200, { user: pubUser(user), workspaces })
  }
  if (parts[0] === 'me' && !parts[1] && M === 'PATCH') {
    const b = await readJson(req, 20_000)
    if (b.name !== undefined) user.name = String(b.name).trim().slice(0, 80) || user.username
    if (b.email !== undefined) {
      const email = String(b.email).trim().toLowerCase()
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(400, 'Enter a valid email, or leave it empty')
      if (email && email !== user.email && userByEmail(email)) fail(409, 'Another account uses this email')
      user.email = email
    }
    if (b.username !== undefined && String(b.username).toLowerCase() !== user.username) {
      const username = String(b.username).trim().toLowerCase()
      if (!USERNAME.test(username)) fail(400, 'Username: 3–24 characters, letters, numbers, dot, dash or underscore')
      if (RESERVED.has(username) || userByName(username)) fail(409, 'That username is taken')
      user.username = username
    }
    if (b.profile) user.profile = cleanProfile(b.profile, user.profile)
    await saveDb()
    return send(res, 200, { user: pubUser(user) })
  }
  if (parts[0] === 'me' && parts[1] === 'password' && M === 'POST') {
    throttle(req)
    const b = await readJson(req, 10_000)
    const ok = crypto.timingSafeEqual(Buffer.from(hashPw(String(b.current || ''), user.salt), 'hex'), Buffer.from(user.hash, 'hex'))
    if (!ok) fail(401, 'Current password is wrong')
    const next = String(b.next || '')
    if (next.length < 8) fail(400, 'New password must be at least 8 characters')
    user.salt = newId(16); user.hash = hashPw(next, user.salt)
    // Sign out every other device.
    const mine = sha((req.headers.authorization || '').replace(/^Bearer /, ''))
    for (const [k, v] of Object.entries(db.sessions)) if (v.userId === user.id && k !== mine) delete db.sessions[k]
    await saveDb()
    return send(res, 200, { ok: true })
  }

  if (parts[0] === 'invites' && parts[2] === 'accept' && M === 'POST') {
    const h = sha(decodeURIComponent(parts[1] || ''))
    const ws = Object.values(db.workspaces).find(w => liveInvites(w).some(i => i.hash === h))
    if (!ws) fail(404, 'This invite link is invalid, expired or already used')
    const inv = ws.invites.find(i => i.hash === h)
    ws.invites = ws.invites.filter(i => i !== inv)
    if (!ws.members.some(m => m.userId === user.id)) ws.members.push({ userId: user.id, role: inv.role })
    await saveDb()
    broadcast(ws.id, { type: 'members' })
    return send(res, 200, wsSummary(ws, user))
  }

  if (parts[0] !== 'workspaces') fail(404, 'Not found')

  if (parts.length === 1 && M === 'POST') {
    const b = await readJson(req, 25e6)
    const ws = { id: newId(9), name: String(b.name || 'My workspace').slice(0, 80), owner: user.id, members: [{ userId: user.id, role: 'Owner' }], invites: [], version: 1, updatedAt: Date.now() }
    db.workspaces[ws.id] = ws
    await store.putJson(wsKey(ws.id), b.doc && typeof b.doc === 'object' ? b.doc : {})
    await saveDb()
    return send(res, 201, wsSummary(ws, user))
  }

  const wsId = parts[1]
  if (!/^[\w-]{6,20}$/.test(wsId || '')) fail(404, 'Not found')
  const { ws, role } = membership(wsId, user)
  const sub = parts[2]

  if (!sub && M === 'GET') {
    const doc = await readDoc(ws.id)
    return send(res, 200, { ...wsSummary(ws, user), doc, members: membersOut(ws) })
  }
  if (!sub && M === 'PATCH') {
    if (role !== 'Owner') fail(403, 'Only the owner can rename the workspace')
    const b = await readJson(req, 10_000)
    ws.name = String(b.name || ws.name).slice(0, 80); await saveDb()
    return send(res, 200, wsSummary(ws, user))
  }

  if (sub === 'doc' && M === 'PUT') {
    if (!WRITERS.includes(role)) fail(403, `${role}s can't edit this workspace`)
    const b = await readJson(req, 25e6)
    // Optimistic concurrency: the client must have merged the latest version first.
    if (b.baseVersion !== ws.version) {
      const doc = await readDoc(ws.id)
      return send(res, 409, { version: ws.version, doc })
    }
    if (!b.doc || typeof b.doc !== 'object') fail(400, 'Missing doc')
    await store.putJson(wsKey(ws.id), b.doc)
    ws.version++; ws.updatedAt = Date.now(); await saveDb()
    broadcast(ws.id, { type: 'update', version: ws.version, by: user.name, client: String(b.client || '') })
    return send(res, 200, { version: ws.version })
  }

  if (sub === 'events-ticket' && M === 'POST') {
    const ticket = newId(24), now = Date.now()
    for (const [k, t] of tickets) if (t.exp < now) tickets.delete(k)
    tickets.set(sha(ticket), { userId: user.id, wsId: ws.id, exp: now + 30_000 })
    return send(res, 200, { ticket })
  }

  if (sub === 'members' || sub === 'invites') {
    const target = decodeURIComponent(parts[3] || '')
    if (M === 'GET') return send(res, 200, membersOut(ws))
    if (role !== 'Owner') fail(403, 'Only the owner can manage members')
    let token
    if (sub === 'invites' && M === 'POST') {
      const b = await readJson(req, 10_000)
      token = newId(24)
      ws.invites.push({ id: newId(6), hash: sha(token), role: ROLES.includes(b.role) ? b.role : 'Viewer', label: String(b.label || '').slice(0, 120), at: Date.now() })
    } else if (sub === 'invites' && M === 'DELETE') {
      ws.invites = ws.invites.filter(i => i.id !== target)
    } else if (sub === 'members' && M === 'PATCH') {
      const b = await readJson(req, 10_000)
      const m = ws.members.find(m => m.userId === target)
      if (!m || m.role === 'Owner') fail(400, 'Cannot change this member')
      if (!ROLES.includes(b.role)) fail(400, 'Unknown role')
      m.role = b.role
    } else if (sub === 'members' && M === 'DELETE') {
      if (target === user.id) fail(400, 'The owner cannot be removed')
      ws.members = ws.members.filter(m => m.userId !== target)
      // Cut off the removed member's live stream immediately.
      for (const r of streams.get(ws.id) || []) if (r.userId === target) r.end()
    } else fail(405, 'Method not allowed')
    await saveDb()
    broadcast(ws.id, { type: 'members' })
    return send(res, 200, { ...membersOut(ws), ...(token ? { token } : {}) })
  }

  if (sub === 'pdfs') {
    const pid = decodeURIComponent(parts[3] || '')
    const idxKey = `pdf/${ws.id}/index`
    if (!pid && M === 'GET') return send(res, 200, await store.getJson(idxKey, []))
    if (!pid || pid.length > 200) fail(400, 'Bad paper id')
    if (M === 'GET') {
      const raw = await store.get(pdfKey(ws.id, pid))
      if (raw == null) fail(404, 'No PDF stored for this paper')
      res.writeHead(200, { 'content-type': 'application/json' })
      return res.end(raw)
    }
    if (M === 'PUT') {
      if (!WRITERS.includes(role)) fail(403, `${role}s can't upload files`)
      const b = await readJson(req, 80e6)
      if (typeof b.data !== 'string') fail(400, 'Missing data')
      await store.putJson(pdfKey(ws.id, pid), { name: String(b.name || 'paper.pdf'), pages: Number(b.pages) || 0, text: String(b.text || ''), data: b.data })
      const index = new Set(await store.getJson(idxKey, []))
      index.add(pid)
      await store.putJson(idxKey, [...index])
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
}).listen(PORT, () => console.log(`AI Research OS server on http://localhost:${PORT} · storage: ${store.kind}`))
