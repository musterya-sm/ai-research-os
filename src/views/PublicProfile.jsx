import { useEffect, useState } from 'react'
import { Head, nav } from '../components/ui.jsx'
import { publicProfile } from '../lib/sync.js'
import { Avatar } from './Account.jsx'

// #/u/<username>: someone's public profile (only exists if they switched it on).
export default function PublicProfile({ arg }) {
  const [u, setU] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => { setU(null); setErr(''); publicProfile(decodeURIComponent(arg || '')).then(setU, e => setErr(e.message)) }, [arg])
  return (
    <>
      <Head title="Researcher profile" sub={u ? `@${u.username}` : ''} />
      {err && <div className="card"><h3>Profile not found</h3><p className="muted">{err}. The profile may be private, or the username may have changed.</p><button className="btn" onClick={() => nav('/')}>Open the app</button></div>}
      {!u && !err && <div className="row"><span className="spinner" /> Loading…</div>}
      {u && <div className="card" style={{ maxWidth: 720 }}>
        <div className="row" style={{ gap: 18, alignItems: 'center' }}>
          <Avatar user={u} size={80} />
          <div>
            <h1 style={{ margin: 0, fontSize: 28 }}>{u.name}</h1>
            <div className="mono small muted">@{u.username}{u.profile.affiliation ? ` · ${u.profile.affiliation}` : ''}</div>
            <div className="tiny muted">On AI Research OS since {new Date(u.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>
          </div>
        </div>
        {u.profile.bio && <p style={{ marginTop: 16, whiteSpace: 'pre-wrap' }}>{u.profile.bio}</p>}
        {u.profile.interests.length > 0 && <><div className="label" style={{ marginTop: 12 }}>Research interests</div><div style={{ marginTop: 6 }}>{u.profile.interests.map(t => <span key={t} className="tag violet">{t}</span>)}</div></>}
        <div className="grid g4" style={{ marginTop: 16 }}>{[['Papers', u.stats.papers], ['Read', u.stats.read], ['Notes', u.stats.notes], ['Lab projects', u.stats.projects]].map(([l, v]) => <div key={l} className="stat"><small>{l}</small><b>{v}</b></div>)}</div>
      </div>}
    </>
  )
}
