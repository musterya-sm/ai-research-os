import { useMemo, useState } from 'react'
import { Sparkles, Trash2, Save, FlaskConical } from 'lucide-react'
import { Head, AiBadge, useAI, nav, toast, ago } from '../components/ui.jsx'
import { useStore } from '../lib/store.jsx'
import { detectGaps } from '../lib/nlp.js'
import { paperContext } from '../lib/ai.js'

const TEMPLATES = [
  (f, g, p) => ({ text: `What if we combine ${f.toLowerCase()} with ${g.toLowerCase()} — e.g. extend ${p} with a ${g.toLowerCase()} module — to create more adaptive agents?`, concepts: [f, g] }),
  (f, g, p) => ({ text: `Could hierarchical ${f.toLowerCase()} with dynamic ${g.toLowerCase()} enable effectively unlimited context windows beyond ${p}?`, concepts: [f, g, 'Long Context'] }),
  (f, g, p) => ({ text: `Do agents with episodic ${f.toLowerCase()} + reflection outperform standard ReAct agents on long-horizon ${g.toLowerCase()} tasks?`, concepts: [f, g, 'Reasoning'] }),
]

export default function Hypotheses() {
  const { state, dispatch, index } = useStore()
  const tags = [...new Set(state.papers.flatMap(p => p.tags))].sort()
  const [focus, setFocus] = useState('Memory')
  const [list, setList] = useState(null)
  const [sel, setSel] = useState(0)
  const { run, busy, error } = useAI()
  const gaps = useMemo(() => detectGaps(state.papers, focus), [state.papers, focus])
  const anchor = state.papers.filter(p => p.tags.includes(focus)).sort((a, b) => b.citations - a.citations)[0]
  const local = () => gaps.slice(0, 3).map((g, i) => ({ ...TEMPLATES[i % 3](focus, g.dim, anchor?.title.split(':')[0] || 'current systems'), rationale: g.detail }))

  async function generate() {
    const out = await run({
      prompt: `Generate 3 novel, testable research hypotheses for "${focus}" targeting these gaps: ${gaps.map(g => g.title).join('; ')}. Respond ONLY with JSON: [{"text": "...", "concepts": ["...", "..."], "rationale": "..."}].\n\n${paperContext(state.papers.filter(p => p.tags.includes(focus)).slice(0, 12))}`,
      fallback: () => JSON.stringify(local()),
    })
    try { setList(JSON.parse(out.match(/\[[\s\S]*\]/)[0])) } catch { setList(local()) }
    setSel(0)
  }
  const shown = list || local()
  const h = shown[sel]
  const saveToCanvas = () => {
    const hid = `h:${Date.now()}`
    const nodes = [{ id: hid, label: 'Hypothesis', kind: 'paper', x: 450, y: 270, color: '#d4f53c' }, ...h.concepts.map((c, i) => ({ id: `c:${c}`, label: c, kind: 'concept', x: 450 + Math.cos(i * 2.2) * 200, y: 270 + Math.sin(i * 2.2) * 160, color: '#c4b5fd' }))]
    dispatch({ type: 'addToCanvas', nodes, edges: h.concepts.map(c => ({ from: `c:${c}`, to: hid })) })
    dispatch({ type: 'saveHypothesis', h: { ...h, focus } })
    toast('Saved to canvas'); nav('/canvas')
  }

  return (
    <>
      <Head n={8} title="Hypothesis Generator" sub="AI suggests novel research hypotheses">
        <select className="input" style={{ width: 'auto' }} value={focus} onChange={e => { setFocus(e.target.value); setList(null) }}>{tags.map(t => <option key={t}>{t}</option>)}</select>
        <AiBadge />
        <button className="btn violet" disabled={busy} onClick={generate}>{busy ? <span className="spinner" /> : <Sparkles size={14} />} Generate</button>
      </Head>
      {error && <p className="small" style={{ color: 'var(--red)' }}>{error}</p>}
      <div className="grid g2">
        <div className="card">
          <h3>Suggested hypotheses</h3>
          <div className="stack">{shown.map((x, i) => (
            <div key={i} className="list-item" style={{ background: sel === i ? 'var(--soft)' : null }} onClick={() => setSel(i)}>
              <span className="num" style={{ fontSize: 14, padding: '0 6px' }}>{i + 1}</span>
              <div className="grow"><div>{x.text}</div>{x.rationale && <div className="small muted" style={{ marginTop: 4 }}>{x.rationale}</div>}</div>
              <button className="btn sm" title="Save" onClick={e => { e.stopPropagation(); dispatch({ type: 'saveHypothesis', h: { ...x, focus } }); toast('Hypothesis saved') }}><Save size={13} /></button>
            </div>))}
          </div>
        </div>
        <div className="card">
          <h3>Hypothesis graph</h3>
          {h && <HypGraph concepts={h.concepts} />}
          <button className="btn block" onClick={saveToCanvas}>Save to canvas</button>
        </div>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h3>Saved hypotheses ({state.hypotheses.length})</h3>
        {!state.hypotheses.length && <p className="muted small">Nothing saved yet.</p>}
        {state.hypotheses.map(x => <div key={x.id} className="row between small" style={{ padding: '8px 0', borderBottom: '1.5px solid var(--soft)' }}><span><span className="tag">{x.focus}</span> {x.text}</span><span className="row"><button className="btn sm" onClick={() => nav(`/lab/new/hyp:${x.id}`)}><FlaskConical size={12} /> Plan experiment</button><span className="muted tiny">{ago(x.at)}</span><button className="star" onClick={() => dispatch({ type: 'deleteHypothesis', id: x.id })}><Trash2 size={13} /></button></span></div>)}
      </div>
    </>
  )
}

function HypGraph({ concepts }) {
  const fills = ['#c4b5fd', '#a7f3d0', '#8b5cf6', '#93c5fd', '#fde68a']
  const W = 420, H = 280, cx = W / 2, cy = H / 2
  const pts = concepts.map((c, i) => { const a = -Math.PI / 2 + (i / concepts.length) * Math.PI * 2; return { c, x: cx + Math.cos(a) * 140, y: cy + Math.sin(a) * 95 } })
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', marginBottom: 12 }}>
      {pts.map(p => <line key={p.c} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="var(--ink)" strokeWidth={1.5} />)}
      {pts.map((p, i) => pts.slice(i + 1).map(q => <line key={p.c + q.c} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="var(--muted)" strokeDasharray="4 4" />))}
      <rect x={cx - 50} y={cy - 18} width={100} height={36} fill="#d4f53c" stroke="#0d0d0d" strokeWidth={2} /><text x={cx} y={cy + 4} textAnchor="middle" fontSize={11} fontWeight={700} fontFamily="JetBrains Mono" style={{ fill: '#0d0d0d' }}>HYPOTHESIS</text>
      {pts.map((p, i) => <g key={p.c}><rect x={p.x - 52} y={p.y - 16} width={104} height={32} rx={6} fill={fills[i % 5]} stroke="#0d0d0d" strokeWidth={2} /><text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={11} fontFamily="Inter" fontWeight={600} style={{ fill: '#0d0d0d' }}>{p.c}</text></g>)}
    </svg>
  )
}
