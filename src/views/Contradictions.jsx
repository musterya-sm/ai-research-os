import { useMemo, useState } from 'react'
import { AlertTriangle, Sparkles } from 'lucide-react'
import { Head, Modal, Prose, AiBadge, useAI, nav } from '../components/ui.jsx'
import { useStore } from '../lib/store.jsx'
import { CLAIMS } from '../data/seed.js'
import { paperContext } from '../lib/ai.js'

const TOPIC_LABEL = { 'more-context': 'Does more context help?', 'self-correction': 'Can LLMs self-correct?', 'long-context-vs-retrieval': 'Long context vs retrieval', 'retrieval-vs-scale': 'Retrieval vs scale', forgetting: 'Should memory forget?' }

export default function Contradictions() {
  const { state } = useStore()
  const [open, setOpen] = useState(null)
  const [analysis, setAnalysis] = useState({})
  const [scan, setScan] = useState('')
  const { run, busy, error } = useAI()
  const byId = Object.fromEntries(state.papers.map(p => [p.id, p]))
  const pairs = useMemo(() => {
    const claims = CLAIMS.filter(c => byId[c.arxiv])
    const out = []
    for (const a of claims) for (const b of claims) if (a.topic === b.topic && a.stance > 0 && b.stance < 0) out.push({ a, b, pa: byId[a.arxiv], pb: byId[b.arxiv], topic: a.topic })
    return out
  }, [state.papers])

  const localAnalysis = ({ a, b, pa, pb }) => [
    `## ${TOPIC_LABEL[a.topic]}`, `- **${pa.title.split(':')[0]} (${pa.year})**: ${a.text}`, `- **${pb.title.split(':')[0]} (${pb.year})**: ${b.text}`,
    `## Why they may disagree`, `- Setup differs: ${pa.method} on ${pa.dataset} vs ${pb.method} on ${pb.dataset}.`, pa.year !== pb.year ? `- ${Math.abs(pa.year - pb.year)} years apart — model scale and capability changed in between.` : '- Same year: differences are likely due to evaluation choices.',
    `## How to reconcile`, `- Run both setups on a shared benchmark and report results by condition (task type, model size, feedback availability).`,
  ].join('\n')
  async function analyze(pair, i) {
    setOpen(i)
    if (analysis[i]) return
    const text = await run({ prompt: `These two papers appear to make conflicting claims.\nClaim [1]: ${pair.a.text}\nClaim [2]: ${pair.b.text}\nExplain whether this is a true contradiction or a difference in conditions, which evidence is stronger, and an experiment to resolve it.\n\n${paperContext([pair.pa, pair.pb])}`, fallback: () => localAnalysis(pair) })
    setAnalysis(x => ({ ...x, [i]: text }))
  }
  const deepScan = async () => setScan(await run({ maxTokens: 1600, prompt: `Scan these papers for pairs whose findings conflict or are in tension. List each pair with both claims and the likely reason.\n\n${paperContext(state.papers.slice(0, 30))}`, fallback: () => 'Deep scan across all abstracts needs a Claude API key (Settings → Integrations). The curated contradictions above use claim annotations.' }))

  return (
    <>
      <Head n={9} title="Contradiction Detection" sub="Find conflicting results & claims"><AiBadge /><button className="btn violet" disabled={busy} onClick={deepScan}>{busy ? <span className="spinner" /> : <Sparkles size={14} />} Deep scan library</button></Head>
      {error && <p className="small" style={{ color: 'var(--red)' }}>{error}</p>}
      <div className="card">
        <h3>Potential contradictions found · {pairs.length}</h3>
        <div className="stack">{pairs.map((pair, i) => (
          <div key={i} className="list-item" style={{ cursor: 'default', alignItems: 'center' }}>
            <AlertTriangle size={26} />
            <div className="grow"><div className="mono tiny muted">{pair.pa.title.split(':')[0]} ({pair.pa.year})</div><div className="small">{pair.a.text}</div></div>
            <span className="num" style={{ fontSize: 12, padding: '2px 6px', background: 'var(--ink)', color: 'var(--bg)' }}>VS</span>
            <div className="grow"><div className="mono tiny muted">{pair.pb.title.split(':')[0]} ({pair.pb.year})</div><div className="small">{pair.b.text}</div></div>
            <button className="btn sm" onClick={() => analyze(pair, i)}>View analysis</button>
          </div>))}
          {!pairs.length && <div className="empty">No annotated conflicting claims in your library. Use Deep scan.</div>}
        </div>
      </div>
      {scan && <div className="card" style={{ marginTop: 16 }}><h3>Deep scan</h3><Prose text={scan} /></div>}
      {open != null && <Modal title="Contradiction analysis" onClose={() => setOpen(null)}>
        {analysis[open] ? <Prose text={analysis[open]} /> : <span className="spinner" />}
        <div className="row" style={{ marginTop: 14 }}><button className="btn sm" onClick={() => nav(`/paper/${pairs[open].pa.id}`)}>Open paper A</button><button className="btn sm" onClick={() => nav(`/paper/${pairs[open].pb.id}`)}>Open paper B</button></div>
      </Modal>}
    </>
  )
}
