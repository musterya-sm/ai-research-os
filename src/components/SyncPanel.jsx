import { useEffect, useState } from 'react'
import { Cloud, CloudOff, LogOut } from 'lucide-react'
import { useStore } from '../lib/store.jsx'
import { useSync, getAuth, signOut, listWorkspaces, joinWorkspace, createWorkspace, leaveWorkspace } from '../lib/sync.js'
import { toast, ago, nav } from './ui.jsx'

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
  const [wss, setWss] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [newName, setNewName] = useState('My research')
  useEffect(() => { if (a?.token) listWorkspaces().then(setWss).catch(e => setErr(e.message)) }, [a?.token, a?.workspace?.id])
  const go = fn => async (...x) => { setBusy(true); setErr(''); try { await fn(...x) } catch (e) { setErr(e.message) } finally { setBusy(false) } }

  if (!a?.token) return (
    <div className="stack" style={{ maxWidth: 420 }}>
      <p className="small muted" style={{ margin: 0 }}>Sign in to back up this workspace, use it on other devices and collaborate with your team in real time.</p>
      <button className="btn dark" style={{ alignSelf: 'flex-start' }} onClick={() => nav('/account')}>Sign in or create an account</button>
    </div>
  )

  return (
    <div className="stack" style={{ maxWidth: 560 }}>
      <div className="row between"><span>Signed in as <b>@{a.user.username || a.user.email}</b></span><button className="btn sm" onClick={go(signOut)}><LogOut size={13} /> Sign out</button></div>
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
