import { useMemo, useState } from 'react'
import { Search, Globe, Download } from 'lucide-react'
import { Head, PaperRow, nav, toast } from '../components/ui.jsx'
import { useStore } from '../lib/store.jsx'
import { search } from '../lib/nlp.js'
import { searchPapers } from '../lib/sources.js'
import { searchHighlights, KINDS } from '../lib/highlights.js'

const EXAMPLES = ['memory management in llm agents', 'retrieval vs long context', 'agents that learn tools', 'self-correction reasoning']

export default function SemanticSearch({ arg }) {
  const { state, dispatch, index } = useStore()
  const [q, setQ] = useState(decodeURIComponent(arg || 'memory management in llm agents'))
  const [submitted, setSubmitted] = useState(q)
  const [sort, setSort] = useState('relevance')
  const [web, setWeb] = useState(null)
  const [busy, setBusy] = useState(false)
  const results = useMemo(() => {
    const r = search(index, submitted)
    return sort === 'year' ? [...r].sort((a, b) => b.paper.year - a.paper.year) : sort === 'citations' ? [...r].sort((a, b) => b.paper.citations - a.paper.citations) : r
  }, [index, submitted, sort])
  const have = new Set(state.papers.map(p => p.id))
  const notes = useMemo(() => searchHighlights(state.highlights, submitted, 6), [state.highlights, submitted])

  const go = text => { setQ(text); setSubmitted(text); setWeb(null); nav(`/search/${encodeURIComponent(text)}`) }
  async function searchWeb() {
    setBusy(true)
    try { setWeb(await searchPapers(submitted, 10, { source: state.settings.paperSource })) } catch (e) { toast(`Paper search unavailable: ${e.message}`) } finally { setBusy(false) }
  }

  return (
    <>
      <Head n={5} title="Semantic Search" sub="Find papers by meaning, not just keywords" />
      <div className="card">
        <form className="row" onSubmit={e => { e.preventDefault(); go(q) }}>
          <div className="search grow"><Search size={16} /><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Describe what you are looking for..." /></div>
          <button className="btn violet">Search</button>
        </form>
        <div className="row wrap" style={{ marginTop: 10 }}>{EXAMPLES.map(x => <button key={x} className="tag" style={{ cursor: 'pointer' }} onClick={() => go(x)}>{x}</button>)}</div>
        <div className="row between" style={{ margin: '16px 0 10px' }}>
          <span className="muted small">Found {results.length} papers in your library</span>
          <div className="row">
            <button className="btn sm" disabled={busy || !submitted} onClick={searchWeb}>{busy ? <span className="spinner" /> : <Globe size={13} />} Also search arXiv</button>
            <select className="input" style={{ width: 'auto', padding: '4px 8px' }} value={sort} onChange={e => setSort(e.target.value)}><option value="relevance">Sort: Relevance</option><option value="year">Sort: Newest</option><option value="citations">Sort: Citations</option></select>
          </div>
        </div>
        {notes.length > 0 && <div className="card flat" style={{ marginBottom: 12, padding: 12 }}>
          <div className="row between"><h3 style={{ margin: 0 }}>In your notebook · {notes.length}</h3><button className="btn sm" onClick={() => nav('/notes')}>Open notebook</button></div>
          <div className="stack" style={{ marginTop: 8 }}>{notes.map(h => <div key={h.id} className="small" style={{ borderLeft: `5px solid ${KINDS[h.kind].color}`, paddingLeft: 8, cursor: h.paperId ? 'pointer' : 'default' }} onClick={() => h.paperId && nav(`/paper/${encodeURIComponent(h.paperId)}/${h.page ? `pdf:${h.page}:${h.id}` : ''}`)}>{h.kind === 'term' ? <><b>{h.term}</b> — {h.definition}</> : <>“{h.text.slice(0, 180)}”</>}{h.note && <span className="muted"> ✎ {h.note}</span>}</div>)}</div>
        </div>}
        <div className="stack">
          {results.map(r => <PaperRow key={r.paper.id} paper={r.paper} right={<span className="match">{r.match}% MATCH</span>} />)}
          {!results.length && <div className="empty">No semantic matches. Try different words or search arXiv.</div>}
        </div>
        {web && <>
          <h3 style={{ marginTop: 22 }}>From arXiv</h3>
          <div className="stack">{web.map(p => (
            <div key={p.id} className="list-item" style={{ cursor: 'default' }}>
              <div className="grow"><div className="t">{p.title}</div><div className="muted tiny mono">{p.authors.join(', ')} · {p.year} · {p.arxiv}</div><div className="small muted">{p.abstract.slice(0, 200)}…</div></div>
              {have.has(p.id) ? <span className="tag">IN LIBRARY</span> : <button className="btn sm" onClick={() => { dispatch({ type: 'addPapers', papers: [p] }); toast('Added to library') }}><Download size={13} /> Add</button>}
            </div>))}
          </div>
        </>}
      </div>
    </>
  )
}
