import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Download, ExternalLink, Search, Trash2, BookOpen, X, Sparkles, Volume2, Square, Wand2 } from 'lucide-react'
import { TextLayer } from 'pdfjs-dist'
import { getPdf, putPdf } from '../lib/pdfstore.js'
import { openPdf } from '../lib/pdf.js'
import { pullPdf } from '../lib/sync.js'
import { useStore } from '../lib/store.jsx'
import { KINDS } from '../lib/highlights.js'
import { explainPrompt, localExplain, definePrompt, localDefine } from '../lib/explain.js'
import { Modal, Prose, AiBadge, toast, useAI } from './ui.jsx'

// Local IndexedDB first; if this device never had the file, try the sync server.
function useStoredPdf(id) {
  const [st, setSt] = useState({ loading: true })
  useEffect(() => {
    let dead = false, doc
    ;(async () => {
      try {
        let rec = await getPdf(id)
        if (!rec) { rec = await pullPdf(id).catch(() => null); if (rec) await putPdf(id, rec) }
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

// One page in the continuous scroll. Canvas + text layer exist only while the page is near the viewport.
function ReaderPage({ doc, n, scale, size, near, highlights, flash }) {
  const canvas = useRef(), text = useRef()
  useEffect(() => {
    if (!near) return
    let task, layer, dead = false
    doc.getPage(n).then(async page => {
      if (dead) return
      const vp = page.getViewport({ scale }), dpr = window.devicePixelRatio || 1
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
  }, [doc, n, scale, near])

  return (
    <div data-page={n} style={{ position: 'relative', width: size.w * scale, height: size.h * scale, background: '#fff', border: '2px solid var(--line)', margin: '0 auto 14px' }}>
      {near ? <>
        <canvas ref={canvas} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
        {highlights.flatMap(h => (h.rects || []).filter(r => (r.p ?? h.page) === n).map((r, i) => (
          <div key={h.id + i} className={flash === h.id ? 'hl-flash' : ''} style={{ position: 'absolute', left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%`, background: KINDS[h.kind].color, mixBlendMode: 'multiply', opacity: 0.55, pointerEvents: 'none' }} />
        )))}
        <div ref={text} className="textLayer" />
      </> : <div className="mono tiny muted" style={{ padding: 10 }}>Page {n}</div>}
    </div>
  )
}

const Missing = () => <div className="empty">PDF file not found in this browser (it may have been uploaded on another device). Re-attach it below, or sign in to sync in Settings.</div>

// Text-to-speech: reads pages aloud, continuing page by page until stopped.
function useReadAloud(doc, onPage) {
  const [on, setOn] = useState(false)
  const run = useRef(0)
  useEffect(() => () => { run.current++; window.speechSynthesis?.cancel() }, [])
  async function speak(text, from) {
    const id = ++run.current
    speechSynthesis.cancel(); setOn(true)
    const say = s => new Promise(res => { const u = new SpeechSynthesisUtterance(s); u.rate = 1.05; u.onend = u.onerror = res; speechSynthesis.speak(u) })
    const chunks = t => t.replace(/\s+/g, ' ').match(/[^.!?]{1,220}[.!?]?/g) || []
    if (text) for (const c of chunks(text)) { if (id !== run.current) return; await say(c) }
    else for (let n = from; n <= doc.numPages && id === run.current; n++) {
      onPage(n)
      const t = (await (await doc.getPage(n)).getTextContent()).items.map(i => i.str).join(' ')
      for (const c of chunks(t)) { if (id !== run.current) return; await say(c) }
    }
    if (id === run.current) setOn(false)
  }
  const stop = () => { run.current++; speechSynthesis.cancel(); setOn(false) }
  return { on, speak, stop, supported: 'speechSynthesis' in window }
}

export default function PdfViewer({ id, startPage, focusHighlight }) {
  const { state, dispatch, index } = useStore()
  const paper = state.papers.find(p => p.id === id)
  const { doc, rec, url, loading, missing, error } = useStoredPdf(id)
  const [sizes, setSizes] = useState(null)
  const [page, setPage] = useState(startPage || paper?.readPos?.page || 1)
  const [scale, setScale] = useState(paper?.readPos?.scale || 1.3)
  const [near, setNear] = useState(new Set([1]))
  const [q, setQ] = useState('')
  const [hits, setHits] = useState(null)
  const [pending, setPending] = useState(null) // fresh selection awaiting a kind
  const [picked, setPicked] = useState(null) // existing highlight being edited
  const [termDraft, setTermDraft] = useState(null)
  const [explain, setExplain] = useState(null)
  const [flash, setFlash] = useState(focusHighlight)
  const scroller = useRef(), inner = useRef(), target = useRef(page)
  const mine = state.highlights.filter(h => h.paperId === id)
  const tts = useReadAloud(doc, n => scrollTo(n))
  const ai = useAI()

  useEffect(() => { if (!doc) return; Promise.all(Array.from({ length: doc.numPages }, (_, i) => doc.getPage(i + 1).then(p => { const v = p.getViewport({ scale: 1 }); return { w: v.width, h: v.height } }))).then(setSizes) }, [doc])
  useEffect(() => { if (startPage) scrollTo(startPage) }, [startPage])
  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(null), 2200); return () => clearTimeout(t) }, [flash])
  // Initial position + keep the same page in view after zooming.
  useEffect(() => { if (sizes) requestAnimationFrame(() => scrollTo(target.current, 'auto')) }, [sizes, scale])
  // Remember where you were (debounced) so the paper reopens on the same page.
  useEffect(() => {
    if (!doc) return
    const t = setTimeout(() => dispatch({ type: 'readPos', id, page, scale, pages: doc.numPages }), 600)
    return () => clearTimeout(t)
  }, [page, scale, doc])

  function offsetOf(n) { let y = 0; for (let i = 0; i < n - 1; i++) y += sizes[i].h * scale + 16; return y }
  function scrollTo(n, behavior = 'smooth') {
    if (!doc) return
    n = Math.min(doc.numPages, Math.max(1, n)); target.current = n; setPage(n)
    if (sizes && scroller.current) scroller.current.scrollTo({ top: offsetOf(n), behavior })
    setNear(s => new Set([...s, n - 1, n, n + 1]))
  }
  function onScroll() {
    if (!sizes) return
    const mid = scroller.current.scrollTop + scroller.current.clientHeight / 2
    let y = 0, cur = sizes.length
    for (let i = 0; i < sizes.length; i++) { y += sizes[i].h * scale + 16; if (y > mid) { cur = i + 1; break } }
    target.current = cur
    if (cur !== page) setPage(cur)
    setNear(new Set([cur - 2, cur - 1, cur, cur + 1, cur + 2]))
  }

  if (loading) return <span className="spinner" />
  if (missing) return <Missing />
  if (error) return <div className="empty">Could not open PDF: {error}</div>

  // Selections can span pages: each client rect is normalised against the page it falls on.
  function onMouseUp(e) {
    if (e.target.closest('.hl-pop')) return
    const box = inner.current.getBoundingClientRect()
    const sel = window.getSelection()
    const str = sel?.toString().replace(/\s+/g, ' ').trim()
    if (str && sel.rangeCount && inner.current.contains(sel.anchorNode)) {
      const pages = [...inner.current.querySelectorAll('[data-page]')].map(el => ({ n: +el.dataset.page, r: el.getBoundingClientRect() }))
      const rects = [...sel.getRangeAt(0).getClientRects()].filter(r => r.width > 1 && r.height > 1).flatMap(r => {
        const cy = r.top + r.height / 2, pg = pages.find(p => cy >= p.r.top && cy <= p.r.bottom)
        return pg ? [{ p: pg.n, x: (r.left - pg.r.left) / pg.r.width, y: (r.top - pg.r.top) / pg.r.height, w: r.width / pg.r.width, h: r.height / pg.r.height, _b: r }] : []
      })
      const last = rects.at(-1)
      if (rects.length) {
        setPicked(null)
        return setPending({ text: str, page: Math.min(...rects.map(r => r.p)), rects: rects.map(({ _b, ...r }) => r), at: { x: last._b.right - box.left, y: last._b.bottom - box.top } })
      }
    }
    const pg = document.elementsFromPoint(e.clientX, e.clientY).find(el => el.dataset?.page)
    if (!pg) return
    const n = +pg.dataset.page, r = pg.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height
    const hit = mine.find(h => h.rects?.some(q => (q.p ?? h.page) === n && px >= q.x && px <= q.x + q.w && py >= q.y && py <= q.y + q.h))
    setPending(null)
    setPicked(hit ? { h: hit, at: { x: e.clientX - box.left, y: e.clientY - box.top } } : null)
  }

  // Search each page's text to find which pages mention the query.
  async function find(e) {
    e.preventDefault()
    if (!q.trim()) return setHits(null)
    const found = []
    for (let i = 1; i <= doc.numPages; i++) {
      const t = (await (await doc.getPage(i)).getTextContent()).items.map(it => it.str).join(' ')
      if (t.toLowerCase().includes(q.toLowerCase())) found.push(i)
    }
    setHits(found)
    if (found[0]) scrollTo(found[0])
  }
  function save(kind, note = '', sel = pending) {
    if (kind === 'term') {
      const short = sel.text.split(' ').length <= 6
      setTermDraft({ term: short ? sel.text : '', definition: short ? '' : sel.text, sel })
      return setPending(null)
    }
    dispatch({ type: 'addHighlight', h: { paperId: id, page: sel.page, text: sel.text, rects: sel.rects, kind, note } })
    window.getSelection()?.removeAllRanges()
    setPending(null)
    toast(`Saved as ${KINDS[kind].label}`)
  }
  async function runExplain() {
    const sel = pending
    setPending(null); setExplain({ sel, text: '' })
    const out = await ai.run({ prompt: explainPrompt({ text: sel.text, paper, highlights: state.highlights }), maxTokens: 600, fallback: () => localExplain({ text: sel.text, paper, highlights: state.highlights, index }) })
    setExplain(x => x && x.sel === sel ? { sel, text: out } : x)
  }

  return (
    <div className="grid reader-grid" style={{ gridTemplateColumns: 'minmax(0,1fr) 270px', gap: 14 }}>
      <div className="stack" style={{ minWidth: 0 }}>
        <div className="row wrap between">
          <div className="row">
            <button className="btn sm" disabled={page <= 1} onClick={() => scrollTo(page - 1)}><ChevronLeft size={14} /></button>
            <span className="mono small">{page} / {doc.numPages}</span>
            <button className="btn sm" disabled={page >= doc.numPages} onClick={() => scrollTo(page + 1)}><ChevronRight size={14} /></button>
            <button className="btn sm" onClick={() => setScale(s => Math.max(0.6, +(s - 0.2).toFixed(1)))}><ZoomOut size={14} /></button>
            <span className="mono tiny">{Math.round(scale * 100)}%</span>
            <button className="btn sm" onClick={() => setScale(s => Math.min(3, +(s + 0.2).toFixed(1)))}><ZoomIn size={14} /></button>
            {tts.supported && (tts.on
              ? <button className="btn sm lime" onClick={tts.stop} title="Stop reading"><Square size={12} /> Stop</button>
              : <button className="btn sm" onClick={() => tts.speak(null, page)} title="Read aloud from this page"><Volume2 size={13} /> Listen</button>)}
          </div>
          <form className="row" onSubmit={find}>
            <div className="search" style={{ padding: '0 8px' }}><Search size={13} /><input style={{ padding: '6px 0', width: 130 }} placeholder="Find in PDF" value={q} onChange={e => setQ(e.target.value)} /></div>
            {hits && <span className="mono tiny">{hits.length ? <>pp.{hits.slice(0, 12).map(n => <a key={n} href="#" onClick={e => { e.preventDefault(); scrollTo(n) }}> {n}</a>)}</> : 'no match'}</span>}
          </form>
          <div className="row">
            <a className="btn sm" href={url} target="_blank" rel="noreferrer" title="Open in new tab"><ExternalLink size={13} /></a>
            <a className="btn sm" href={url} download={rec.name} title="Download"><Download size={13} /></a>
          </div>
        </div>
        <div style={{ height: 6, background: 'var(--soft)' }} title={`Read ${paper?.readMax || page} of ${doc.numPages} pages`}><div style={{ height: 6, width: `${(Math.max(paper?.readMax || 0, page) / doc.numPages) * 100}%`, background: 'var(--violet)' }} /></div>
        <p className="muted tiny" style={{ margin: 0 }}>Select text to highlight, explain or define it — selections can run across pages.</p>
        <div ref={scroller} onScroll={onScroll} className="reader-scroll" style={{ overflow: 'auto', height: '78vh', background: 'var(--soft)', padding: 12 }}>
          <div ref={inner} onMouseUp={onMouseUp} style={{ position: 'relative', width: 'fit-content', margin: '0 auto' }}>
            {sizes ? sizes.map((sz, i) => <ReaderPage key={i} doc={doc} n={i + 1} scale={scale} size={sz} near={near.has(i + 1)} highlights={mine} flash={flash} />) : <span className="spinner" />}
            {pending && <div className="hl-pop" style={{ left: Math.max(0, pending.at.x - 260), top: pending.at.y + 6 }}>
              <div className="row wrap" style={{ gap: 4, maxWidth: 420 }}>
                {Object.entries(KINDS).map(([k, v]) => <button key={k} className="btn sm" style={{ background: v.color, color: '#0d0d0d' }} onClick={() => save(k)}>{k === 'term' && <BookOpen size={12} />}{v.label}</button>)}
                <button className="btn sm violet" onClick={runExplain}><Sparkles size={12} /> Explain</button>
                {tts.supported && <button className="btn sm" title="Read selection aloud" onClick={() => tts.speak(pending.text)}><Volume2 size={12} /></button>}
                <button className="btn sm ghost" onClick={() => setPending(null)}><X size={13} /></button>
              </div>
            </div>}
            {picked && <HighlightEditor h={state.highlights.find(x => x.id === picked.h.id) || picked.h} at={picked.at} onClose={() => setPicked(null)} />}
          </div>
        </div>
      </div>
      <div className="stack" style={{ alignSelf: 'start' }}>
        {explain && <div className="card flat" style={{ padding: 12, borderColor: 'var(--violet)' }}>
          <div className="row between"><h3 style={{ margin: 0 }}>Explain</h3><span className="row"><AiBadge /><button className="btn sm ghost" onClick={() => setExplain(null)}><X size={13} /></button></span></div>
          <p className="muted tiny">“{explain.sel.text.slice(0, 140)}{explain.sel.text.length > 140 ? '…' : ''}”</p>
          {ai.error && <p className="tiny" style={{ color: 'var(--red)' }}>{ai.error}</p>}
          {explain.text ? <div className="small"><Prose text={explain.text} /></div> : <span className="spinner" />}
          {explain.text && <div className="row wrap" style={{ marginTop: 8 }}>
            <button className="btn sm" style={{ background: KINDS.idea.color, color: '#0d0d0d' }} onClick={() => { save('idea', explain.text.slice(0, 600), explain.sel); setExplain(null) }}>Save with explanation</button>
            <button className="btn sm" style={{ background: KINDS.term.color, color: '#0d0d0d' }} onClick={() => { setTermDraft({ term: explain.sel.text.split(' ').length <= 6 ? explain.sel.text : '', definition: explain.text.replace(/^#.*$/gm, '').replace(/\*\*/g, '').trim().slice(0, 500), sel: explain.sel }); setExplain(null) }}>To dictionary</button>
          </div>}
        </div>}
        <div className="card flat" style={{ maxHeight: '78vh', overflowY: 'auto', padding: 12 }}>
          <h3>Highlights ({mine.length})</h3>
          {!mine.length && <p className="muted small">Nothing yet. Select text in the page to start.</p>}
          <div className="stack">{[...mine].sort((a, b) => a.page - b.page).map(h => (
            <div key={h.id} className="small" style={{ borderLeft: `5px solid ${KINDS[h.kind].color}`, paddingLeft: 8, cursor: 'pointer' }} onClick={() => { scrollTo(h.page); setFlash(h.id) }}>
              <div className="mono tiny muted">p.{h.page}{new Set((h.rects || []).map(r => r.p ?? h.page)).size > 1 ? '+' : ''} · {KINDS[h.kind].label}</div>
              {h.kind === 'term' ? <div><b>{h.term}</b> — {h.definition}</div> : <div>“{h.text.length > 160 ? h.text.slice(0, 160) + '…' : h.text}”</div>}
              {h.note && <div className="muted" style={{ marginTop: 2 }}>✎ {h.note.slice(0, 200)}</div>}
            </div>))}
          </div>
        </div>
      </div>
      {termDraft && <TermModal draft={termDraft} paper={paper} onClose={() => setTermDraft(null)} onSave={({ term, definition }) => {
        const sel = termDraft.sel
        dispatch({ type: 'addHighlight', h: { paperId: id, page: sel.page, text: sel.text, rects: sel.rects, kind: 'term', term, definition } })
        window.getSelection()?.removeAllRanges(); setTermDraft(null); toast(`“${term}” added to dictionary`)
      }} />}
    </div>
  )
}

function HighlightEditor({ h, at, onClose }) {
  const { dispatch } = useStore()
  return (
    <div className="hl-pop" style={{ left: Math.max(0, at.x - 140), top: at.y + 10, width: 280 }}>
      <div className="row between"><span className="mono tiny">{KINDS[h.kind].label} · p.{h.page}</span><button className="btn sm ghost" onClick={onClose}><X size={13} /></button></div>
      <div className="row" style={{ gap: 4, margin: '6px 0' }}>{Object.entries(KINDS).filter(([k]) => k !== 'term').map(([k, v]) => <button key={k} title={v.label} onClick={() => dispatch({ type: 'updateHighlight', id: h.id, patch: { kind: k } })} style={{ width: 22, height: 22, background: v.color, border: h.kind === k ? '3px solid var(--ink)' : '1.5px solid var(--line)', cursor: 'pointer' }} />)}</div>
      <textarea className="input small" style={{ minHeight: 60 }} placeholder="Add a note… link terms with [[term]]" value={h.note || ''} onChange={e => dispatch({ type: 'updateHighlight', id: h.id, patch: { note: e.target.value } })} />
      <button className="btn sm" style={{ marginTop: 6 }} onClick={() => { dispatch({ type: 'deleteHighlight', id: h.id }); onClose() }}><Trash2 size={12} /> Delete</button>
    </div>
  )
}

// `paper` enables Auto-define (Claude, or a definitional sentence found in the paper).
export function TermModal({ draft, paper, onClose, onSave }) {
  const { state } = useStore()
  const [term, setTerm] = useState(draft.term || '')
  const [definition, setDefinition] = useState(draft.definition || '')
  const [note, setNote] = useState('')
  const ai = useAI()
  const src = paper || state.papers.find(p => p.id === draft.paperId)
  async function auto() {
    setNote('')
    const out = await ai.run({ prompt: definePrompt(term, src), maxTokens: 200, fallback: () => localDefine(term, src) || state.papers.map(p => localDefine(term, p)).find(Boolean) || '' })
    out ? setDefinition(out.trim()) : setNote('No definition found in your papers — add a Claude key in Settings for AI definitions.')
  }
  return (
    <Modal title="Add to dictionary" onClose={onClose}>
      <form className="stack" onSubmit={e => { e.preventDefault(); term.trim() && definition.trim() && onSave({ term: term.trim(), definition: definition.trim() }) }}>
        <label className="small">Term<input className="input" autoFocus value={term} onChange={e => setTerm(e.target.value)} placeholder="e.g. Virtual context management" /></label>
        <label className="small"><span className="row between">Definition / what to remember<button type="button" className="btn sm" disabled={!term.trim() || ai.busy} onClick={auto}>{ai.busy ? <span className="spinner" /> : <Wand2 size={12} />} Auto-define</button></span>
          <textarea className="input" value={definition} onChange={e => setDefinition(e.target.value)} /></label>
        {note && <p className="tiny muted" style={{ margin: 0 }}>{note}</p>}
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
