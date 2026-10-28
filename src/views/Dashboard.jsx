import { useState } from 'react'
import { Search, Plus, LayoutGrid, Sparkles } from 'lucide-react'
import { Head, nav, authorLine, ago } from '../components/ui.jsx'
import ImportModal from '../components/ImportModal.jsx'
import { useStore } from '../lib/store.jsx'

export default function Dashboard() {
  const { state } = useStore()
  const [q, setQ] = useState('')
  const [importing, setImporting] = useState(false)
  const hour = new Date().getHours()
  const greet = hour < 12 ? 'GM' : hour < 17 ? 'GOOD AFTERNOON' : 'GOOD EVENING'
  const recent = state.recent.map(id => state.papers.find(p => p.id === id)).filter(Boolean).slice(0, 4)
  // Connections = paper pairs that share at least one concept tag, plus hand-drawn canvas edges.
  const connections = state.papers.reduce((n, a, i) => n + state.papers.slice(i + 1).filter(b => b.tags.some(t => a.tags.includes(t))).length, 0) + state.canvas.edges.length
  const stats = [['Papers', state.papers.length, '/library'], ['Collections', state.collections.length, '/library'], ['Connections', connections, '/canvas'], ['Notes', Object.values(state.notes).filter(Boolean).length + state.hypotheses.length, '/hypotheses']]

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
