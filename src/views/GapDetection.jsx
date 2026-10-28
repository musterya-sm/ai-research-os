import { useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Head, Prose, AiBadge, useAI, nav, toast } from '../components/ui.jsx'
import Radar from '../components/Radar.jsx'
import { useStore } from '../lib/store.jsx'
import { detectGaps, coverage, hasDim, DIMENSIONS } from '../lib/nlp.js'
import { paperContext } from '../lib/ai.js'

export default function GapDetection() {
  const { state, dispatch } = useStore()
  const tags = [...new Set(state.papers.flatMap(p => p.tags))].sort()
  const [focus, setFocus] = useState('Memory')
  const [analysis, setAnalysis] = useState('')
  const { run, busy, error } = useAI()
  const gaps = useMemo(() => detectGaps(state.papers, focus), [state.papers, focus])
  const pool = state.papers.filter(p => p.tags.includes(focus))
  const cov = useMemo(() => coverage(pool), [pool])

  const openInCanvas = () => {
    const nodes = [{ id: `c:${focus}`, label: focus, kind: 'concept', x: 450, y: 270, color: '#d4f53c' }, ...gaps.slice(0, 3).map((g, i) => ({ id: `c:${g.dim}`, label: g.dim, kind: 'concept', x: 450 + Math.cos(i * 2.1) * 220, y: 270 + Math.sin(i * 2.1) * 170, color: '#fca5a5' }))]
    dispatch({ type: 'addToCanvas', nodes, edges: gaps.slice(0, 3).map(g => ({ from: `c:${focus}`, to: `c:${g.dim}` })) })
    toast('Gaps added to canvas'); nav('/canvas')
  }
  const explain = async () => setAnalysis(await run({
    prompt: `Focus area: ${focus}. Statistically under-explored combinations in this library: ${gaps.map(g => `${g.title} (${g.both} papers, ${g.expected.toFixed(1)} expected)`).join('; ')}.\nFor each gap: why it matters, what a first experiment would look like, and the closest existing work [n].\n\n${paperContext(pool.slice(0, 15))}`,
    fallback: () => gaps.map(g => {
      const near = state.papers.filter(p => hasDim(p, DIMENSIONS.find(d => d.key === g.dim))).slice(0, 2)
      return `## ${g.title}\n- ${g.detail}\n- Nearest work on ${g.dim.toLowerCase()}: ${near.map(p => `**${p.title.split(':')[0]}**`).join(', ') || 'none'}.\n- First experiment: add a ${g.dim.toLowerCase()} component to a ${focus.toLowerCase()} baseline and evaluate on LoCoMo-style long-horizon tasks.`
    }).join('\n'),
  }))

  return (
    <>
      <Head n={7} title="Gap Detection" sub="AI identifies research gaps & opportunities">
        <select className="input" style={{ width: 'auto' }} value={focus} onChange={e => { setFocus(e.target.value); setAnalysis('') }}>{tags.map(t => <option key={t}>{t}</option>)}</select>
      </Head>
      <div className="grid g2">
        <div className="card">
          <h3>Detected gaps <span className="muted">· {focus} ({pool.length} papers)</span></h3>
          <div className="stack">
            {gaps.map((g, i) => (
              <div key={g.dim} className="list-item" style={{ cursor: 'default' }}>
                <span className="num" style={{ fontSize: 14, padding: '0 6px' }}>{i + 1}</span>
                <div className="grow"><div className="t">{g.title}</div><div className="small muted">{g.detail}</div>
                  <span className={`tag ${g.impact === 'HIGH IMPACT' ? 'lime' : ''}`} style={{ marginTop: 6 }}>{g.impact}</span></div>
              </div>
            ))}
          </div>
          <div className="row between" style={{ marginTop: 12 }}><AiBadge /><button className="btn violet" disabled={busy} onClick={explain}>{busy ? <span className="spinner" /> : <Sparkles size={14} />} Analyze gaps</button></div>
          {error && <p className="small" style={{ color: 'var(--red)' }}>{error}</p>}
          {analysis && <div className="card flat" style={{ marginTop: 12 }}><Prose text={analysis} /></div>}
        </div>
        <div className="card">
          <h3>Gap map</h3>
          <div style={{ display: 'grid', placeItems: 'center' }}><Radar data={cov} size={340} /></div>
          <div className="row" style={{ justifyContent: 'center', gap: 16 }}><span className="small row" style={{ gap: 6 }}><i style={{ width: 12, height: 12, background: '#7c4dff', display: 'inline-block' }} /> Explored</span><span className="small row" style={{ gap: 6 }}><i style={{ width: 12, height: 12, border: '1.5px solid var(--muted)', display: 'inline-block' }} /> Unexplored</span></div>
          <table className="data" style={{ marginTop: 12 }}><tbody>{cov.map(c => <tr key={c.key}><td>{c.key}</td><td style={{ width: '50%' }}><div style={{ height: 8, background: 'var(--soft)' }}><div style={{ height: 8, width: `${c.share * 100}%`, background: 'var(--violet)' }} /></div></td><td className="mono tiny">{c.count}</td></tr>)}</tbody></table>
          <button className="btn block" style={{ marginTop: 12 }} onClick={openInCanvas}>Open in canvas</button>
        </div>
      </div>
    </>
  )
}
