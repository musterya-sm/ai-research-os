import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Download, ExternalLink, Search } from 'lucide-react'
import { getPdf } from '../lib/pdfstore.js'
import { openPdf } from '../lib/pdf.js'

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
      const vp = page.getViewport({ scale: scale * (window.devicePixelRatio || 1) })
      const c = ref.current
      c.width = vp.width; c.height = vp.height
      c.style.width = `${vp.width / (window.devicePixelRatio || 1)}px`
      task = page.render({ canvasContext: c.getContext('2d'), viewport: vp })
      task.promise.catch(() => {})
    })
    return () => { dead = true; task?.cancel() }
  }, [doc, n, scale])
  return <canvas ref={ref} onClick={onClick} style={{ border: '2px solid var(--line)', background: '#fff', maxWidth: '100%', cursor: onClick ? 'pointer' : 'default', display: 'block' }} />
}

const Missing = () => <div className="empty">PDF file not found in this browser (it may have been uploaded on another device). Re-attach it below.</div>

export default function PdfViewer({ id, startPage = 1 }) {
  const { doc, rec, url, loading, missing, error } = useStoredPdf(id)
  const [page, setPage] = useState(startPage)
  const [scale, setScale] = useState(1.2)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState(null)
  useEffect(() => setPage(startPage), [startPage])
  if (loading) return <span className="spinner" />
  if (missing) return <Missing />
  if (error) return <div className="empty">Could not open PDF: {error}</div>

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
    if (found[0]) setPage(found[0])
  }
  return (
    <div className="stack">
      <div className="row wrap between">
        <div className="row">
          <button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={14} /></button>
          <span className="mono small">{page} / {doc.numPages}</span>
          <button className="btn sm" disabled={page >= doc.numPages} onClick={() => setPage(page + 1)}><ChevronRight size={14} /></button>
          <button className="btn sm" onClick={() => setScale(s => Math.max(0.5, s - 0.2))}><ZoomOut size={14} /></button>
          <span className="mono tiny">{Math.round(scale * 100)}%</span>
          <button className="btn sm" onClick={() => setScale(s => Math.min(3, s + 0.2))}><ZoomIn size={14} /></button>
        </div>
        <form className="row" onSubmit={find}>
          <div className="search" style={{ padding: '0 8px' }}><Search size={13} /><input style={{ padding: '6px 0', width: 160 }} placeholder="Find in PDF" value={q} onChange={e => setQ(e.target.value)} /></div>
          {hits && <span className="mono tiny">{hits.length ? `pages ${hits.join(', ')}` : 'no match'}</span>}
        </form>
        <div className="row">
          <a className="btn sm" href={url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open</a>
          <a className="btn sm" href={url} download={rec.name}><Download size={13} /> Download</a>
        </div>
      </div>
      <div style={{ overflow: 'auto', maxHeight: '75vh', display: 'grid', justifyContent: 'center', background: 'var(--soft)', padding: 12 }}>
        <PageCanvas doc={doc} n={page} scale={scale} />
      </div>
    </div>
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
