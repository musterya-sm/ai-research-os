import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Download, ExternalLink, Search, Trash2, BookOpen, X } from 'lucide-react'
import { TextLayer } from 'pdfjs-dist'
import { getPdf } from '../lib/pdfstore.js'
import { openPdf } from '../lib/pdf.js'
import { useStore } from '../lib/store.jsx'
import { KINDS } from '../lib/highlights.js'
import { Modal, toast } from './ui.jsx'

function useStoredPdf(id) {
  const [st, setSt] = useState({ loading: true })
  useEffect(() => {
    let dead = false, doc
    ;(async () => {
      try {
        const rec = await getPdf(id)
        if (!rec) return !dead && setSt({ missing: true })
        doc = await openPdf(await rec.blob.arrayBuffer())
        if (!dead) setSt({ doc, rec, url: URL.createObjectURL(rec.blob) })
      } catch (e) { !dead && setSt({ error: e.message }) }
    })()
    return () => { dead = true; doc?.destroy() }
  }, [id])
  useEffect(() => () => st.url && URL.revokeObjectURL(st.url), [st.url])
  return st
}

function PageCanvas({ doc, n, scale, onClick }) {
  const ref = useRef()
  useEffect(() => {
    let task, dead = false
    doc.getPage(n).then(page => {
      if (dead) return
      const dpr = window.devicePixelRatio || 1, vp = page.getViewport({ scale: scale * dpr })
      const c = ref.current
      c.width = vp.width; c.height = vp.height
      c.style.width = `${vp.width / dpr}px`
      task = page.render({ canvasContext: c.getContext('2d'), viewport: vp })
      task.promise.catch(() => {})
    })
    return () => { dead = true; task?.cancel() }
  }, [doc, n, scale])
  return <canvas ref={ref} onClick={onClick} style={{ border: '2px solid var(--line)', background: '#fff', maxWidth: '100%', cursor: onClick ? 'pointer' : 'default', display: 'block' }} />
}

// One page: canvas + saved highlight overlays + selectable pdf.js text layer on top.
function ReaderPage({ doc, n, scale, highlights, flash, onSelect, onPickHighlight }) {
  const wrap = useRef(), canvas = useRef(), text = useRef()
  const [size, setSize] = useState(null)
  useEffect(() => {
    let task, layer, dead = false
    doc.getPage(n).then(async page => {
      if (dead) return
      const vp = page.getViewport({ scale }), dpr = window.devicePixelRatio || 1
      setSize({ w: vp.width, h: vp.height })
      const c = canvas.current
      c.width = vp.width * dpr; c.height = vp.height * dpr
      task = page.render({ canvasContext: c.getContext('2d'), viewport: page.getViewport({ scale: scale * dpr }) })
      task.promise.catch(() => {})
      const t = text.current
      t.replaceChildren()
      t.style.setProperty('--scale-factor', vp.scale)
      layer = new TextLayer({ textContentSource: page.streamTextContent(), container: t, viewport: vp })
      await layer.render().catch(() => {})
    })
    return () => { dead = true; task?.cancel(); layer?.cancel() }
  }, [doc, n, scale])

  // Selection rects are stored normalised (0–1) so highlights survive zoom changes.
  function onMouseUp(e) {
    const sel = window.getSelection()
    const str = sel?.toString().replace(/\s+/g, ' ').trim()
    const box = wrap.current.getBoundingClientRect()
    if (str && sel.rangeCount && text.current.contains(sel.anchorNode)) {
      const rects = [...sel.getRangeAt(0).getClientRects()].filter(r => r.width > 1 && r.height > 1)
        .map(r => ({ x: (r.left - box.left) / box.width, y: (r.top - box.top) / box.height, w: r.width / box.width, h: r.height / box.height }))
      const last = rects.at(-1)
      if (rects.length) return onSelect({ text: str, rects, page: n, at: { x: last.x * box.width + last.w * box.width, y: (last.y + last.h) * box.height } })
    }
    const px = (e.clientX - box.left) / box.width, py = (e.clientY - box.top) / box.height
    const hit = highlights.find(h => h.rects?.some(r => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h))
    if (hit) onPickHighlight(hit, { x: e.clientX - box.left, y: e.clientY - box.top })
  }

  return (
    <div ref={wrap} onMouseUp={onMouseUp} style={{ position: 'relative', width: size?.w, height: size?.h, background: '#fff', border: '2px solid var(--line)', margin: '0 auto' }}>
      <canvas ref={canvas} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      {highlights.flatMap(h => (h.rects || []).map((r, i) => (
        <div key={h.id + i} className={flash === h.id ? 'hl-flash' : ''} style={{ position: 'absolute', left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%`, background: KINDS[h.kind].color, mixBlendMode: 'multiply', opacity: 0.55, pointerEvents: 'none' }} />
      )))}
      <div ref={text} className="textLayer" />
    </div>
  )
}

const Missing = () => <div className="empty">PDF file not found in this browser (it may have been uploaded on another device). Re-attach it below.</div>

export default function PdfViewer({ id, startPage = 1, focusHighlight }) {
  const { state, dispatch } = useStore()
  const { doc, rec, url, loading, missing, error } = useStoredPdf(id)
  const [page, setPage] = useState(startPage)
  const [scale, setScale] = useState(1.3)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState(null)
  const [pending, setPending] = useState(null) // fresh selection awaiting a kind
  const [picked, setPicked] = useState(null) // existing highlight being edited
  const [termDraft, setTermDraft] = useState(null)
  const [flash, setFlash] = useState(focusHighlight)
  const mine = state.highlights.filter(h => h.paperId === id)
  useEffect(() => setPage(startPage), [startPage])
  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(null), 2200); return () => clearTimeout(t) }, [flash])
  if (loading) return <span className="spinner" />
  if (missing) return <Missing />
  if (error) return <div className="empty">Could not open PDF: {error}</div>

  const go = n => { setPage(Math.min(doc.numPages, Math.max(1, n))); setPending(null); setPicked(null) }
  // Search each page's text layer to find which pages mention the query.
  async function find(e) {
    e.preventDefault()
    if (!q.trim()) return setHits(null)
    const found = []
    for (let i = 1; i <= doc.numPages; i++) {
      const t = (await (await doc.getPage(i)).getTextContent()).items.map(it => it.str).join(' ')
      if (t.toLowerCase().includes(q.toLowerCase())) found.push(i)
    }
    setHits(found)
    if (found[0]) go(found[0])
  }
  function save(kind, note = '') {
    if (kind === 'term') {
      const short = pending.text.split(' ').length <= 6
      setTermDraft({ term: short ? pending.text : '', definition: short ? '' : pending.text, sel: pending })
      return setPending(null)
    }
    dispatch({ type: 'addHighlight', h: { paperId: id, page: pending.page, text: pending.text, rects: pending.rects, kind, note } })
    window.getSelection()?.removeAllRanges()
    setPending(null)
    toast(`Saved as ${KINDS[kind].label}`)
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) 270px', gap: 14 }}>
      <div className="stack" style={{ minWidth: 0 }}>
        <div className="row wrap between">
          <div className="row">
            <button className="btn sm" disabled={page <= 1} onClick={() => go(page - 1)}><ChevronLeft size={14} /></button>
            <span className="mono small">{page} / {doc.numPages}</span>
            <button className="btn sm" disabled={page >= doc.numPages} onClick={() => go(page + 1)}><ChevronRight size={14} /></button>
            <button className="btn sm" onClick={() => setScale(s => Math.max(0.6, s - 0.2))}><ZoomOut size={14} /></button>
            <span className="mono tiny">{Math.round(scale * 100)}%</span>
            <button className="btn sm" onClick={() => setScale(s => Math.min(3, s + 0.2))}><ZoomIn size={14} /></button>
          </div>
          <form className="row" onSubmit={find}>
            <div className="search" style={{ padding: '0 8px' }}><Search size={13} /><input style={{ padding: '6px 0', width: 130 }} placeholder="Find in PDF" value={q} onChange={e => setQ(e.target.value)} /></div>
            {hits && <span className="mono tiny">{hits.length ? `pp. ${hits.join(', ')}` : 'no match'}</span>}
          </form>
          <div className="row">
            <a className="btn sm" href={url} target="_blank" rel="noreferrer" title="Open in new tab"><ExternalLink size={13} /></a>
            <a className="btn sm" href={url} download={rec.name} title="Download"><Download size={13} /></a>
          </div>
        </div>
        <p className="muted tiny" style={{ margin: 0 }}>Select text on the page to highlight it, add a note, or save it to your dictionary.</p>
        <div style={{ overflow: 'auto', maxHeight: '78vh', background: 'var(--soft)', padding: 12, position: 'relative' }}>
          <div style={{ position: 'relative', width: 'fit-content', margin: '0 auto' }}>
            <ReaderPage doc={doc} n={page} scale={scale} highlights={mine.filter(h => h.page === page)} flash={flash}
              onSelect={sel => { setPicked(null); setPending(sel) }} onPickHighlight={(h, at) => { setPending(null); setPicked({ h, at }) }} />
            {pending && <div className="hl-pop" style={{ left: Math.max(0, pending.at.x - 200), top: pending.at.y + 6 }} onMouseUp={e => e.stopPropagation()}>
              <div className="row" style={{ gap: 4 }}>
                {Object.entries(KINDS).map(([k, v]) => <button key={k} className="btn sm" style={{ background: v.color, color: '#0d0d0d' }} onClick={() => save(k)}>{k === 'term' && <BookOpen size={12} />}{v.label}</button>)}
                <button className="btn sm ghost" onClick={() => setPending(null)}><X size={13} /></button>
              </div>
            </div>}
            {picked && <HighlightEditor h={state.highlights.find(x => x.id === picked.h.id) || picked.h} at={picked.at} onClose={() => setPicked(null)} />}
          </div>
        </div>
      </div>
      <div className="card flat" style={{ alignSelf: 'start', maxHeight: '86vh', overflowY: 'auto', padding: 12 }}>
        <h3>Highlights ({mine.length})</h3>
        {!mine.length && <p className="muted small">Nothing yet. Select text in the page to start.</p>}
        <div className="stack">{[...mine].sort((a, b) => a.page - b.page).map(h => (
          <div key={h.id} className="small" style={{ borderLeft: `5px solid ${KINDS[h.kind].color}`, paddingLeft: 8, cursor: 'pointer' }} onClick={() => { go(h.page); setFlash(h.id) }}>
            <div className="mono tiny muted">p.{h.page} · {KINDS[h.kind].label}</div>
            {h.kind === 'term' ? <div><b>{h.term}</b> — {h.definition}</div> : <div>“{h.text.length > 160 ? h.text.slice(0, 160) + '…' : h.text}”</div>}
            {h.note && <div className="muted" style={{ marginTop: 2 }}>✎ {h.note}</div>}
          </div>))}
        </div>
      </div>
      {termDraft && <TermModal draft={termDraft} onClose={() => setTermDraft(null)} onSave={({ term, definition }) => {
        dispatch({ type: 'addHighlight', h: { paperId: id, page: termDraft.sel.page, text: termDraft.sel.text, rects: termDraft.sel.rects, kind: 'term', term, definition } })
        window.getSelection()?.removeAllRanges(); setTermDraft(null); toast(`“${term}” added to dictionary`)
      }} />}
    </div>
  )
}

function HighlightEditor({ h, at, onClose }) {
  const { dispatch } = useStore()
  return (
    <div className="hl-pop" style={{ left: Math.max(0, at.x - 140), top: at.y + 10, width: 280 }} onMouseUp={e => e.stopPropagation()}>
      <div className="row between"><span className="mono tiny">{KINDS[h.kind].label} · p.{h.page}</span><button className="btn sm ghost" onClick={onClose}><X size={13} /></button></div>
      <div className="row" style={{ gap: 4, margin: '6px 0' }}>{Object.entries(KINDS).filter(([k]) => k !== 'term').map(([k, v]) => <button key={k} title={v.label} onClick={() => dispatch({ type: 'updateHighlight', id: h.id, patch: { kind: k } })} style={{ width: 22, height: 22, background: v.color, border: h.kind === k ? '3px solid var(--ink)' : '1.5px solid var(--line)', cursor: 'pointer' }} />)}</div>
      <textarea className="input small" style={{ minHeight: 60 }} placeholder="Add a note…" value={h.note || ''} onChange={e => dispatch({ type: 'updateHighlight', id: h.id, patch: { note: e.target.value } })} />
      <button className="btn sm" style={{ marginTop: 6 }} onClick={() => { dispatch({ type: 'deleteHighlight', id: h.id }); onClose() }}><Trash2 size={12} /> Delete</button>
    </div>
  )
}

export function TermModal({ draft, onClose, onSave }) {
  const [term, setTerm] = useState(draft.term || '')
  const [definition, setDefinition] = useState(draft.definition || '')
  return (
    <Modal title="Add to dictionary" onClose={onClose}>
      <form className="stack" onSubmit={e => { e.preventDefault(); term.trim() && definition.trim() && onSave({ term: term.trim(), definition: definition.trim() }) }}>
        <label className="small">Term<input className="input" autoFocus value={term} onChange={e => setTerm(e.target.value)} placeholder="e.g. Virtual context management" /></label>
        <label className="small">Definition / what to remember<textarea className="input" value={definition} onChange={e => setDefinition(e.target.value)} /></label>
        {draft.sel && <p className="muted tiny">From p.{draft.sel.page}: “{draft.sel.text.slice(0, 200)}”</p>}
        <button className="btn dark" disabled={!term.trim() || !definition.trim()}>Save term</button>
      </form>
    </Modal>
  )
}

export function PdfThumbs({ id, onPick }) {
  const { doc, loading, missing, error } = useStoredPdf(id)
  if (loading) return <span className="spinner" />
  if (missing) return <Missing />
  if (error) return <div className="empty">Could not open PDF: {error}</div>
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
      {Array.from({ length: Math.min(doc.numPages, 40) }, (_, i) => (
        <div key={i}><PageCanvas doc={doc} n={i + 1} scale={0.3} onClick={() => onPick(i + 1)} /><div className="mono tiny muted" style={{ textAlign: 'center', marginTop: 4 }}>Page {i + 1}</div></div>
      ))}
    </div>
  )
}
