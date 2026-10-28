// Client side of cloud sync. The workspace's shared collections are pushed to the sync server with
// optimistic versioning; concurrent edits are resolved with a three-way merge per item id against the
// last state both sides agreed on ("base"), so adds/edits/deletes from different devices all survive.
import { useSyncExternalStore } from 'react'
import { getPdf, listPdfIds } from './pdfstore.js'

export const SHARED = ['papers', 'collections', 'notes', 'canvas', 'hypotheses', 'highlights', 'drafts', 'activity']
const AUTH_KEY = 'ai-research-os/auth' // { server, token, user, workspace: { id, name, role } }
const BASE_KEY = 'ai-research-os/sync-base' // { version, doc }
const clientId = Math.random().toString(36).slice(2)

const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d } catch { return d } }
const save = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)) } catch {} }

let auth = load(AUTH_KEY, null)
let base = load(BASE_KEY, null)
let status = { state: auth?.workspace ? 'connecting' : 'off', members: [], error: '', at: 0 }
const subs = new Set()
const emit = patch => { status = { ...status, ...patch }; subs.forEach(f => f()) }
const setAuth = a => { auth = a; save(AUTH_KEY, a); emit({}) }
const setBase = b => { base = b; save(BASE_KEY, b) }

export function useSync() {
  return useSyncExternalStore(f => (subs.add(f), () => subs.delete(f)), () => status)
}
export const getAuth = () => auth
export const canWrite = () => ['Owner', 'Editor'].includes(auth?.workspace?.role)

async function api(path, { method = 'GET', body, server = auth?.server, token = auth?.token } = {}) {
  const res = await fetch(`${server || ''}/api${path}`, {
    method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = res.status === 204 ? null : await res.json().catch(() => ({}))
  if (res.status === 401 && token) { setAuth(null); emit({ state: 'off', error: 'Session expired — sign in again' }) }
  if (!res.ok && res.status !== 409) throw Object.assign(new Error(data?.error || `Server error ${res.status}`), { status: res.status })
  return { status: res.status, data }
}

// ---- account -----------------------------------------------------------------------------
export async function signIn(mode, { server = '', email, password, name }) {
  const { data } = await api(`/auth/${mode}`, { method: 'POST', body: { email, password, name }, server, token: null })
  setAuth({ server, token: data.token, user: data.user, workspace: null })
  return data.user
}
export async function signOut() {
  await api('/auth/logout', { method: 'POST' }).catch(() => {})
  stopLive(); setAuth(null); setBase(null); emit({ state: 'off', members: [] })
}
export const listWorkspaces = async () => (await api('/me')).data.workspaces

// mode 'replace': this browser adopts the workspace. 'merge': local items are merged into it.
export async function joinWorkspace(ws, mode = 'replace') {
  setAuth({ ...auth, workspace: { id: ws.id, name: ws.name, role: ws.role } })
  setBase(mode === 'merge' ? { version: -1, doc: {} } : null)
  emit({ state: 'connecting' })
}
export async function createWorkspace(name, doc) {
  const { data } = await api('/workspaces', { method: 'POST', body: { name, doc: pick(doc) } })
  setAuth({ ...auth, workspace: { id: data.id, name: data.name, role: data.role } })
  setBase({ version: data.version, doc: pick(doc) })
  emit({ state: 'connecting' })
  return data
}
export function leaveWorkspace() { stopLive(); setAuth({ ...auth, workspace: null }); setBase(null); emit({ state: 'off', members: [] }) }

const wsPath = p => `/workspaces/${auth.workspace.id}${p}`
const refreshMembers = async () => emit({ members: (await api(wsPath('/members'))).data })
export const inviteMember = async (email, role) => emit({ members: (await api(wsPath('/members'), { method: 'POST', body: { email, role } })).data })
export const setMemberRole = async (email, role) => emit({ members: (await api(wsPath(`/members/${encodeURIComponent(email)}`), { method: 'PATCH', body: { role } })).data })
export const removeMember = async email => emit({ members: (await api(wsPath(`/members/${encodeURIComponent(email)}`), { method: 'DELETE' })).data })

// ---- merge ---------------------------------------------------------------------------------
export const pick = s => Object.fromEntries(SHARED.filter(k => s[k] !== undefined).map(k => [k, s[k]]))
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

function mergeItems(b = [], l = [], r = [], key = x => x.id) {
  const B = new Map(b.map(x => [key(x), x])), L = new Map(l.map(x => [key(x), x])), R = new Map(r.map(x => [key(x), x]))
  const pickOne = id => {
    const lx = L.get(id), rx = R.get(id), bx = B.get(id)
    if (lx && rx) return same(lx, bx) ? rx : lx // both edited → keep this device's version
    if (lx) return bx && same(lx, bx) ? null : lx // deleted remotely (unless edited here)
    return bx && same(rx, bx) ? null : rx // deleted here (unless edited remotely)
  }
  const out = [], seen = new Set()
  for (const x of r) { const id = key(x); if (!L.has(id) && !B.has(id)) { out.push(x); seen.add(id) } } // new remote items first
  for (const x of l) { const id = key(x); seen.add(id); const v = pickOne(id); if (v) out.push(v) }
  for (const x of r) { const id = key(x); if (!seen.has(id)) { const v = pickOne(id); if (v) out.push(v) } }
  return out
}
function mergeMap(b = {}, l = {}, r = {}) {
  const out = {}
  for (const k of new Set([...Object.keys(l), ...Object.keys(r)])) {
    const v = k in l && k in r ? (same(l[k], b[k]) ? r[k] : l[k]) : k in l ? (k in b && same(l[k], b[k]) ? undefined : l[k]) : (k in b && same(r[k], b[k]) ? undefined : r[k])
    if (v !== undefined) out[k] = v
  }
  return out
}
export function merge3(b, l, r) {
  const out = {}
  for (const k of SHARED) {
    if (k === 'notes') out.notes = mergeMap(b.notes, l.notes, r.notes)
    else if (k === 'canvas') out.canvas = { nodes: mergeItems(b.canvas?.nodes, l.canvas?.nodes, r.canvas?.nodes), edges: mergeItems(b.canvas?.edges, l.canvas?.edges, r.canvas?.edges) }
    else if (k === 'activity') out.activity = mergeItems(b.activity, l.activity, r.activity).sort((x, y) => y.at - x.at).slice(0, 50)
    else out[k] = mergeItems(b[k], l[k], r[k])
  }
  if (!r.canvas && !l.canvas) delete out.canvas
  return out
}

// ---- engine --------------------------------------------------------------------------------
let getState, applyDoc, es, pushTimer, busy = false, again = false, version = 0

// Called by <SyncBridge> with accessors into the store.
export function startEngine(get, apply) {
  getState = get; applyDoc = apply
  if (!auth?.workspace) return
  pull().then(() => { startLive(); refreshMembers().catch(() => {}); syncPdfs() }).catch(e => emit({ state: 'error', error: e.message }))
}

async function pull() {
  const { data } = await api(wsPath(''))
  auth.workspace.role = data.role; setAuth({ ...auth })
  emit({ members: data.members })
  const local = pick(getState())
  const merged = base ? merge3(base.doc, local, data.doc) : { ...local, ...data.doc } // no base → adopt remote
  setBase({ version: data.version, doc: data.doc })
  version = data.version
  if (!same(merged, local)) applyDoc(merged)
  emit({ state: 'ok', error: '', at: Date.now() })
  if (!same(merged, data.doc)) schedulePush(0)
}

export function schedulePush(delay = 1200) {
  if (!auth?.workspace || !canWrite() || status.state === 'connecting') return
  clearTimeout(pushTimer)
  pushTimer = setTimeout(push, delay)
}

async function push() {
  if (busy) { again = true; return }
  const local = pick(getState())
  if (base && same(local, base.doc)) return
  busy = true; emit({ state: 'syncing' })
  try {
    const { status: code, data } = await api(wsPath('/doc'), { method: 'PUT', body: { baseVersion: base?.version ?? version, doc: local, client: clientId } })
    if (code === 409) {
      // Someone else saved first: merge their version in and try again.
      const merged = merge3(base?.doc || {}, local, data.doc)
      setBase({ version: data.version, doc: data.doc }); version = data.version
      applyDoc(merged); again = true
    } else { setBase({ version: data.version, doc: local }); version = data.version }
    emit({ state: 'ok', error: '', at: Date.now() })
    syncPdfs()
  } catch (e) { emit({ state: navigator.onLine ? 'error' : 'offline', error: e.message }) } finally {
    busy = false
    if (again) { again = false; schedulePush(300) }
  }
}

function startLive() {
  stopLive()
  const url = `${auth.server || ''}/api${wsPath('/events')}?token=${encodeURIComponent(auth.token)}`
  es = new EventSource(url)
  es.onmessage = e => {
    const ev = JSON.parse(e.data)
    if (ev.type === 'update' && ev.client !== clientId && ev.version > version) pull().catch(() => {})
    if (ev.type === 'members') refreshMembers().catch(() => {})
  }
  es.onerror = () => emit({ state: navigator.onLine ? status.state : 'offline' })
}
function stopLive() { es?.close(); es = null }

// Upload PDFs that exist only in this browser (editors only).
let remotePdfs = null, pdfBusy = false
async function syncPdfs() {
  if (!canWrite() || pdfBusy) return
  pdfBusy = true
  try {
    remotePdfs ||= new Set((await api(wsPath('/pdfs'))).data)
    const local = new Set(await listPdfIds())
    for (const p of getState().papers.filter(p => p.hasPdf && local.has(p.id) && !remotePdfs.has(p.id))) {
      const rec = await getPdf(p.id)
      const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(rec.blob) })
      await api(wsPath(`/pdfs/${encodeURIComponent(p.id)}`), { method: 'PUT', body: { name: rec.name, pages: rec.pages, text: rec.text, data } })
      remotePdfs.add(p.id)
    }
  } catch (e) { console.warn('PDF sync', e.message) } finally { pdfBusy = false }
}

// Download a PDF this device doesn't have yet. Returns a pdfstore record or null.
export async function pullPdf(id) {
  if (!auth?.workspace) return null
  const res = await fetch(`${auth.server || ''}/api${wsPath(`/pdfs/${encodeURIComponent(id)}`)}`, { headers: { authorization: `Bearer ${auth.token}` } })
  if (!res.ok) return null
  const rec = await res.json()
  const bytes = Uint8Array.from(atob(rec.data), c => c.charCodeAt(0))
  return { blob: new Blob([bytes], { type: 'application/pdf' }), name: rec.name, text: rec.text, pages: rec.pages }
}
