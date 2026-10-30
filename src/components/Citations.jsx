import { useEffect, useState } from 'react'
import { ExternalLink, Plus, Network, RefreshCw } from 'lucide-react'
import { useStore } from '../lib/store.jsx'
import { citationGraph, inLibrary, toPaper } from '../lib/s2.js'
import { nav, toast } from './ui.jsx'

// Real references / cited-by lists from Semantic Scholar, cross-referenced with the library.
export default function Citations({ paper }) {
  const { state, dispatch } = useStore()
  const [g, setG] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [side, setSide] = useState('refs')
  async function load(force) {
    setBusy(true); setErr('')
    try {
      const out = await citationGraph(paper, { force, s2Key: state.settings.s2Key })
      setG(out)
      if (out.citationCount && out.citationCount !== paper.citations) dispatch({ type: 'updatePaper', id: paper.id, patch: { citations: out.citationCount } })
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  useEffect(() => { load() }, [paper.id])

  const list = g ? g[side] : []
  const add = items => {
    const fresh = items.filter(i => !inLibrary(state.papers, i)).map(toPaper)
    if (!fresh.length) return toast('Already in your library')
    dispatch({ type: 'addPapers', papers: fresh }); toast(`Added ${fresh.length} paper${fresh.length > 1 ? 's' : ''} (marked To read)`)
  }
  // This paper in the middle; library papers it cites / is cited by become linked nodes.
  function toCanvas() {
    const me = `p:${paper.id}`, nodes = [{ id: me, label: paper.title.split(':')[0], kind: 'paper', paperId: paper.id, x: 450, y: 280, color: '#8b5cf6' }], edges = []
    const linked = [...g.refs.map(i => [i, 'ref']), ...g.cites.map(i => [i, 'cite'])].map(([i, k]) => [inLibrary(state.papers, i), k]).filter(([p]) => p && p.id !== paper.id)
    linked.slice(0, 24).forEach(([p, k], n) => {
      const a = (n / Math.min(24, linked.length)) * Math.PI * 2
      nodes.push({ id: `p:${p.id}`, label: p.title.split(':')[0], kind: 'paper', paperId: p.id, x: 450 + Math.cos(a) * 240, y: 280 + Math.sin(a) * 180, color: k === 'ref' ? '#3b82f6' : '#d4f53c' })
      edges.push(k === 'ref' ? { from: me, to: `p:${p.id}` } : { from: `p:${p.id}`, to: me })
    })
    if (!edges.length) return toast('None of its references or citations are in your library yet')
    dispatch({ type: 'addToCanvas', nodes, edges }); nav('/canvas')
  }

  const libCount = k => g ? g[k].filter(i => inLibrary(state.papers, i)).length : 0
  return (
    <div className="stack">
      <div className="row between wrap">
        <span className="muted small">Live from Semantic Scholar{g ? ` · ${g.citationCount.toLocaleString()} citations · ${g.referenceCount} references` : ''}{g?.url && <> · <a href={g.url} target="_blank" rel="noreferrer">open <ExternalLink size={11} /></a></>}</span>
        <span className="row">
          {g && <button className="btn sm" onClick={toCanvas}><Network size={13} /> Map on canvas</button>}
          <button className="btn sm" disabled={busy} onClick={() => load(true)}>{busy ? <span className="spinner" /> : <RefreshCw size={13} />} Refresh</button>
        </span>
      </div>
      {err && <div className="empty">{err}</div>}
      {g && <>
        <div className="tabs">{[['refs', `References (${g.refs.length})`, 'refs'], ['cites', `Cited by (${g.cites.length})`, 'cites']].map(([k, l]) => <button key={k} className={side === k ? 'on' : ''} onClick={() => setSide(k)}>{l} · {libCount(k)} in library</button>)}</div>
        <div className="row"><button className="btn sm lime" onClick={() => add([...list].sort((a, b) => b.citations - a.citations).slice(0, 10))}><Plus size={13} /> Add top 10 by citations</button></div>
        <div className="stack">{list.map(i => {
          const have = inLibrary(state.papers, i)
          return <div key={i.s2 || i.title} className="list-item" style={{ cursor: have ? 'pointer' : 'default' }} onClick={() => have && nav(`/paper/${encodeURIComponent(have.id)}`)}>
            <div className="grow"><div className="t small">{i.title}</div><div className="mono tiny muted">{i.authors.slice(0, 3).join(', ')}{i.authors.length > 3 ? ' et al.' : ''} · {i.year || '—'} · {i.citations.toLocaleString()} cites{i.arxiv ? ` · arXiv ${i.arxiv}` : ''}</div></div>
            {have ? <span className="tag lime">IN LIBRARY</span> : <button className="btn sm" onClick={e => { e.stopPropagation(); add([i]) }}><Plus size={13} /> Add</button>}
          </div>
        })}</div>
      </>}
      {!g && busy && <span className="spinner" />}
    </div>
  )
}
