import { useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Head, Prose, AiBadge, useAI, nav } from '../components/ui.jsx'
import { useStore } from '../lib/store.jsx'
import { search, coverage } from '../lib/nlp.js'
import { paperContext } from '../lib/ai.js'
import { download, toCsv, toLatex, toBibtex } from '../lib/exporter.js'

export function localNarrative(papers, topic) {
  if (!papers.length) return 'No papers selected.'
  const years = papers.map(p => p.year), cov = coverage(papers).sort((a, b) => b.share - a.share)
  const byYear = [...papers].sort((a, b) => a.year - b.year)
  const lims = [...new Set(papers.map(p => p.limitation).filter(Boolean))].slice(0, 4)
  return [
    `## Overview`, `This survey covers ${papers.length} papers on ${topic} published between ${Math.min(...years)} and ${Math.max(...years)}. The most covered themes are ${cov.slice(0, 3).map(c => c.key.toLowerCase()).join(', ')}; the least covered are ${cov.slice(-2).map(c => c.key.toLowerCase()).join(' and ')}.`,
    `## Evolution`, ...byYear.map(p => `- **${p.year} · ${p.title.split(':')[0]}** — ${p.method || 'approach'}: ${p.finding || p.abstract.slice(0, 90)}.`),
    `## Open challenges`, ...lims.map(l => `- ${l}`),
    `## Summary`, `${byYear.at(-1).title.split(':')[0]} represents the current frontier, while recurring limitations (${lims.slice(0, 2).join('; ').toLowerCase()}) remain unresolved.`,
  ].join('\n')
}

export default function LiteratureSurvey() {
  const { state, index } = useStore()
  const [source, setSource] = useState('memory')
  const [topic, setTopic] = useState('memory systems for LLM agents')
  const [view, setView] = useState('table')
  const [narrative, setNarrative] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const { run, busy, error } = useAI()

  const papers = useMemo(() => {
    if (source === 'starred') return state.papers.filter(p => p.starred)
    if (source === 'topic') return search(index, topic, 10).map(r => r.paper)
    const c = state.collections.find(c => c.id === source)
    return state.papers.filter(p => c?.paperIds.includes(p.id))
  }, [source, topic, state.papers, state.collections, index]).sort((a, b) => b.year - a.year)

  const summary = papers.length ? `${papers.length} papers. ${coverage(papers).sort((a, b) => b.share - a.share).slice(0, 2).map(c => c.key).join(' and ')} dominate; ${[...new Set(papers.map(p => p.limitation).filter(Boolean))].slice(0, 2).join(' and ').toLowerCase()} remain major challenges.` : ''

  async function generate() {
    const label = source === 'topic' ? topic : state.collections.find(c => c.id === source)?.name || 'starred papers'
    setView('narrative')
    setNarrative(await run({ maxTokens: 2000, prompt: `Write a literature survey on "${label}" from these papers. Sections: Overview, Taxonomy, Evolution, Comparison, Open Challenges, Future Directions. Cite as [n].\n\n${paperContext(papers)}`, fallback: () => localNarrative(papers, label) }))
  }
  const ex = fmt => {
    setExportOpen(false)
    if (fmt === 'csv') download('survey.csv', toCsv(papers), 'text/csv')
    if (fmt === 'tex') download('survey.tex', toLatex(papers, summary))
    if (fmt === 'bib') download('survey.bib', toBibtex(papers))
    if (fmt === 'md') download('survey.md', `# Literature Survey\n\n${narrative || localNarrative(papers, topic)}\n\n| Paper | Year | Method | Dataset | Finding | Limitation |\n|---|---|---|---|---|---|\n${papers.map(p => `| ${p.title} | ${p.year} | ${p.method} | ${p.dataset} | ${p.finding} | ${p.limitation} |`).join('\n')}`)
  }

  return (
    <>
      <Head n={6} title="Literature Survey" sub="Generate comprehensive surveys instantly" />
      <div className="card">
        <div className="row wrap between">
          <div className="row wrap">
            <div className="seg"><button className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}>Table view</button><button className={view === 'narrative' ? 'on' : ''} onClick={() => setView('narrative')}>Narrative view</button></div>
            <div style={{ position: 'relative' }}>
              <button className="btn" onClick={() => setExportOpen(!exportOpen)}>Export ▾</button>
              {exportOpen && <div className="card" style={{ position: 'absolute', zIndex: 5, padding: 6, top: 38, minWidth: 140 }}>{[['csv', 'CSV'], ['md', 'Markdown'], ['tex', 'LaTeX'], ['bib', 'BibTeX']].map(([k, l]) => <button key={k} className="btn ghost block" onClick={() => ex(k)}>{l}</button>)}</div>}
            </div>
          </div>
          <div className="row wrap">
            <select className="input" style={{ width: 'auto' }} value={source} onChange={e => setSource(e.target.value)}>
              {state.collections.map(c => <option key={c.id} value={c.id}>Collection: {c.name}</option>)}
              <option value="starred">Starred papers</option><option value="topic">Topic search…</option>
            </select>
            {source === 'topic' && <input className="input" style={{ width: 240 }} value={topic} onChange={e => setTopic(e.target.value)} />}
            <AiBadge />
            <button className="btn violet" disabled={busy || !papers.length} onClick={generate}>{busy ? <span className="spinner" /> : <Sparkles size={14} />} Generate survey</button>
          </div>
        </div>
        {error && <p className="small" style={{ color: 'var(--red)' }}>{error}</p>}
        <div style={{ marginTop: 14, overflowX: 'auto' }}>
          {view === 'table' ? <table className="data">
            <thead><tr><th>Paper</th><th>Year</th><th>Method</th><th>Dataset</th><th>Key findings</th><th>Limitations</th></tr></thead>
            <tbody>{papers.map(p => <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => nav(`/paper/${p.id}`)}><td><b>{p.title.split(':')[0]}</b></td><td>{p.year}</td><td>{p.method || '—'}</td><td>{p.dataset || '—'}</td><td>{p.finding || '—'}</td><td>{p.limitation || '—'}</td></tr>)}</tbody>
          </table> : <div className="card flat"><Prose text={narrative || localNarrative(papers, topic)} /></div>}
          {!papers.length && <div className="empty">No papers in this source.</div>}
        </div>
        {summary && <div className="card flat" style={{ marginTop: 14 }}><h3>Summary</h3><p style={{ margin: 0 }}>{summary}</p></div>}
      </div>
    </>
  )
}
