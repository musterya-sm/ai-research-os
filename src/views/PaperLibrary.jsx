import { useMemo, useState } from 'react'
import { Search, Plus, Trash2, SlidersHorizontal } from 'lucide-react'
import { Head, PaperRow } from '../components/ui.jsx'
import ImportModal from '../components/ImportModal.jsx'
import { useStore } from '../lib/store.jsx'

const SORTS = { recent: (a, b) => b.addedAt - a.addedAt, year: (a, b) => b.year - a.year, citations: (a, b) => b.citations - a.citations, title: (a, b) => a.title.localeCompare(b.title) }

export default function PaperLibrary() {
  const { state, dispatch } = useStore()
  const [view, setView] = useState('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('recent')
  const [tag, setTag] = useState('')
  const [filters, setFilters] = useState(false)
  const [importing, setImporting] = useState(false)
  const [page, setPage] = useState(0)
  const PER = 12
  const tags = [...new Set(state.papers.flatMap(p => p.tags))].sort()

  const list = useMemo(() => {
    let ps = state.papers
    if (view === 'starred') ps = ps.filter(p => p.starred)
    else if (view !== 'all') { const c = state.collections.find(c => c.id === view); ps = ps.filter(p => c?.paperIds.includes(p.id)) }
    if (tag) ps = ps.filter(p => p.tags.includes(tag))
    if (q) { const t = q.toLowerCase(); ps = ps.filter(p => `${p.title} ${p.authors.join(' ')} ${p.abstract} ${p.arxiv}`.toLowerCase().includes(t)) }
    return [...ps].sort(SORTS[sort])
  }, [state.papers, state.collections, view, q, sort, tag])
  const shown = list.slice(page * PER, page * PER + PER)

  const NavBtn = ({ id, label, count }) => <button className={view === id ? 'on' : ''} onClick={() => { setView(id); setPage(0) }}><span>{label}</span><span className="mono tiny">{count}</span></button>

  return (
    <>
      <Head n={2} title="Paper Library" sub="Organize and manage your papers"><button className="btn dark" onClick={() => setImporting(true)}><Plus size={14} /> Import</button></Head>
      <div className="grid side">
        <div className="card" style={{ padding: 10, alignSelf: 'start' }}>
          <h3 style={{ padding: '4px 8px' }}>All papers <span className="muted">· {state.papers.length}</span></h3>
          <div className="nav-list">
            <NavBtn id="all" label="All Papers" count={state.papers.length} />
            <NavBtn id="starred" label="Starred" count={state.papers.filter(p => p.starred).length} />
            <div className="label muted" style={{ margin: '12px 8px 4px' }}>My Collections</div>
            {state.collections.map(c => <div key={c.id} className="row" style={{ gap: 0 }}><NavBtn id={c.id} label={c.name} count={c.paperIds.length} /><button className="star" title="Delete collection" onClick={() => confirm(`Delete collection "${c.name}"?`) && (dispatch({ type: 'deleteCollection', id: c.id }), setView('all'))}><Trash2 size={13} /></button></div>)}
            <button onClick={() => { const name = prompt('Collection name'); name && dispatch({ type: 'addCollection', name }) }}><span>+ New Collection</span></button>
          </div>
        </div>
        <div className="card">
          <div className="row">
            <div className="search grow"><Search size={15} /><input placeholder="Search title, author, abstract, arXiv ID..." value={q} onChange={e => { setQ(e.target.value); setPage(0) }} /></div>
            <button className={`btn ${filters ? 'dark' : ''}`} onClick={() => setFilters(!filters)}><SlidersHorizontal size={14} /> Filters</button>
          </div>
          {filters && <div className="row wrap" style={{ marginTop: 10 }}>
            <select className="input" style={{ width: 'auto' }} value={sort} onChange={e => setSort(e.target.value)}>{Object.keys(SORTS).map(s => <option key={s} value={s}>Sort: {s}</option>)}</select>
            <select className="input" style={{ width: 'auto' }} value={tag} onChange={e => { setTag(e.target.value); setPage(0) }}><option value="">All concepts</option>{tags.map(t => <option key={t}>{t}</option>)}</select>
          </div>}
          <div className="stack" style={{ marginTop: 14 }}>
            {shown.map(p => <PaperRow key={p.id} paper={p} />)}
            {!shown.length && <div className="empty">No papers match.</div>}
          </div>
          <div className="row between" style={{ marginTop: 14 }}>
            <span className="mono tiny muted">SHOWING {list.length ? page * PER + 1 : 0}–{Math.min(list.length, page * PER + PER)} OF {list.length}</span>
            <div className="row"><button className="btn sm" disabled={!page} onClick={() => setPage(page - 1)}>Prev</button><button className="btn sm" disabled={(page + 1) * PER >= list.length} onClick={() => setPage(page + 1)}>Next</button></div>
          </div>
        </div>
      </div>
      {importing && <ImportModal onClose={() => setImporting(false)} />}
    </>
  )
}
