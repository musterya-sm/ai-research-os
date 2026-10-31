import { useMemo, useState } from 'react'
import { BookOpen, Check, Pin, PinOff, X, Plus, Target } from 'lucide-react'
import { Head, nav, toast, Progress, progressOf, ago } from '../components/ui.jsx'
import { useStore, dayKey } from '../lib/store.jsx'
import { queryVector, cosine } from '../lib/nlp.js'

const DAYS = 14
const open = p => nav(`/paper/${encodeURIComponent(p.id)}${p.hasPdf ? '/pdf' : ''}`)
const pagesLeft = p => Math.max(0, (p.pages || p.pdfPages || 12) - (p.readMax || 0)) // 12 ≈ a typical paper when page count is unknown

// Pages read per day for the last two weeks. Single series: one colour, no legend; each bar has a hover tooltip.
function DailyPages({ log }) {
  const days = [...Array(DAYS)].map((_, i) => { const t = Date.now() - (DAYS - 1 - i) * 864e5; return { key: dayKey(t), label: new Date(t).toLocaleDateString(undefined, { weekday: 'narrow' }), n: log[dayKey(t)] || 0 } })
  const max = Math.max(5, ...days.map(d => d.n))
  const W = 28, H = 90
  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${DAYS * W} ${H + 18}`} style={{ width: '100%', display: 'block' }} role="img" aria-label={`Pages read per day, last ${DAYS} days: ${days.map(d => `${d.key} ${d.n}`).join(', ')}`}>
        <line x1={0} x2={DAYS * W} y1={H} y2={H} stroke="var(--soft)" strokeWidth={1} />
        {days.map((d, i) => {
          const h = d.n ? Math.max(4, (d.n / max) * (H - 6)) : 0, x = i * W + 5, w = W - 10
          return (
            <g key={d.key}>
              <title>{`${new Date(d.key).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}: ${d.n} page${d.n === 1 ? '' : 's'}`}</title>
              <rect x={i * W} y={0} width={W} height={H + 18} fill="transparent" />
              {h > 0 && <path d={`M${x},${H} V${H - h + 4} q0,-4 4,-4 h${w - 8} q4,0 4,4 V${H} Z`} fill="var(--violet)" />}
              <text x={i * W + W / 2} y={H + 14} textAnchor="middle" fontSize={10} style={{ fill: 'var(--muted)' }}>{d.label}</text>
            </g>)
        })}
      </svg>
      <figcaption className="tiny muted">Pages read per day · last {DAYS} days · hover a bar for the number</figcaption>
    </figure>
  )
}

export default function Reading() {
  const { state, dispatch, index } = useStore()
  const [goal, setGoal] = useState(state.settings.readingGoal)
  const log = state.readLog || {}
  const vec = id => index.vectors[index.papers.findIndex(p => p.id === id)]

  // How well each paper fits the goal; without a goal, how close it is to what you starred.
  const fit = useMemo(() => {
    const g = state.settings.readingGoal.trim()
    const starred = state.papers.filter(p => p.starred).map(p => vec(p.id)).filter(Boolean)
    const gv = g ? queryVector(index, g) : null
    return p => { const v = vec(p.id); if (!v) return 0; return gv ? cosine(gv, v) : starred.length ? starred.reduce((n, s) => n + cosine(s, v), 0) / starred.length : 0 }
  }, [index, state.settings.readingGoal, state.papers])

  const queue = useMemo(() => {
    const qd = state.papers.filter(p => p.status === 'reading' || p.status === 'toread')
    const why = p => p.queuePin ? 'Pinned' : p.status === 'reading' ? `In progress${p.lastReadAt ? ` · last read ${ago(p.lastReadAt)}` : ''}` : state.settings.readingGoal ? (fit(p) > 0.005 ? `${Math.round(100 * Math.sqrt(fit(p)))}% fit with your goal` : 'Queued · not related to your goal') : 'Close to your starred papers'
    const rank = p => (p.queuePin ? 3e13 + p.queuePin : 0) + (p.status === 'reading' ? 1e13 + (p.lastReadAt || 0) : fit(p) * 1e6 + (p.addedAt || 0) / 1e9)
    return qd.map(p => ({ p, why: why(p) })).sort((a, b) => rank(b.p) - rank(a.p))
  }, [state.papers, fit])

  const suggestions = useMemo(() => state.settings.readingGoal.trim()
    ? state.papers.filter(p => !p.status).map(p => ({ p, s: fit(p) })).filter(x => x.s > 0.02).sort((a, b) => b.s - a.s).slice(0, 5) : [], [state.papers, fit])

  // Progress numbers.
  const weekKeys = [...Array(7)].map((_, i) => dayKey(Date.now() - i * 864e5))
  const pagesWeek = weekKeys.reduce((n, k) => n + (log[k] || 0), 0)
  const doneWeek = state.papers.filter(p => p.status === 'done' && p.doneAt > Date.now() - 7 * 864e5).length
  let streak = 0
  for (let i = log[dayKey()] ? 0 : 1; log[dayKey(Date.now() - i * 864e5)]; i++) streak++
  const active = [...Array(DAYS)].map((_, i) => log[dayKey(Date.now() - i * 864e5)] || 0).filter(Boolean)
  const pace = active.length ? active.reduce((a, b) => a + b, 0) / active.length : 0
  const left = queue.reduce((n, x) => n + pagesLeft(x.p), 0)

  const set = (p, patch, msg) => { dispatch({ type: 'updatePaper', id: p.id, patch }); msg && toast(msg) }
  const saveGoal = () => { dispatch({ type: 'settings', patch: { readingGoal: goal.trim() } }); toast(goal.trim() ? 'Queue re-ranked for your goal' : 'Goal cleared') }

  return (
    <>
      <Head n={20} title="Reading Queue" sub="What to read next, and how you're doing" />
      <div className="grid side-r">
        <div className="stack">
          <div className="card" data-tour="reading-goal">
            <form className="row" onSubmit={e => { e.preventDefault(); saveGoal() }}>
              <Target size={18} />
              <input className="input" placeholder="What are you working towards? e.g. “survey of memory for LLM agents”" value={goal} onChange={e => setGoal(e.target.value)} />
              <button className="btn violet" disabled={goal.trim() === state.settings.readingGoal}>Rank by goal</button>
            </form>
            {suggestions.length > 0 && <div style={{ marginTop: 12 }}>
              <div className="label muted">Not in your queue yet, but fits the goal</div>
              {suggestions.map(({ p }) => <div key={p.id} className="row between small" style={{ padding: '6px 0', borderBottom: '1.5px solid var(--soft)' }}>
                <span style={{ cursor: 'pointer' }} onClick={() => nav(`/paper/${encodeURIComponent(p.id)}`)}>{p.title}</span>
                <button className="btn sm" onClick={() => set(p, { status: 'toread' }, 'Added to your queue')}><Plus size={12} /> Queue</button></div>)}
            </div>}
          </div>

          <div className="card" data-tour="reading-queue">
            <div className="row between"><h3>Up next · {queue.length}</h3><span className="small muted">{left} pages left{pace ? ` · ~${Math.ceil(left / pace)} reading days at your pace` : ''}</span></div>
            {!queue.length && <div className="empty">Your queue is empty. Set a paper to “To read” from its page, or set a goal above to get suggestions.</div>}
            {queue.map(({ p, why }, i) => (
              <div key={p.id} className="list-item" style={{ cursor: 'default', alignItems: 'center' }}>
                <span className="num" style={{ fontSize: 14, padding: '0 6px' }}>{i + 1}</span>
                <div className="grow" style={{ cursor: 'pointer' }} onClick={() => open(p)}>
                  <div className="t small">{p.title}</div>
                  <div className="tiny muted mono" style={{ marginTop: 4 }}>{progressOf(p) > 0 && <><Progress p={p} w={60} /> {Math.round(progressOf(p) * 100)}% · </>}{p.authors[0]} · {p.year} · ↳ {why}</div>
                </div>
                <span className="row" style={{ gap: 4 }}>
                  <button className="btn sm" title="Read" onClick={() => open(p)}><BookOpen size={13} /></button>
                  <button className="btn sm ghost" title={p.queuePin ? 'Unpin' : 'Pin to top'} onClick={() => set(p, { queuePin: p.queuePin ? undefined : Date.now() })}>{p.queuePin ? <PinOff size={13} /> : <Pin size={13} />}</button>
                  <button className="btn sm ghost" title="Mark done" onClick={() => set(p, { status: 'done', queuePin: undefined }, 'Marked as read 🎉')}><Check size={13} /></button>
                  <button className="btn sm ghost" title="Remove from queue" onClick={() => set(p, { status: undefined, queuePin: undefined })}><X size={13} /></button>
                </span>
              </div>))}
          </div>
        </div>

        <div className="stack">
          <div className="card" data-tour="reading-progress">
            <h3>Progress</h3>
            <div className="grid g2">
              {[['Pages this week', pagesWeek], ['Finished this week', doneWeek], ['Day streak', streak], ['Read in total', state.papers.filter(p => p.status === 'done').length]].map(([l, v]) =>
                <div key={l} className="stat"><small>{l}</small><b>{v}</b></div>)}
            </div>
            <div style={{ marginTop: 14 }}><DailyPages log={log} /></div>
            <p className="tiny muted" style={{ marginBottom: 0 }}>Counted from the PDF reader: each page past the furthest one you had reached counts once.</p>
          </div>
          <div className="card">
            <h3>Recently finished</h3>
            {state.papers.filter(p => p.status === 'done').sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 6).map(p =>
              <div key={p.id} className="small" style={{ padding: '6px 0', borderBottom: '1.5px solid var(--soft)', cursor: 'pointer' }} onClick={() => nav(`/paper/${encodeURIComponent(p.id)}`)}>✓ {p.title.split(':')[0]}{p.doneAt ? <span className="muted tiny"> · {ago(p.doneAt)}</span> : null}</div>)}
            {!state.papers.some(p => p.status === 'done') && <p className="small muted" style={{ margin: 0 }}>Nothing finished yet.</p>}
          </div>
        </div>
      </div>
    </>
  )
}
