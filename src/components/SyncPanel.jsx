import { useEffect, useState } from 'react'
import { Cloud, CloudOff, LogOut } from 'lucide-react'
import { useStore } from '../lib/store.jsx'
import { useSync, getAuth, signIn, signOut, listWorkspaces, joinWorkspace, createWorkspace, leaveWorkspace } from '../lib/sync.js'
import { toast, ago } from './ui.jsx'

export const SyncBadge = () => {
  const s = useSync(), a = getAuth()
  if (!a?.workspace) return null
  const label = { ok: 'Synced', syncing: 'Syncing…', connecting: 'Connecting…', error: 'Sync error', offline: 'Offline' }[s.state] || s.state
  return <span className={`ai-badge ${s.state === 'ok' ? 'on' : ''}`} title={s.error || `${a.workspace.name} · ${a.workspace.role}${s.at ? ` · ${ago(s.at)}` : ''}`}>{s.state === 'error' || s.state === 'offline' ? <CloudOff size={11} /> : <Cloud size={11} />} {label}</span>
}

// Settings → Account & Sync: sign in, pick or create a shared workspace.
export default function SyncPanel() {
  const { state, dispatch } = useStore()
  const s = useSync(), a = getAuth()
  const [mode, setMode] = useState('login')
  const [f, setF] = useState({ server: a?.server || '', email: '', password: '', name: state.settings.name })
  const [wss, setWss] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [newName, setNewName] = useState('My research')
  useEffect(() => { if (a?.token) listWorkspaces().then(setWss).catch(e => setErr(e.message)) }, [a?.token, a?.workspace?.id])
  const go = fn => async (...x) => { setBusy(true); setErr(''); try { await fn(...x) } catch (e) { setErr(e.message) } finally { setBusy(false) } }

  if (!a?.token) return (
    <form className="stack" style={{ maxWidth: 420 }} onSubmit={e => { e.preventDefault(); go(async () => { const u = await signIn(mode, f); dispatch({ type: 'settings', patch: { name: u.name, email: u.email } }); toast(`Signed in as ${u.email}`) })() }}>
      <p className="small muted" style={{ margin: 0 }}>Sign in to back up this workspace, use it on other devices and collaborate with your team in real time. Run the sync server with <code>npm run server</code> (or deploy it) — your data then lives there instead of only in this browser.</p>
      <div className="tabs">{[['login', 'Sign in'], ['signup', 'Create account']].map(([k, l]) => <button type="button" key={k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{l}</button>)}</div>
      {mode === 'signup' && <label className="small">Name<input className="input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>}
      <label className="small">Email<input className="input" type="email" autoComplete="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></label>
      <label className="small">Password<input className="input" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={f.password} onChange={e => setF({ ...f, password: e.target.value })} /></label>
      <details><summary className="small" style={{ cursor: 'pointer' }}>Server</summary>
        <input className="input mono small" style={{ marginTop: 6 }} placeholder="Same origin (default) or https://your-server" value={f.server} onChange={e => setF({ ...f, server: e.target.value.replace(/\/$/, '') })} />
      </details>
      {err && <p className="small" style={{ color: 'var(--red)', margin: 0 }}>{err}</p>}
      <button className="btn dark" disabled={busy || !f.email || !f.password}>{busy ? <span className="spinner" /> : mode === 'signup' ? 'Create account' : 'Sign in'}</button>
    </form>
  )

  return (
    <div className="stack" style={{ maxWidth: 560 }}>
      <div className="row between"><span>Signed in as <b>{a.user.email}</b></span><button className="btn sm" onClick={go(signOut)}><LogOut size={13} /> Sign out</button></div>
      {a.workspace ? <div className="card flat">
        <div className="row between"><span><b>{a.workspace.name}</b> <span className="tag">{a.workspace.role}</span></span><SyncBadge /></div>
        <p className="small muted">Every change syncs automatically. {s.at ? `Last sync ${ago(s.at)}.` : ''} {['Viewer', 'Commenter'].includes(a.workspace.role) && 'You have read-only access — your local edits will not be uploaded.'}</p>
        {s.error && <p className="small" style={{ color: 'var(--red)' }}>{s.error}</p>}
        <button className="btn sm" onClick={() => { leaveWorkspace(); toast('Stopped syncing — this browser keeps a local copy') }}>Stop syncing on this device</button>
      </div> : <>
        <div className="card flat stack">
          <b>Upload this browser's workspace</b>
          <div className="row"><input className="input" value={newName} onChange={e => setNewName(e.target.value)} /><button className="btn violet" disabled={busy || !newName.trim()} onClick={go(async () => { await createWorkspace(newName.trim(), state); toast('Workspace created and synced') })}>Create</button></div>
        </div>
        {wss?.length > 0 && <div className="card flat stack"><b>Or open an existing workspace</b>
          {wss.map(w => <div key={w.id} className="row between small"><span>{w.name} <span className="tag">{w.role}</span> <span className="muted tiny">updated {ago(w.updatedAt)}</span></span>
            <span className="row"><button className="btn sm" onClick={() => confirm('Replace the data in this browser with the workspace?') && joinWorkspace(w, 'replace')}>Open</button>
              <button className="btn sm ghost" title="Merge this browser's papers and notes into the workspace" onClick={() => joinWorkspace(w, 'merge')}>Merge mine in</button></span></div>)}
        </div>}
      </>}
      {err && <p className="small" style={{ color: 'var(--red)' }}>{err}</p>}
    </div>
  )
}
