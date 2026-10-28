import { useState } from 'react'
import { Head, nav, toast } from '../components/ui.jsx'
import SyncPanel from '../components/SyncPanel.jsx'
import { useSync, getAuth, acceptInvite, joinWorkspace } from '../lib/sync.js'

// Landing for invite links: #/join/<token>. Sign in (or sign up), then redeem the link.
export default function Join({ arg }) {
  useSync()
  const a = getAuth()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function accept(mode) {
    setBusy(true); setErr('')
    try { const ws = await acceptInvite(arg); await joinWorkspace(ws, mode); toast(`Joined ${ws.name} as ${ws.role}`); nav('/dashboard') } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  return (
    <>
      <Head n={0} title="Join workspace" sub="You've been invited to a shared research workspace" violet />
      <div className="card" style={{ maxWidth: 620 }}>
        {!a?.token ? <><p className="small">Sign in or create an account first — then you can accept the invite.</p><SyncPanel /></>
          : <div className="stack">
            <p style={{ margin: 0 }}>Signed in as <b>{a.user.email}</b>. Accepting uses up this link.</p>
            {a.workspace && <p className="small muted" style={{ margin: 0 }}>This device currently syncs “{a.workspace.name}” — it will switch to the new workspace.</p>}
            <div className="row">
              <button className="btn dark" disabled={busy} onClick={() => confirm('Replace the data in this browser with the shared workspace?') && accept('replace')}>{busy ? <span className="spinner" /> : 'Accept & open'}</button>
              <button className="btn" disabled={busy} onClick={() => accept('merge')}>Accept & merge my notes in</button>
            </div>
            {err && <p className="small" style={{ color: 'var(--red)', margin: 0 }}>{err}</p>}
          </div>}
      </div>
    </>
  )
}
