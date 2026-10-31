import { useState } from 'react'
import { Search, Plus, LayoutGrid, Sparkles, Flame, BookOpen } from 'lucide-react'
import { Head, nav, authorLine, ago, Progress, progressOf } from '../components/ui.jsx'
import ImportModal from '../components/ImportModal.jsx'
import { AlertsCard } from '../components/Alerts.jsx'
import { useStore, dayKey } from '../lib/store.jsx'

export default function Dashboard() {
  const { state } = useStore()
  const [q, setQ] = useState('')
  const [importing, setImporting] = useState(false)
  const hour = new Date().getHours()
  const greet = hour < 12 ? 'GM' : hour < 17 ? 'GOOD AFTERNOON' : 'GOOD EVENING'
  const recent = state.recent.map(id => state.papers.find(p => p.id === id)).filter(Boolean).slice(0, 4)
  // Connections = paper pairs that share at least one concept tag, plus hand-drawn canvas edges.
  const connections = state.papers.reduce((n, a, i) => n + state.papers.slice(i + 1).filter(b => b.tags.some(t => a.tags.includes(t))).length, 0) + state.canvas.edges.length
  const stats = [['Papers', state.papers.length, '/library'], ['Collections', state.collections.length, '/library'], ['Connections', connections, '/canvas'], ['Notes', state.highlights.length + Object.values(state.notes).filter(Boolean).length, '/notes']]

  return (
    <>
      <Head n={1} title="Dashboard" sub="Your research universe at a glance" />
      <div className="grid side-r">
        <div className="stack">
          <div className="card">
            <h2 style={{ margin: 0, fontFamily: 'var(--mono)' }}>{greet}, {(state.settings.name || 'there').toUpperCase()} 👋</h2>
            <p className="muted" style={{ margin: '4px 0 14px' }}>What are we exploring today?</p>
            <form className="search" onSubmit={e => { e.preventDefault(); nav(`/search/${encodeURIComponent(q)}`) }}>
              <Search size={16} /><input placeholder="Search papers, authors, topics..." value={q} onChange={e => setQ(e.target.value)} /><span className="kbd">/</span>
            </form>
            <div className="row wrap" style={{ marginTop: 14 }}>
              <button className="btn dark" onClick={() => setImporting(true)}><Plus size={14} /> Import papers</button>
              <button className="btn" onClick={() => nav('/canvas')}><LayoutGrid size={14} /> New canvas</button>
              <button className="btn" onClick={() => nav('/copilot')}><Sparkles size={14} /> AI copilot</button>
            </div>
            <div className="grid g4" style={{ marginTop: 16 }}>
              {stats.map(([l, v, to]) => <div key={l} className="stat" style={{ cursor: 'pointer' }} onClick={() => nav(to)}><small>{l}</small><b>{v.toLocaleString()}</b></div>)}
            </div>
          </div>
          {(() => {
            const reading = state.papers.filter(p => p.status === 'reading').sort((a, b) => (b.lastReadAt || 0) - (a.lastReadAt || 0)).slice(0, 4)
            const toRead = state.papers.filter(p => p.status === 'toread').length
            return (reading.length > 0 || toRead > 0) && <div className="card">
              <div className="row between"><h3>Continue reading</h3><button className="btn sm ghost" onClick={() => nav('/reading')}>Reading queue · {toRead} →</button></div>
              {!reading.length && <p className="muted small" style={{ margin: 0 }}>Nothing in progress. Open a paper from your To-read list to start.</p>}
              <div className="grid g2">{reading.map(p => (
                <div key={p.id} className="list-item" onClick={() => nav(`/paper/${encodeURIComponent(p.id)}/${p.hasPdf ? 'pdf' : ''}`)}>
                  <BookOpen size={18} />
                  <div className="grow"><div className="t small">{p.title.split(':')[0]}</div>
                    <div className="mono tiny muted" style={{ marginTop: 4 }}><Progress p={p} /> {progressOf(p) ? `${Math.round(progressOf(p) * 100)}% · p.${p.readPos?.page}` : 'not started'}{p.lastReadAt ? ` · ${ago(p.lastReadAt)}` : ''}</div></div>
                </div>))}
              </div>
            </div>
          })()}
          <div className="card">
            <h3>Recently viewed</h3>
            <div className="grid g4">
              {recent.map(p => (
                <div key={p.id} className="list-item" style={{ flexDirection: 'column', minHeight: 120 }} onClick={() => nav(`/paper/${p.id}`)}>
                  <div className="t small">{p.title.split(':')[0]}</div>
                  <div className="muted tiny mono" style={{ marginTop: 'auto' }}>{p.venue} · {p.year}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="stack">
          {(() => {
            const due = state.highlights.filter(h => (h.due || 0) <= Date.now())
            const pick = due[new Date().getDate() % (due.length || 1)]
            return pick && <div className="card" style={{ background: 'var(--lime)', color: '#0d0d0d' }}>
              <div className="row between"><h3>Remember this · {due.length} due</h3>{(() => { const r = state.review || {}; const alive = r.last === dayKey() || r.last === dayKey(Date.now() - 864e5); return alive && r.streak ? <span className="mono tiny row" style={{ gap: 3 }}><Flame size={14} />{r.streak}d</span> : null })()}</div>
              <div style={{ lineHeight: 1.5 }}>{pick.kind === 'term' ? <><b>{pick.term}</b> — {pick.definition}</> : <>“{pick.text.slice(0, 180)}”</>}</div>
              <button className="btn sm dark" style={{ marginTop: 10 }} onClick={() => nav('/notes/review')}>Review now</button>
            </div>
          })()}
          <AlertsCard />
          <div className="card">
            <h3>Activity</h3>
            {state.activity.slice(0, 6).map(a => <div key={a.id} className="row between small" style={{ padding: '6px 0', borderBottom: '1.5px solid var(--soft)' }}><span><b>{a.who}</b> {a.text}</span><span className="muted tiny">{ago(a.at)}</span></div>)}
          </div>
          <div className="card">
            <h3>Starred</h3>
            {state.papers.filter(p => p.starred).slice(0, 6).map(p => <div key={p.id} className="small" style={{ padding: '6px 0', cursor: 'pointer', borderBottom: '1.5px solid var(--soft)' }} onClick={() => nav(`/paper/${p.id}`)}><b>{p.title.split(':')[0]}</b><div className="muted tiny mono">{authorLine(p)}</div></div>)}
          </div>
        </div>
      </div>
      {importing && <ImportModal onClose={() => setImporting(false)} />}
    </>
  )
}
