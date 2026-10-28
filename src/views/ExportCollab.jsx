import { useRef, useState } from 'react'
import { FileText, FileType, Sigma, Sheet, Braces, BookMarked, Upload, UserPlus, X } from 'lucide-react'
import { Head, ago, toast, nav } from '../components/ui.jsx'
import { useSync, getAuth, inviteMember, setMemberRole, removeMember } from '../lib/sync.js'
import { SyncBadge } from '../components/SyncPanel.jsx'
import { useStore } from '../lib/store.jsx'
import { workspaceJson, restorePdfs, download, toCsv, toLatex, toBibtex, toHtmlReport, printPdf } from '../lib/exporter.js'

export default function ExportCollab() {
  const { state, dispatch } = useStore()
  const [scope, setScope] = useState('all')
  const [withPdfs, setWithPdfs] = useState(false)
  const [invite, setInvite] = useState({ name: '', role: 'Viewer' })
  const file = useRef()
  const sync = useSync(), auth = getAuth()
  const live = !!auth?.workspace, owner = auth?.workspace?.role === 'Owner'
  const act = fn => fn().catch(e => toast(e.message))
  const papers = scope === 'all' ? state.papers : scope === 'starred' ? state.papers.filter(p => p.starred) : state.papers.filter(p => state.collections.find(c => c.id === scope)?.paperIds.includes(p.id))
  const label = scope === 'all' ? 'Library' : scope === 'starred' ? 'Starred' : state.collections.find(c => c.id === scope)?.name
  const done = f => { dispatch({ type: 'log', text: `exported ${papers.length} papers as ${f}` }); toast(`Exported ${f}`) }

  const OPTIONS = [
    ['PDF', FileText, () => printPdf(toHtmlReport(papers, `${label} — Research Report`))],
    ['Word', FileType, () => download(`${label}.doc`, toHtmlReport(papers, `${label} — Research Report`), 'application/msword')],
    ['LaTeX', Sigma, () => download(`${label}.tex`, toLatex(papers))],
    ['CSV', Sheet, () => download(`${label}.csv`, toCsv(papers), 'text/csv')],
    ['JSON', Braces, async () => download('research-os-workspace.json', await workspaceJson(state, { includePdfs: withPdfs }), 'application/json')],
    ['BibTeX', BookMarked, () => download(`${label}.bib`, toBibtex(papers))],
  ]
  const importJson = async f => {
    try { const { pdfs, ...data } = JSON.parse(await f.text()); if (!data.papers) throw new Error('not a workspace file'); const n = await restorePdfs(pdfs); dispatch({ type: 'import', state: data }); toast(`Workspace imported${n ? ` with ${n} PDFs` : ''}`) } catch (e) { toast(`Import failed: ${e.message}`) }
  }

  return (
    <>
      <Head n={12} title="Export & Collaborate" sub="Share your research & collaborate" violet />
      <div className="grid g2">
        <div className="stack">
          <div className="card">
            <div className="row between"><h3 style={{ margin: 0 }}>Export options</h3>
              <select className="input" style={{ width: 'auto' }} value={scope} onChange={e => setScope(e.target.value)}><option value="all">All papers ({state.papers.length})</option><option value="starred">Starred</option>{state.collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div className="grid g3" style={{ marginTop: 14 }}>
              {OPTIONS.map(([n, Icon, fn]) => <button key={n} className="btn" style={{ flexDirection: 'column', padding: 16, gap: 8 }} onClick={() => { fn(); done(n) }}><Icon size={22} />{n}</button>)}
            </div>
            <label className="row small" style={{ marginTop: 10 }}><input type="checkbox" checked={withPdfs} onChange={e => setWithPdfs(e.target.checked)} /> Include uploaded PDF files in JSON ({state.papers.filter(p => p.hasPdf).length}) — larger file, lets teammates open them</label>
            <p className="muted tiny">JSON exports the full workspace (papers, notes, canvas, hypotheses). PDF opens the print dialog.</p>
            <button className="btn sm" onClick={() => file.current.click()}><Upload size={13} /> Import workspace JSON</button>
            <input ref={file} type="file" accept="application/json" hidden onChange={e => e.target.files[0] && importJson(e.target.files[0])} />
          </div>
          {live ? <div className="card">
            <div className="row between"><h3 style={{ margin: 0 }}>Team · {auth.workspace.name}</h3><SyncBadge /></div>
            <div className="stack" style={{ marginTop: 12 }}>{sync.members.map(m => (
              <div key={m.email} className="row">
                <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--violet)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 12 }}>{(m.name || m.email)[0].toUpperCase()}</span>
                <span className="grow">{m.name} <span className="muted tiny">{m.email}</span> {m.email === auth.user.email && <span className="muted">(You)</span>} {!m.joined && <span className="tag">invited</span>}</span>
                {m.role === 'Owner' || !owner ? <span className="mono tiny">{m.role}</span> : <>
                  <select className="input" style={{ width: 'auto', padding: '3px 6px' }} value={m.role} onChange={e => act(() => setMemberRole(m.email, e.target.value))}>{['Editor', 'Commenter', 'Viewer'].map(r => <option key={r}>{r}</option>)}</select>
                  <button className="star" onClick={() => confirm(`Remove ${m.email}?`) && act(() => removeMember(m.email))}><X size={14} /></button></>}
              </div>))}
            </div>
            {owner && <form className="row" style={{ marginTop: 12 }} onSubmit={e => { e.preventDefault(); const em = invite.name.trim(); em && act(() => inviteMember(em, invite.role).then(() => { setInvite({ name: '', role: 'Viewer' }); dispatch({ type: 'log', text: `invited ${em}` }); toast('Invited — they get access when they sign up / sign in with that email') })) }}>
              <input className="input" type="email" placeholder="teammate@email.com" value={invite.name} onChange={e => setInvite({ ...invite, name: e.target.value })} />
              <select className="input" style={{ width: 'auto' }} value={invite.role} onChange={e => setInvite({ ...invite, role: e.target.value })}><option>Editor</option><option>Commenter</option><option>Viewer</option></select>
              <button className="btn dark"><UserPlus size={14} /> Invite</button>
            </form>}
            <p className="muted tiny">Editors' changes appear live for everyone. Viewers and commenters get read-only access.</p>
          </div> : <div className="card">
            <h3>Collaborate</h3>
            <div className="card flat small" style={{ marginBottom: 12 }}>This workspace is local to this browser. <a href="#/settings/sync" onClick={e => { e.preventDefault(); nav('/settings/sync') }}>Sign in and turn on sync</a> to invite teammates for real-time collaboration.</div>
            <div className="stack">{state.members.map(m => (
              <div key={m.id} className="row">
                <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--violet)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 12 }}>{m.name[0]}</span>
                <span className="grow">{m.name} {m.you && <span className="muted">(You)</span>}</span>
                {m.you ? <span className="mono tiny">Owner</span> : <>
                  <select className="input" style={{ width: 'auto', padding: '3px 6px' }} value={m.role} onChange={e => dispatch({ type: 'setRole', id: m.id, role: e.target.value })}>{['Editor', 'Viewer', 'Commenter'].map(r => <option key={r}>{r}</option>)}</select>
                  <button className="star" onClick={() => dispatch({ type: 'removeMember', id: m.id })}><X size={14} /></button></>}
              </div>))}
            </div>
            <form className="row" style={{ marginTop: 12 }} onSubmit={e => { e.preventDefault(); if (invite.name.trim()) { dispatch({ type: 'invite', ...invite }); setInvite({ name: '', role: 'Viewer' }); toast('Member added') } }}>
              <input className="input" placeholder="Name or email" value={invite.name} onChange={e => setInvite({ ...invite, name: e.target.value })} />
              <select className="input" style={{ width: 'auto' }} value={invite.role} onChange={e => setInvite({ ...invite, role: e.target.value })}><option>Editor</option><option>Viewer</option><option>Commenter</option></select>
              <button className="btn dark"><UserPlus size={14} /> Invite</button>
            </form>
            <p className="muted tiny">Local roster only. Without sync, share the workspace via JSON export/import.</p>
          </div>}
        </div>
        <div className="card" style={{ alignSelf: 'start' }}>
          <h3>Activity feed</h3>
          {state.activity.map(a => <div key={a.id} className="row between small" style={{ padding: '9px 0', borderBottom: '1.5px solid var(--soft)' }}><span className="row"><span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--ink)', color: 'var(--bg)', display: 'grid', placeItems: 'center', fontSize: 11 }}>{a.who[0]}</span><span><b>{a.who}</b> {a.text}</span></span><span className="muted tiny">{ago(a.at)}</span></div>)}
        </div>
      </div>
    </>
  )
}
