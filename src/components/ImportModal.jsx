import { useState } from 'react'
import { Download, Plus } from 'lucide-react'
import { Modal, toast } from './ui.jsx'
import { useStore } from '../lib/store.jsx'
import { searchArxiv, parseBibtex, inferTags } from '../lib/arxiv.js'

export default function ImportModal({ onClose }) {
  const { state, dispatch } = useStore()
  const [tab, setTab] = useState('arxiv')
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [bib, setBib] = useState('')
  const [manual, setManual] = useState({ title: '', authors: '', year: new Date().getFullYear(), abstract: '' })
  const have = new Set(state.papers.map(p => p.id))

  async function go(e) {
    e.preventDefault(); setBusy(true); setErr('')
    try { setResults(await searchArxiv(q, 12)) } catch (x) { setErr(`${x.message}. Run the app with "npm run dev" so the arXiv proxy is available.`) } finally { setBusy(false) }
  }
  const add = ps => { dispatch({ type: 'addPapers', papers: ps }); toast(`Imported ${ps.length} paper${ps.length > 1 ? 's' : ''}`) }

  return (
    <Modal title="Import papers" onClose={onClose} wide>
      <div className="tabs">{[['arxiv', 'arXiv search / ID'], ['bibtex', 'BibTeX'], ['manual', 'Manual']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'arxiv' && <>
        <form className="row" onSubmit={go}>
          <input className="input" autoFocus placeholder="e.g. agent memory  ·  or an arXiv ID like 2310.08560" value={q} onChange={e => setQ(e.target.value)} />
          <button className="btn violet" disabled={busy || !q.trim()}>{busy ? <span className="spinner" /> : 'Search'}</button>
        </form>
        {err && <p className="small" style={{ color: 'var(--red)' }}>{err}</p>}
        {results.length > 0 && <div className="row between" style={{ margin: '12px 0 6px' }}><span className="muted small">{results.length} results</span><button className="btn sm lime" onClick={() => add(results.filter(r => !have.has(r.id)))}>Import all new</button></div>}
        <div className="stack">
          {results.map(p => (
            <div key={p.id} className="list-item" style={{ cursor: 'default' }}>
              <div className="grow"><div className="t">{p.title}</div><div className="muted tiny mono">{p.authors.join(', ')} · {p.year} · {p.arxiv}</div><div className="small muted" style={{ marginTop: 4 }}>{p.abstract.slice(0, 220)}…</div></div>
              {have.has(p.id) ? <span className="tag">IN LIBRARY</span> : <button className="btn sm" onClick={() => add([p])}><Download size={13} /> Add</button>}
            </div>
          ))}
        </div>
      </>}
      {tab === 'bibtex' && <>
        <textarea className="input mono small" style={{ minHeight: 220 }} placeholder="@article{key,&#10;  title = {...},&#10;  author = {A and B},&#10;  year = {2024},&#10;}" value={bib} onChange={e => setBib(e.target.value)} />
        <button className="btn violet" style={{ marginTop: 10 }} onClick={() => { const ps = parseBibtex(bib + '\n'); ps.length ? (add(ps), onClose()) : toast('No entries found') }}>Import BibTeX</button>
      </>}
      {tab === 'manual' && <div className="stack">
        <input className="input" placeholder="Title" value={manual.title} onChange={e => setManual({ ...manual, title: e.target.value })} />
        <div className="row"><input className="input" placeholder="Authors (comma separated)" value={manual.authors} onChange={e => setManual({ ...manual, authors: e.target.value })} /><input className="input" style={{ width: 110 }} type="number" value={manual.year} onChange={e => setManual({ ...manual, year: +e.target.value })} /></div>
        <textarea className="input" placeholder="Abstract" value={manual.abstract} onChange={e => setManual({ ...manual, abstract: e.target.value })} />
        <button className="btn violet" disabled={!manual.title} onClick={() => {
          const id = `local-${Date.now()}`
          add([{ id, arxiv: id, title: manual.title, authors: manual.authors.split(',').map(s => s.trim()).filter(Boolean), year: manual.year, citations: 0, tags: inferTags(manual.title + ' ' + manual.abstract), abstract: manual.abstract || manual.title, venue: 'Manual', starred: false, addedAt: Date.now() }])
          onClose()
        }}><Plus size={14} /> Add paper</button>
      </div>}
    </Modal>
  )
}
