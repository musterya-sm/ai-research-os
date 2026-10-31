import { useState } from 'react'
import { Bell, RefreshCw, Plus, X, ExternalLink } from 'lucide-react'
import { nav, toast, Tags } from './ui.jsx'
import { useStore } from '../lib/store.jsx'
import { runAlerts, matchPct } from '../lib/alerts.js'

export function useCheckAlerts() {
  const { state, dispatch, index } = useStore()
  const [busy, setBusy] = useState(false)
  async function check(alerts = state.alerts) {
    setBusy(true)
    try {
      const r = await runAlerts({ alerts, papers: state.papers, index })
      dispatch({ type: 'alerts', patch: { items: r.items, lastRun: r.lastRun, seen: r.seen } })
      return r.fresh
    } finally { setBusy(false) }
  }
  return { check, busy }
}

function Chips({ list, onRemove }) {
  return list.map(t => <span key={t} className="tag violet">{t} <button className="star" aria-label={`Unfollow ${t}`} onClick={() => onRemove(t)} style={{ padding: 0, marginLeft: 2, color: 'inherit' }}><X size={11} /></button></span>)
}

// Feed tab: manage followed topics/authors and work through the matches.
export function AlertsPanel() {
  const { state, dispatch } = useStore()
  const { check, busy } = useCheckAlerts()
  const a = state.alerts
  const [topic, setTopic] = useState('')
  const [author, setAuthor] = useState('')
  const set = patch => dispatch({ type: 'alerts', patch })
  const suggestions = Object.entries(state.papers.flatMap(p => p.tags).reduce((m, t) => ({ ...m, [t]: (m[t] || 0) + 1 }), {}))
    .sort((x, y) => y[1] - x[1]).map(([t]) => t).filter(t => t !== 'General' && !a.topics.includes(t)).slice(0, 6)
  const follow = (k, v) => { v = v.trim(); if (v && !a[k].includes(v)) set({ [k]: [...a[k], v], lastRun: 0 }) }
  const add = x => { dispatch({ type: 'addPapers', papers: [{ ...x.paper, addedAt: Date.now() }] }); set({ items: a.items.filter(i => i !== x) }); toast('Added to your library') }
  const dismiss = x => set({ items: a.items.filter(i => i !== x) })
  const run = () => check().then(n => toast(n ? `${n} new paper${n > 1 ? 's' : ''}` : 'Nothing new since the last check'), e => toast(e.message))

  return (
    <div className="stack" data-tour="alerts">
      <div className="g2 grid">
        <form onSubmit={e => { e.preventDefault(); follow('topics', topic); setTopic('') }}>
          <div className="label">Topics you follow</div>
          <div style={{ margin: '6px 0' }}><Chips list={a.topics} onRemove={t => set({ topics: a.topics.filter(x => x !== t) })} />{!a.topics.length && <span className="small muted">None yet.</span>}</div>
          <div className="row"><input className="input" placeholder="e.g. retrieval-augmented generation" value={topic} onChange={e => setTopic(e.target.value)} /><button className="btn sm" disabled={!topic.trim()}><Plus size={13} /></button></div>
          {suggestions.length > 0 && <div className="small muted" style={{ marginTop: 6 }}>From your library: {suggestions.map(t => <button type="button" key={t} className="tag" style={{ cursor: 'pointer' }} onClick={() => follow('topics', t)}>+ {t}</button>)}</div>}
        </form>
        <form onSubmit={e => { e.preventDefault(); follow('authors', author); setAuthor('') }}>
          <div className="label">Authors you follow</div>
          <div style={{ margin: '6px 0' }}><Chips list={a.authors} onRemove={t => set({ authors: a.authors.filter(x => x !== t) })} />{!a.authors.length && <span className="small muted">None yet.</span>}</div>
          <div className="row"><input className="input" placeholder="e.g. Percy Liang" value={author} onChange={e => setAuthor(e.target.value)} /><button className="btn sm" disabled={!author.trim()}><Plus size={13} /></button></div>
        </form>
      </div>
      <div className="row between">
        <span className="small muted"><Bell size={13} /> Checked automatically once a day when you open the app{a.lastRun ? ` · last check ${new Date(a.lastRun).toLocaleString()}` : ''}</span>
        <button className="btn sm" disabled={busy || !(a.topics.length || a.authors.length)} onClick={run}>{busy ? <span className="spinner" /> : <RefreshCw size={13} />} Check now</button>
      </div>
      {a.items.map(x => (
        <div key={x.paper.id} className="list-item" style={{ cursor: 'default' }}>
          <div className="grow">
            <div className="t">{x.paper.title}</div>
            <div className="muted tiny mono">{x.paper.authors.join(' ')} · {x.paper.published ? new Date(x.paper.published).toLocaleDateString() : x.paper.year} · <a href={`https://arxiv.org/abs/${encodeURIComponent(x.paper.id)}`} target="_blank" rel="noreferrer">arXiv <ExternalLink size={10} /></a></div>
            <div className="small" style={{ margin: '6px 0' }}>{x.paper.abstract.slice(0, 220)}…</div>
            <Tags tags={x.paper.tags} /><div className="tiny muted mono">↳ {x.why.join(' · ')} · {matchPct(x.score)}% like your library</div>
          </div>
          <span className="stack" style={{ gap: 6 }}><button className="btn sm violet" onClick={() => add(x)}>Add</button><button className="btn sm ghost" onClick={() => dismiss(x)}>Dismiss</button></span>
        </div>))}
      {!a.items.length && <div className="empty">{a.topics.length || a.authors.length ? 'No new papers yet. Click “Check now” or come back tomorrow.' : 'Follow a topic or an author to get new arXiv papers here every day.'}</div>}
    </div>
  )
}

// Dashboard card: today's top matches, or one-click suggestions to start following.
export function AlertsCard() {
  const { state, dispatch } = useStore()
  const a = state.alerts
  const top = a.items.slice(0, 3)
  const tags = Object.entries(state.papers.flatMap(p => p.tags).reduce((m, t) => ({ ...m, [t]: (m[t] || 0) + 1 }), {})).sort((x, y) => y[1] - x[1]).map(([t]) => t).filter(t => t !== 'General').slice(0, 4)
  return (
    <div className="card" data-tour="alerts-card">
      <div className="row between"><h3><Bell size={15} /> Topic alerts</h3><button className="btn sm ghost" onClick={() => nav('/feed/alerts')}>{a.items.length ? `All ${a.items.length} →` : 'Manage →'}</button></div>
      {!a.topics.length && !a.authors.length
        ? <><p className="small muted" style={{ marginTop: 0 }}>Get new arXiv papers on your topics every day. Follow one to start:</p>{tags.map(t => <button key={t} className="tag" style={{ cursor: 'pointer' }} onClick={() => dispatch({ type: 'alerts', patch: { topics: [...a.topics, t], lastRun: 0 } })}>+ {t}</button>)}</>
        : top.length ? top.map(x => <div key={x.paper.id} className="list-item" onClick={() => nav('/feed/alerts')}><div className="grow"><div className="t small">{x.paper.title}</div><div className="tiny muted mono">{x.why[0]} · {matchPct(x.score)}% match</div></div></div>)
        : <p className="small muted" style={{ margin: 0 }}>Nothing new on {[...a.topics, ...a.authors].slice(0, 3).join(', ')} yet. Checked {a.lastRun ? new Date(a.lastRun).toLocaleDateString() : 'soon'}.</p>}
    </div>
  )
}
