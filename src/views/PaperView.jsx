import { useEffect, useRef, useState } from 'react'
import { Star, ExternalLink, Trash2, Sparkles, FolderPlus, Paperclip, Pencil } from 'lucide-react'
import PdfViewer, { PdfThumbs } from '../components/PdfViewer.jsx'
import { ingestPdf } from '../lib/ingest.js'
import { deletePdf } from '../lib/pdfstore.js'
import { Head, Modal, Tags, Prose, Gloss, AiBadge, nav, authorLine, toast, useAI } from '../components/ui.jsx'
import { KINDS } from '../lib/highlights.js'
import { useStore } from '../lib/store.jsx'
import { summarize, keyPoints, similar } from '../lib/nlp.js'
import { paperContext } from '../lib/ai.js'

export default function PaperView({ arg, sub }) {
  // Deep link from the notebook: /paper/<id>/pdf:<page>:<highlightId>
  const [, linkPage, linkHl] = (sub || '').split(':')
  const { state, dispatch, index } = useStore()
  const p = state.papers.find(x => x.id === decodeURIComponent(arg || ''))
  const [tab, setTab] = useState(sub?.startsWith('pdf') ? 'pdf' : 'overview')
  const [ai, setAi] = useState({})
  const [collOpen, setCollOpen] = useState(false)
  const [tagText, setTagText] = useState('')
  const { run, busy, error } = useAI()
  const [pdfPage, setPdfPage] = useState(Number(linkPage) || 1)
  const [attaching, setAttaching] = useState(false)
  const [editing, setEditing] = useState(null)
  const fileRef = useRef()
  useEffect(() => { p && dispatch({ type: 'viewPaper', id: p.id }) }, [p?.id])
  if (!p) return <><Head n={4} title="Paper View" sub="Deep dive into any paper" /><div className="empty">Paper not found. <button className="btn sm" onClick={() => nav('/library')}>Open library</button></div></>

  const tldr = summarize(p.abstract, 2)
  const points = keyPoints(p)
  const steps = ['LLM', ...(p.method || 'Method').split(/\s*\+\s*|\s+and\s+/i).slice(0, 2), p.finding ? 'Outcome' : null].filter(Boolean)
  const sims = similar(index, p.id, 6)
  const inColls = state.collections.filter(c => c.paperIds.includes(p.id))

  async function attach(file) {
    if (!file) return
    setAttaching(true)
    try { await ingestPdf(file, { papers: state.papers, dispatch, attachTo: p.id }); toast('PDF attached'); setTab('pdf') } catch (e) { toast(`Upload failed: ${e.message}`) } finally { setAttaching(false) }
  }
  async function removePdf() {
    if (!confirm('Remove the attached PDF?')) return
    await deletePdf(p.id).catch(() => {})
    dispatch({ type: 'updatePaper', id: p.id, patch: { hasPdf: false, pdfName: undefined, pdfPages: undefined, body: undefined } })
    setTab('overview')
  }

  async function deepSummary() {
    const out = await run({
      prompt: `Write a structured deep summary of this paper with sections: TL;DR, Problem, Method, Results, Limitations, Open questions.\n\n${paperContext([p])}${p.body ? `\n\nFull text (truncated):\n${p.body.slice(0, 15000)}` : ''}`,
      fallback: () => [`## TL;DR`, tldr, `## Problem & Method`, `- ${p.method || 'See abstract'}`, `## Results`, `- ${p.finding || 'See abstract'}`, `## Limitations`, `- ${p.limitation || 'Not stated'}`, `## Open questions`, ...sims.slice(0, 2).map(s => `- How does this compare with **${s.paper.title.split(':')[0]}** (${s.paper.year})?`)].join('\n'),
    })
    setAi(a => ({ ...a, summary: out }))
  }

  return (
    <>
      <Head n={4} title="Paper View" sub="Deep dive into any paper">
        <button className="btn" onClick={() => nav('/library')}>← Library</button>
      </Head>
      <div className="card">
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22 }}>{p.title}</h2>
            <div className="muted mono small" style={{ marginTop: 6 }}>{authorLine(p)} · {p.citations ? `~${p.citations} citations` : 'citations n/a'}</div>
            <div style={{ marginTop: 8 }}><Tags tags={p.tags} /></div>
          </div>
          <div className="row">
            <button className={`star ${p.starred ? 'on' : ''}`} onClick={() => dispatch({ type: 'toggleStar', id: p.id })}><Star size={20} fill={p.starred ? 'currentColor' : 'none'} /></button>
            <button className="star" title="Edit details" onClick={() => setEditing({ title: p.title, authors: p.authors.join(', '), year: p.year, venue: p.venue, abstract: p.abstract, method: p.method || '', dataset: p.dataset || '', finding: p.finding || '', limitation: p.limitation || '' })}><Pencil size={17} /></button>
            <button className="star" title="Delete from library" onClick={() => confirm('Remove this paper from your library?') && (deletePdf(p.id).catch(() => {}), dispatch({ type: 'deletePaper', id: p.id }), nav('/library'))}><Trash2 size={18} /></button>
          </div>
        </div>
        <div className="tabs" style={{ marginTop: 14 }}>{['overview', ...(p.hasPdf ? ['pdf'] : []), 'summary', 'keypoints', 'figures', `citations`].map(t => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t === 'citations' ? `Citations (${p.citations || 0})` : t === 'pdf' ? `PDF (${p.pdfPages || '?'} pp)` : t}</button>)}</div>

        {tab === 'overview' && <div className="grid g2">
          <div className="stack">
            <div className="card flat"><h3>TL;DR</h3><p style={{ margin: 0, lineHeight: 1.6 }}><Gloss text={tldr} /></p></div>
            {(() => { const mine = state.highlights.filter(h => h.paperId === p.id); return (
              <div className="card flat"><div className="row between"><h3>My highlights ({mine.length})</h3>{mine.length > 0 && <button className="btn sm" onClick={() => nav('/notes')}>Notebook →</button>}</div>
                {!mine.length && <p className="muted small" style={{ margin: 0 }}>{p.hasPdf ? 'Open the PDF tab and select text to highlight it.' : 'Attach the PDF to highlight passages.'}</p>}
                <div className="stack">{mine.slice(0, 6).map(h => <div key={h.id} className="small" style={{ borderLeft: `5px solid ${KINDS[h.kind].color}`, paddingLeft: 8, cursor: h.page ? 'pointer' : 'default' }} onClick={() => h.page && nav(`/paper/${encodeURIComponent(p.id)}/pdf:${h.page}:${h.id}`)}>
                  {h.kind === 'term' ? <><b>{h.term}</b> — {h.definition}</> : <>“{h.text.slice(0, 140)}{h.text.length > 140 ? '…' : ''}”</>}{h.note && <div className="muted">✎ {h.note}</div>}</div>)}</div>
              </div>) })()}
            <div className="card flat"><h3>Key contributions</h3><ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>{points.map(x => <li key={x}>{x}</li>)}</ul></div>
            <div className="card flat"><h3>My notes</h3><textarea className="input" placeholder="Write notes — saved automatically" value={state.notes[p.id] || ''} onChange={e => dispatch({ type: 'setNote', id: p.id, text: e.target.value })} /></div>
          </div>
          <div className="stack">
            <div className="card flat"><h3>Methodology</h3><MethodDiagram steps={steps} /></div>
            <div className="card flat small">
              <h3>Paper info</h3>
              <div>Venue: {p.venue}</div><div>Year: {p.year}</div><div>Citations: {p.citations || '—'}</div>
              {p.hasPdf
                ? <div>PDF: <a href="#" onClick={e => { e.preventDefault(); setTab('pdf') }}>[{p.pdfName}]</a> <a href="#" onClick={e => { e.preventDefault(); removePdf() }}>[Remove]</a></div>
                : <div>PDF: {!/^(pdf-|local-)/.test(p.arxiv) && <><a href={`https://arxiv.org/abs/${p.arxiv}`} target="_blank" rel="noreferrer">[arXiv]</a> </>}<a href="#" onClick={e => { e.preventDefault(); fileRef.current.click() }}>{attaching ? 'uploading…' : '[Attach your PDF]'}</a></div>}
              <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={e => { attach(e.target.files[0]); e.target.value = '' }} />
              <div style={{ marginTop: 8 }}>In: {inColls.length ? inColls.map(c => <span key={c.id} className="tag lime">{c.name}</span>) : <span className="muted">no collections</span>}</div>
              <form className="row" style={{ marginTop: 8 }} onSubmit={e => { e.preventDefault(); if (tagText.trim()) { dispatch({ type: 'updatePaper', id: p.id, patch: { tags: [...new Set([...p.tags, tagText.trim()])] } }); setTagText('') } }}>
                <input className="input" placeholder="Add tag" value={tagText} onChange={e => setTagText(e.target.value)} /><button className="btn sm">Add</button>
              </form>
              <button className="btn violet block" style={{ marginTop: 12 }} onClick={() => setCollOpen(true)}><FolderPlus size={14} /> Add to collection</button>
            </div>
          </div>
        </div>}

        {tab === 'summary' && <div className="stack">
          <div className="row between"><AiBadge /><button className="btn violet" disabled={busy} onClick={deepSummary}>{busy ? <span className="spinner" /> : <Sparkles size={14} />} Generate deep summary</button></div>
          {error && <p className="small" style={{ color: 'var(--red)' }}>{error}</p>}
          <div className="card flat"><h3>Abstract</h3><p style={{ lineHeight: 1.6, margin: 0 }}><Gloss text={p.abstract} /></p></div>
          {ai.summary && <div className="card flat"><Prose text={ai.summary} /></div>}
        </div>}

        {tab === 'keypoints' && <table className="data"><tbody>{[['Method', p.method], ['Dataset', p.dataset], ['Key finding', p.finding], ['Limitation', p.limitation], ['Concepts', p.tags.join(', ')]].map(([k, v]) => <tr key={k}><td className="mono tiny" style={{ width: 140 }}>{k.toUpperCase()}</td><td>{v || '—'}</td></tr>)}</tbody></table>}

        {tab === 'pdf' && p.hasPdf && <PdfViewer id={p.id} startPage={pdfPage} focusHighlight={linkHl} />}

        {tab === 'figures' && <div className="stack">
          {p.hasPdf ? <><p className="muted small">Pages of your uploaded PDF — click one to open it in the viewer.</p><PdfThumbs id={p.id} onPick={n => { setPdfPage(n); setTab('pdf') }} /></>
            : <><p className="muted small">Attach the PDF to browse its pages here. Meanwhile, a diagram generated from the paper's method:</p><button className="btn sm" onClick={() => fileRef.current.click()}><Paperclip size={13} /> Attach PDF</button></>}
          <MethodDiagram steps={steps} big />
        </div>}

        {tab === 'citations' && <div className="stack">
          <p className="muted small">Most related papers in your library (by content similarity). <a href={`https://www.semanticscholar.org/arxiv/${p.arxiv}`} target="_blank" rel="noreferrer">See full citation graph on Semantic Scholar <ExternalLink size={11} /></a></p>
          {sims.map(s => <div key={s.paper.id} className="list-item" onClick={() => nav(`/paper/${s.paper.id}`)}><div className="grow"><div className="t small">{s.paper.title}</div><div className="mono tiny muted">{s.paper.year} · {s.paper.authors[0]}</div></div><span className="match">{Math.round(s.score * 100)}% sim</span></div>)}
        </div>}
      </div>

      {editing && <Modal title="Edit paper details" onClose={() => setEditing(null)}>
        <form className="stack" onSubmit={e => {
          e.preventDefault()
          dispatch({ type: 'updatePaper', id: p.id, patch: { ...editing, year: Number(editing.year) || p.year, authors: editing.authors.split(',').map(a => a.trim()).filter(Boolean) } })
          setEditing(null); toast('Details saved')
        }}>
          {[['title', 'Title'], ['authors', 'Authors (comma separated)'], ['year', 'Year'], ['venue', 'Venue'], ['method', 'Method'], ['dataset', 'Dataset'], ['finding', 'Key finding'], ['limitation', 'Limitation']].map(([k, l]) =>
            <label key={k} className="small">{l}<input className="input" type={k === 'year' ? 'number' : 'text'} value={editing[k]} onChange={e => setEditing({ ...editing, [k]: e.target.value })} /></label>)}
          <label className="small">Abstract<textarea className="input" style={{ minHeight: 140 }} value={editing.abstract} onChange={e => setEditing({ ...editing, abstract: e.target.value })} /></label>
          <button className="btn dark">Save</button>
        </form>
      </Modal>}

      {collOpen && <Modal title="Add to collection" onClose={() => setCollOpen(false)}>
        <div className="stack">
          {state.collections.map(c => <label key={c.id} className="row" style={{ cursor: 'pointer' }}><input type="checkbox" checked={c.paperIds.includes(p.id)} onChange={() => dispatch({ type: 'toggleInCollection', collectionId: c.id, paperId: p.id })} />{c.name}</label>)}
          <button className="btn" onClick={() => { const name = prompt('New collection name'); name && dispatch({ type: 'addCollection', name }) }}>+ New collection</button>
          <button className="btn dark" onClick={() => { setCollOpen(false); toast('Collections updated') }}>Done</button>
        </div>
      </Modal>}
    </>
  )
}

function MethodDiagram({ steps, big }) {
  const fills = ['#3b82f6', '#a5f3fc', '#a7f3d0', '#d4f53c']
  return (
    <div className="row wrap" style={{ gap: 6, padding: big ? 30 : 6, justifyContent: 'center' }}>
      {steps.map((s, i) => <span key={i} className="row" style={{ gap: 6 }}>
        <span style={{ background: fills[i % 4], color: '#0d0d0d', border: '2px solid #0d0d0d', padding: big ? '18px 22px' : '10px 12px', fontFamily: 'var(--mono)', fontSize: big ? 14 : 11, fontWeight: 700, textTransform: 'capitalize' }}>{s}</span>
        {i < steps.length - 1 && <span className="mono">→</span>}
      </span>)}
    </div>
  )
}
