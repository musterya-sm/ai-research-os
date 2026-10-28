import { useState } from 'react'
import { Play, Download } from 'lucide-react'
import { Head, Prose, AiBadge, useAI, nav } from '../components/ui.jsx'
import { useStore } from '../lib/store.jsx'
import { search, summarize, detectGaps, coverage } from '../lib/nlp.js'
import { searchArxiv } from '../lib/arxiv.js'
import { paperContext } from '../lib/ai.js'
import { localNarrative } from './LiteratureSurvey.jsx'
import { download } from '../lib/exporter.js'
import { searchHighlights, highlightsContext } from '../lib/highlights.js'

const STEPS = [['Query', 'Define your research question'], ['Discover Agent', 'Find relevant papers & data'], ['Summarize Agent', 'Extract key insights'], ['Analyze Agent', 'Find patterns, gaps, trends'], ['Write Agent', 'Generate surveys'], ['Report', 'Final research report']]

export default function AgentWorkflows() {
  const { state, dispatch, index } = useStore()
  const [q, setQ] = useState('memory management for long-horizon LLM agents')
  const [useArxiv, setUseArxiv] = useState(false)
  const [stage, setStage] = useState(-1)
  const [log, setLog] = useState([])
  const [report, setReport] = useState('')
  const { run } = useAI()
  const say = (step, text) => setLog(l => [...l, { step, text }])
  const pause = () => new Promise(r => setTimeout(r, 450))

  async function start() {
    setLog([]); setReport('')
    setStage(0); say(0, `Question: “${q}”`); await pause()

    setStage(1)
    let papers = search(index, q, 10).map(r => r.paper)
    say(1, `Found ${papers.length} relevant papers in library.`)
    if (useArxiv) {
      try { const fresh = (await searchArxiv(q, 6)).filter(p => !state.papers.some(x => x.id === p.id)); dispatch({ type: 'addPapers', papers: fresh }); papers = [...papers, ...fresh]; say(1, `Imported ${fresh.length} new papers from arXiv.`) } catch (e) { say(1, `arXiv skipped: ${e.message}`) }
    }
    await pause()

    setStage(2)
    const insights = papers.map(p => `${p.title.split(':')[0]} — ${p.finding || summarize(p.abstract, 1)}`)
    insights.slice(0, 4).forEach(t => say(2, t)); await pause()

    setStage(3)
    const focus = papers.flatMap(p => p.tags).reduce((m, t) => (m[t] = (m[t] || 0) + 1, m), {})
    const top = Object.entries(focus).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Memory'
    const gaps = detectGaps(state.papers, top).slice(0, 3)
    const cov = coverage(papers).sort((a, b) => b.share - a.share)
    say(3, `Dominant concept: ${top}. Strongest coverage: ${cov.slice(0, 2).map(c => c.key).join(', ')}.`)
    gaps.forEach(g => say(3, `Gap: ${g.title} (${g.impact.toLowerCase()})`)); await pause()

    setStage(4); say(4, 'Drafting survey…')
    const body = await run({ maxTokens: 2200, prompt: `Write a concise research report answering: "${q}". Include: Executive summary, Key findings, Research gaps (${gaps.map(g => g.title).join('; ')}), Recommended next experiments. Cite [n].\n\n${paperContext(papers, q)}${(() => { const n = searchHighlights(state.highlights, q, 8); return n.length ? `\n\nUser's notes:\n${highlightsContext(n)}` : '' })()}`, fallback: () => localNarrative(papers, q) })
    const full = `# Research Report\n\n**Question:** ${q}\n\n${body}\n\n## Research gaps\n${gaps.map(g => `- **${g.title}** — ${g.detail}`).join('\n')}\n\n## Sources\n${papers.map((p, i) => `${i + 1}. ${p.title} (${p.year}) arXiv:${p.arxiv}`).join('\n')}`
    setStage(5); setReport(full); say(5, 'Report ready.')
    dispatch({ type: 'log', text: 'ran a research agent workflow' })
    setStage(6)
  }

  return (
    <>
      <Head n={13} title="AI Agent Workflows" sub="Automate research tasks with AI agents" violet><AiBadge /></Head>
      <div className="card">
        <form className="row wrap" onSubmit={e => { e.preventDefault(); start() }}>
          <input className="input grow" value={q} onChange={e => setQ(e.target.value)} placeholder="Research question" />
          <label className="row small"><input type="checkbox" checked={useArxiv} onChange={e => setUseArxiv(e.target.checked)} /> Discover on arXiv</label>
          <button className="btn violet" disabled={stage >= 0 && stage < 6}>{stage >= 0 && stage < 6 ? <span className="spinner" /> : <Play size={14} />} Run workflow</button>
        </form>
        <div className="flow" style={{ marginTop: 18 }}>
          {STEPS.map(([t, d], i) => <span key={t} style={{ display: 'contents' }}>
            <div className={`step ${stage === i ? 'run' : stage > i ? 'done' : ''}`}><div style={{ fontWeight: 700, color: i === 5 && stage <= i ? 'var(--violet)' : null }}>{t}</div><div className="small" style={{ marginTop: 6, opacity: .8 }}>{d}</div></div>
            {i < STEPS.length - 1 && <span className="arrow">→</span>}
          </span>)}
        </div>
      </div>
      {log.length > 0 && <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="card"><h3>Agent log</h3><div className="stack mono small">{log.map((l, i) => <div key={i}><span className="tag">{STEPS[l.step][0]}</span> {l.text}</div>)}</div></div>
        <div className="card">
          <div className="row between"><h3 style={{ margin: 0 }}>Report</h3>{report && <div className="row"><button className="btn sm" onClick={() => download('research-report.md', report)}><Download size={13} /> .md</button><button className="btn sm" onClick={() => nav('/survey')}>Open survey</button></div>}</div>
          {report ? <Prose text={report} /> : <p className="muted">Running…</p>}
        </div>
      </div>}
    </>
  )
}
