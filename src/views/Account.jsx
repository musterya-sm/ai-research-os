import { useEffect, useState } from 'react'
import { UserRound, KeyRound, Globe, Lock, Check, ExternalLink, Plus, X, AlertTriangle } from 'lucide-react'
import { Head, Toggle, toast, nav } from '../components/ui.jsx'
import { useStore } from '../lib/store.jsx'
import { useSync, getAuth, signIn, attachPersonalWorkspace, updateProfile, changePassword, refreshMe } from '../lib/sync.js'
import SyncPanel from '../components/SyncPanel.jsx'

export const AVATARS = ['#8b5cf6', '#d4f53c', '#3b82f6', '#f472b6', '#f59e0b', '#10b981', '#ef4444', '#0d0d0d']
const initials = u => (u?.name || u?.username || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
const ink = c => (['#d4f53c', '#f59e0b'].includes(c) ? '#0d0d0d' : '#fff')
export const Avatar = ({ user, size = 40 }) => {
  const c = user?.profile?.avatar || AVATARS[0]
  return <span className="avatar" style={{ width: size, height: size, background: c, color: ink(c), fontSize: size * 0.38 }} aria-hidden>{initials(user)}</span>
}
const USERNAME = /^[a-z0-9][a-z0-9_.-]{2,23}$/

// Accounts on a server without a database are wiped whenever the host restarts or redeploys.
function useStorageKind() {
  const [kind, setKind] = useState(null)
  useEffect(() => { fetch(`${getAuth()?.server || ''}/api/health`).then(r => r.json()).then(d => setKind(d.storage)).catch(() => setKind('none')) }, [])
  return kind
}
function StorageWarning() {
  const kind = useStorageKind()
  if (kind === 'none') return <div className="card flat small"><AlertTriangle size={14} /> Accounts need the app's server, which isn't reachable from here. Use the hosted link, or run <code>npm run server</code>.</div>
  if (kind !== 'files' || !/onrender\.com$/.test(location.hostname)) return null
  return <div className="card flat small" style={{ borderColor: '#f59e0b' }}><AlertTriangle size={14} /> <b>Heads-up:</b> this server isn't connected to a database yet, so accounts and synced data are wiped whenever the app is updated. Your library in this browser is never affected.</div>
}

function AuthForm() {
  const { state, dispatch } = useStore()
  const [mode, setMode] = useState('signup')
  const [f, setF] = useState({ login: '', username: '', name: state.settings.name === 'Arjun' ? '' : state.settings.name, email: '', password: '', confirm: '', server: getAuth()?.server || '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = patch => { setF({ ...f, ...patch }); setErr('') }
  const u = f.username.trim().toLowerCase()
  const problems = mode === 'signup' ? [
    u && !USERNAME.test(u) && 'Username: 3–24 characters: letters, numbers, dot, dash or underscore, starting with a letter or number.',
    f.password && f.password.length < 8 && 'Password must be at least 8 characters.',
    f.confirm && f.confirm !== f.password && 'Passwords don\'t match.',
  ].filter(Boolean) : []
  const ready = mode === 'signup' ? USERNAME.test(u) && f.password.length >= 8 && f.confirm === f.password : f.login.trim() && f.password

  async function submit(e) {
    e.preventDefault()
    if (!ready) return
    setBusy(true); setErr('')
    try {
      const user = mode === 'signup'
        ? await signIn('signup', { server: f.server, username: u, name: f.name.trim(), email: f.email.trim(), password: f.password })
        : await signIn('login', { server: f.server, login: f.login.trim(), password: f.password })
      dispatch({ type: 'settings', patch: { name: user.name, email: user.email } })
      const how = await attachPersonalWorkspace(state).catch(() => null)
      toast(mode === 'signup' ? `Welcome, ${user.name}! Your library is now saved to your account.` : how === 'joined' ? `Signed in as @${user.username}. Your library is syncing.` : `Signed in as @${user.username}.`)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="grid side-r">
      <form className="card stack" onSubmit={submit} style={{ maxWidth: 520 }} data-tour="account-form">
        <div className="tabs">{[['signup', 'Create account'], ['login', 'Sign in']].map(([k, l]) => <button type="button" key={k} className={mode === k ? 'on' : ''} onClick={() => { setMode(k); setErr('') }}>{l}</button>)}</div>
        {mode === 'login' ? <>
          <label className="small">Username or email<input className="input" autoComplete="username" autoFocus value={f.login} onChange={e => set({ login: e.target.value })} /></label>
          <label className="small">Password<input className="input" type="password" autoComplete="current-password" value={f.password} onChange={e => set({ password: e.target.value })} /></label>
        </> : <>
          <label className="small">Username<input className="input mono" autoComplete="username" autoFocus placeholder="e.g. ada_l" value={f.username} onChange={e => set({ username: e.target.value.replace(/\s/g, '') })} /></label>
          <label className="small">Display name <span className="muted">(optional)</span><input className="input" autoComplete="name" placeholder="Ada Lovelace" value={f.name} onChange={e => set({ name: e.target.value })} /></label>
          <label className="small">Email <span className="muted">(optional; lets you sign in with it too, and we never send email)</span><input className="input" type="email" autoComplete="email" value={f.email} onChange={e => set({ email: e.target.value })} /></label>
          <label className="small">Password<input className="input" type="password" autoComplete="new-password" value={f.password} onChange={e => set({ password: e.target.value })} /></label>
          <label className="small">Confirm password<input className="input" type="password" autoComplete="new-password" value={f.confirm} onChange={e => set({ confirm: e.target.value })} /></label>
        </>}
        {problems.map(p => <span key={p} className="small" style={{ color: 'var(--red)' }}>{p}</span>)}
        {err && <span className="small" style={{ color: 'var(--red)' }}>{err}</span>}
        <button className="btn dark" disabled={busy || !ready}>{busy ? <span className="spinner" /> : mode === 'signup' ? 'Create account' : 'Sign in'}</button>
        <details><summary className="tiny muted" style={{ cursor: 'pointer' }}>Advanced: use a different server</summary>
          <input className="input mono small" style={{ marginTop: 6 }} placeholder="Same as this site (default) or https://your-server" value={f.server} onChange={e => set({ server: e.target.value.replace(/\/$/, '') })} />
        </details>
      </form>
      <div className="card">
        <h3>Why make an account?</h3>
        <div className="stack small">
          <div><b>Your library everywhere.</b> Papers, notes, highlights, drafts and Lab projects sync to every device you sign in on.</div>
          <div><b>A profile.</b> Name, affiliation, interests, and an optional public page to share.</div>
          <div><b>Teams.</b> Invite collaborators to a shared workspace with Editor, Commenter or Viewer roles.</div>
          <div className="muted">No account? Everything still works, saved in this browser only.</div>
        </div>
        <StorageWarning />
      </div>
    </div>
  )
}

function Profile() {
  const a = getAuth(), me = a.user
  const { state, dispatch } = useStore()
  const [p, setP] = useState({ name: me.name, username: me.username, email: me.email || '', ...me.profile })
  const [interest, setInterest] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [pw, setPw] = useState({ current: '', next: '' })
  useEffect(() => { refreshMe().catch(() => {}) }, [])
  const set = patch => { setP({ ...p, ...patch }); setErr('') }
  const tags = [...new Set(state.papers.flatMap(x => x.tags))].filter(t => t !== 'General' && !p.interests.includes(t)).slice(0, 6)
  const addInterest = t => { t = t.trim(); if (t && !p.interests.includes(t) && p.interests.length < 12) set({ interests: [...p.interests, t] }); setInterest('') }

  async function save(extra = {}) {
    setBusy(true); setErr('')
    try {
      const next = { ...p, ...extra }
      const u = await updateProfile({ name: next.name, username: next.username.trim().toLowerCase(), email: next.email.trim(), profile: { bio: next.bio, affiliation: next.affiliation, interests: next.interests, avatar: next.avatar, public: next.public } })
      setP({ name: u.name, username: u.username, email: u.email, ...u.profile })
      dispatch({ type: 'settings', patch: { name: u.name, email: u.email } })
      toast('Profile saved')
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="grid side-r">
      <div className="stack">
        <div className="card row" style={{ gap: 16, alignItems: 'center' }}>
          <Avatar user={{ ...me, name: p.name, profile: { avatar: p.avatar } }} size={64} />
          <div className="grow">
            <h2 style={{ margin: 0 }}>{p.name || me.username}</h2>
            <div className="mono small muted">@{me.username}{p.affiliation ? ` · ${p.affiliation}` : ''}</div>
            <div className="tiny muted">Member since {new Date(me.createdAt || Date.now()).toLocaleDateString()}</div>
          </div>
          {me.profile.public && <span className="row" style={{ gap: 6 }}>
            <button className="btn sm" onClick={() => navigator.clipboard.writeText(`${location.origin}${location.pathname}#/u/${me.username}`).then(() => toast('Profile link copied'), () => prompt('Copy your profile link', `${location.origin}${location.pathname}#/u/${me.username}`))}>Copy link</button>
            <button className="btn sm" onClick={() => nav(`/u/${me.username}`)}><ExternalLink size={13} /> Public page</button>
          </span>}
        </div>

        <form className="card stack" data-tour="profile" onSubmit={e => { e.preventDefault(); save() }}>
          <h3 style={{ margin: 0 }}><UserRound size={15} /> Profile</h3>
          <div className="grid g2">
            <label className="small">Display name<input className="input" value={p.name} onChange={e => set({ name: e.target.value })} /></label>
            <label className="small">Username<input className="input mono" value={p.username} onChange={e => set({ username: e.target.value.replace(/\s/g, '') })} /></label>
            <label className="small">Affiliation<input className="input" placeholder="University, lab or company" value={p.affiliation} onChange={e => set({ affiliation: e.target.value })} /></label>
            <label className="small">Email <span className="muted">(optional)</span><input className="input" type="email" value={p.email} onChange={e => set({ email: e.target.value })} /></label>
          </div>
          <label className="small">Bio<textarea className="input" rows={3} maxLength={500} placeholder="What you research, in a sentence or two" value={p.bio} onChange={e => set({ bio: e.target.value })} /></label>
          <div>
            <div className="small">Research interests</div>
            <div style={{ margin: '6px 0' }}>{p.interests.map(t => <span key={t} className="tag violet">{t} <button type="button" className="star" style={{ padding: 0, color: 'inherit' }} aria-label={`Remove ${t}`} onClick={() => set({ interests: p.interests.filter(x => x !== t) })}><X size={11} /></button></span>)}</div>
            <div className="row"><input className="input" placeholder="Add an interest and press Enter" value={interest} onChange={e => setInterest(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addInterest(interest) } }} /><button type="button" className="btn sm" disabled={!interest.trim()} onClick={() => addInterest(interest)}><Plus size={13} /></button></div>
            {tags.length > 0 && <div className="tiny muted" style={{ marginTop: 6 }}>From your library: {tags.map(t => <button type="button" key={t} className="tag" style={{ cursor: 'pointer' }} onClick={() => addInterest(t)}>+ {t}</button>)}</div>}
          </div>
          <div>
            <div className="small">Avatar colour</div>
            <div className="row" style={{ gap: 6, marginTop: 6 }}>{AVATARS.map(c => <button type="button" key={c} aria-label={`Colour ${c}`} onClick={() => set({ avatar: c })} style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: p.avatar === c ? '3px solid var(--ink)' : '2px solid var(--line)', cursor: 'pointer', display: 'grid', placeItems: 'center', color: ink(c) }}>{p.avatar === c && <Check size={13} />}</button>)}</div>
          </div>
          <div className="row between">
            <span className="small">{p.public ? <><Globe size={13} /> Public profile: anyone with the link can see your name, bio, interests and counts (not your papers or notes).</> : <><Lock size={13} /> Private profile: only you can see it.</>}</span>
            <Toggle on={p.public} label="Public profile" onChange={v => set({ public: v })} />
          </div>
          {err && <span className="small" style={{ color: 'var(--red)' }}>{err}</span>}
          <button className="btn violet" style={{ alignSelf: 'flex-start' }} disabled={busy}>{busy ? <span className="spinner" /> : 'Save profile'}</button>
        </form>
      </div>

      <div className="stack">
        <div className="card">
          <h3>Sync</h3>
          <SyncPanel />
        </div>
        <form className="card stack" onSubmit={async e => { e.preventDefault(); try { await changePassword(pw.current, pw.next); setPw({ current: '', next: '' }); toast('Password changed. Other devices were signed out.') } catch (x) { toast(x.message) } }}>
          <h3 style={{ margin: 0 }}><KeyRound size={15} /> Password</h3>
          <input type="text" autoComplete="username" value={me.username} readOnly hidden />
          <label className="small">Current password<input className="input" type="password" autoComplete="current-password" value={pw.current} onChange={e => setPw({ ...pw, current: e.target.value })} /></label>
          <label className="small">New password (8+ characters)<input className="input" type="password" autoComplete="new-password" value={pw.next} onChange={e => setPw({ ...pw, next: e.target.value })} /></label>
          <button className="btn sm" style={{ alignSelf: 'flex-start' }} disabled={!pw.current || pw.next.length < 8}>Change password</button>
        </form>
        <StorageWarning />
      </div>
    </div>
  )
}

export default function Account() {
  useSync() // re-render on sign in/out
  const a = getAuth()
  return (
    <>
      <Head n={21} title="Account" sub={a?.token ? 'Your profile, sync and password' : 'Sign in or create an account'} />
      {a?.token ? <Profile key={a.user.id} /> : <AuthForm />}
    </>
  )
}
