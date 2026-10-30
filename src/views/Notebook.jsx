import { useEffect, useMemo, useState } from 'react'
import { Search, Plus, Trash2, Network, Download, FileText, BookOpen, Check, RotateCcw, Link2, Flame } from 'lucide-react'
import { Head, Modal, NoteText, nav, toast, ago } from '../components/ui.jsx'
import { TermModal } from '../components/PdfViewer.jsx'
import { useStore } from '../lib/store.jsx'
import { KINDS, isDue, searchHighlights, notebookMarkdown, linksIn, backlinks, relatedHighlights, hlTitle } from '../lib/highlights.js'
import { dayKey } from '../lib/store.jsx'
import { download } from '../lib/exporter.js'

const sourceLink = h => (h.paperId ? `/paper/${encodeURIComponent(h.paperId)}/${h.page ? `pdf:${h.page}:${h.id}` : ''}` : null)

export default function Notebook({ arg, sub }) {
  const { state, dispatch } = useStore()
  const [tab, setTab] = useState(arg === 'dictionary' || arg === 'review' ? arg : 'highlights')
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('')
  const [paper, setPaper] = useState('')
  const [adding, setAdding] = useState(null)
  const hs = state.highlights
  const titleOf = id => state.papers.find(p => p.id === id)?.title.split(':')[0]
  const due = hs.filter(isDue)

  const shown = useMemo(() => {
    let list = q.trim() ? searchHighlights(hs, q, 500) : hs
    if (kind) list = list.filter(h => h.kind === kind)
    if (paper) list = list.filter(h => h.paperId === paper)
    return list
  }, [hs, q, kind, paper])
  const papersWithNotes = [...new Set(hs.map(h => h.paperId).filter(Boolean))]
  const toCanvas = h => {
    const nid = `n:${h.id}`, label = (h.kind === 'term' ? h.term : h.text).slice(0, 24)
    dispatch({ type: 'addToCanvas', nodes: [{ id: nid, label, kind: 'paper', x: 450 + Math.random() * 100, y: 270 + Math.random() * 100, color: KINDS[h.kind].color }, ...(h.paperId ? [{ id: `p:${h.paperId}`, label: titleOf(h.paperId)?.split(':')[0] || 'Paper', kind: 'paper', paperId: h.paperId, x: 300, y: 200, color: '#8b5cf6' }] : [])], edges: h.paperId ? [{ from: `p:${h.paperId}`, to: nid }] : [] })
    toast('Added to canvas')
  }

  return (
    <>
      <Head n={17} title="Knowledge Notebook" sub="Your highlights, notes & personal research dictionary">
        <button className="btn" onClick={() => setAdding('note')}><Plus size={14} /> Note</button>
        <button className="btn" onClick={() => setAdding('term')}><BookOpen size={14} /> Term</button>
        <button className="btn" onClick={() => download('research-notebook.md', notebookMarkdown(hs, state.papers))}><Download size={14} /> Markdown</button>
      </Head>
      <div className="grid g4" style={{ marginBottom: 16 }}>
        {[['Highlights', hs.filter(h => h.kind !== 'term').length, 'highlights'], ['Dictionary terms', hs.filter(h => h.kind === 'term').length, 'dictionary'], ['Due for review', due.length, 'review'], ['Papers annotated', papersWithNotes.length, 'highlights']].map(([l, v, t]) =>
          <div key={l} className="stat" style={{ cursor: 'pointer' }} onClick={() => setTab(t)}><small>{l}</small><b>{v}</b></div>)}
      </div>
      <div className="card">
        <div className="tabs">{[['highlights', 'Highlights & notes'], ['dictionary', 'Dictionary'], ['review', `Review${due.length ? ` (${due.length})` : ''}`]].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
        {tab !== 'review' && <div className="row wrap" style={{ marginBottom: 14 }}>
          <div className="search grow"><Search size={15} /><input placeholder={tab === 'dictionary' ? 'Look up a term…' : 'Search your highlights and notes…'} value={q} onChange={e => setQ(e.target.value)} /></div>
          {tab === 'highlights' && <>
            <select className="input" style={{ width: 'auto' }} value={kind} onChange={e => setKind(e.target.value)}><option value="">All kinds</option>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
            <select className="input" style={{ width: 'auto', maxWidth: 240 }} value={paper} onChange={e => setPaper(e.target.value)}><option value="">All papers</option>{papersWithNotes.map(id => <option key={id} value={id}>{titleOf(id)}</option>)}</select>
          </>}
        </div>}

        {tab === 'highlights' && <HighlightList list={shown} all={hs} titleOf={titleOf} onCanvas={toCanvas} />}
        {tab === 'dictionary' && <Dictionary terms={shown.filter(h => h.kind === 'term')} all={hs} focus={arg === 'dictionary' && sub ? decodeURIComponent(sub) : ''} titleOf={titleOf} onAdd={t => setAdding({ term: t })} />}
        {tab === 'review' && <Review due={due} all={hs} titleOf={titleOf} />}
      </div>

      {(adding === 'term' || adding?.term !== undefined) && <TermModal draft={adding === 'term' ? {} : { term: adding.term }} onClose={() => setAdding(null)} onSave={t => { dispatch({ type: 'addHighlight', h: { kind: 'term', ...t, text: t.definition } }); setAdding(null); toast('Term added') }} />}
      {adding === 'note' && <NoteModal papers={state.papers} onClose={() => setAdding(null)} onSave={h => { dispatch({ type: 'addHighlight', h }); setAdding(null); toast('Note saved') }} />}
    </>
  )
}

function HighlightList({ list, all, titleOf, onCanvas }) {
  const { dispatch } = useStore()
  const [open, setOpen] = useState(null)
  if (!list.length) return <div className="empty">No highlights yet. Open a paper with a PDF, go to the PDF tab and select text — or add a note above.</div>
  return (
    <div className="stack">{list.map(h => (
      <div key={h.id} className="list-item" style={{ cursor: 'default', borderLeft: `8px solid ${KINDS[h.kind].color}` }}>
        <div className="grow">
          <div className="mono tiny muted">{KINDS[h.kind].label}{h.paperId ? ` · ${titleOf(h.paperId) || 'deleted paper'}` : ''}{h.page ? ` · p.${h.page}` : ''} · {ago(h.createdAt)}</div>
          {h.kind === 'term' ? <div style={{ margin: '4px 0' }}><b>{h.term}</b> — {h.definition}</div> : <div style={{ margin: '4px 0', lineHeight: 1.5 }}>“{h.text}”</div>}
          <input className="input small" style={{ padding: '5px 8px' }} placeholder="Add a note… link a dictionary term with [[term]]" value={h.note || ''} onChange={e => dispatch({ type: 'updateHighlight', id: h.id, patch: { note: e.target.value } })} />
          {linksIn(h.note).length > 0 && <div className="small" style={{ marginTop: 4 }}><Link2 size={12} /> <NoteText text={h.note} /></div>}
          <div className="row wrap" style={{ marginTop: 6, gap: 4 }}>
            {(h.tags || []).map(t => <span key={t} className="tag" style={{ cursor: 'pointer' }} title="Remove tag" onClick={() => dispatch({ type: 'updateHighlight', id: h.id, patch: { tags: h.tags.filter(x => x !== t) } })}>#{t} ×</span>)}
            <input className="input tiny" style={{ width: 110, padding: '2px 6px' }} placeholder="+ tag" onKeyDown={e => { if (e.key === 'Enter' && e.target.value.trim()) { dispatch({ type: 'updateHighlight', id: h.id, patch: { tags: [...new Set([...(h.tags || []), e.target.value.trim()])] } }); e.target.value = '' } }} />
            <button className="btn sm ghost tiny" onClick={() => setOpen(open === h.id ? null : h.id)}>{open === h.id ? 'Hide related' : 'Related →'}</button>
          </div>
          {open === h.id && <Related h={h} all={all} titleOf={titleOf} />}
        </div>
        <div className="stack" style={{ flexShrink: 0 }}>
          {sourceLink(h) && <button className="btn sm" title="Open source" onClick={() => nav(sourceLink(h))}><FileText size={13} /></button>}
          <button className="btn sm" title="Add to canvas" onClick={() => onCanvas(h)}><Network size={13} /></button>
          <button className="btn sm" title="Delete" onClick={() => confirm('Delete this highlight?') && dispatch({ type: 'deleteHighlight', id: h.id })}><Trash2 size={13} /></button>
        </div>
      </div>))}
    </div>
  )
}

function Related({ h, all, titleOf }) {
  const rel = relatedHighlights(h, all)
  return <div className="card flat small" style={{ marginTop: 8, padding: 10 }}>
    <div className="label" style={{ marginBottom: 6 }}>Related across papers</div>
    {!rel.length && <span className="muted">Nothing similar in your other notes yet.</span>}
    {rel.map(({ h: x, score }) => <div key={x.id} style={{ borderLeft: `4px solid ${KINDS[x.kind].color}`, paddingLeft: 8, marginBottom: 6, cursor: sourceLink(x) ? 'pointer' : 'default' }} onClick={() => sourceLink(x) && nav(sourceLink(x))}>
      <div className="mono tiny muted">{titleOf(x.paperId) || 'Note'}{x.page ? ` · p.${x.page}` : ''} · {Math.round(score * 100)}% overlap</div>
      {hlTitle(x).slice(0, 160)}
    </div>)}
  </div>
}

const scrollMainTo = el => { const m = document.querySelector('main'); if (el && m) m.scrollTo({ top: el.getBoundingClientRect().top - m.getBoundingClientRect().top + m.scrollTop - 16, behavior: 'smooth' }) }

function Dictionary({ terms, all, focus, titleOf, onAdd }) {
  const { dispatch } = useStore()
  const [edit, setEdit] = useState(null)
  const target = focus && terms.find(t => t.term.toLowerCase() === focus.toLowerCase())
  useEffect(() => { if (target) setTimeout(() => scrollMainTo(document.getElementById(`term-${target.id}`)), 50) }, [target?.id])
  const sorted = [...terms].sort((a, b) => a.term.localeCompare(b.term))
  const letters = [...new Set(sorted.map(t => t.term[0].toUpperCase()))]
  if (focus && !target) return <div className="empty">“{focus}” isn't in your dictionary yet. <button className="btn sm" onClick={() => onAdd(focus)}>Add it</button></div>
  if (!sorted.length) return <div className="empty">Your dictionary is empty. Select text in a PDF and choose <b>Dictionary</b>, or <button className="btn sm" onClick={() => onAdd('')}>add a term</button>.</div>
  return (
    <>
      <div className="row wrap" style={{ gap: 4, marginBottom: 12 }}>{letters.map(l => <a key={l} className="tag" href={`#letter-${l}`} onClick={e => { e.preventDefault(); scrollMainTo(document.getElementById(`letter-${l}`)) }}>{l}</a>)}</div>
      {letters.map(l => (
        <div key={l} id={`letter-${l}`} style={{ marginBottom: 14 }}>
          <div className="num" style={{ display: 'inline-block', fontSize: 14, padding: '0 8px', marginBottom: 8 }}>{l}</div>
          <div className="grid g2">{sorted.filter(t => t.term[0].toUpperCase() === l).map(t => (
            <div key={t.id} id={`term-${t.id}`} className={`card flat ${target?.id === t.id ? 'flash-outline' : ''}`} style={{ padding: 12 }}>
              <div className="row between"><b style={{ fontSize: 15 }}>{t.term}</b>
                <span className="row" style={{ gap: 2 }}>
                  <button className="star" title="Edit" onClick={() => setEdit(t)}>✎</button>
                  <button className="star" title="Delete" onClick={() => confirm(`Delete “${t.term}”?`) && dispatch({ type: 'deleteHighlight', id: t.id })}><Trash2 size={13} /></button>
                </span></div>
              <div style={{ margin: '6px 0', lineHeight: 1.5 }}>{t.definition}</div>
              {t.note && <div className="small muted">✎ <NoteText text={t.note} /></div>}
              {t.paperId && <a href="#" className="mono tiny muted" onClick={e => { e.preventDefault(); nav(sourceLink(t)) }}>↳ {titleOf(t.paperId)}{t.page ? `, p.${t.page}` : ''}</a>}
              {(() => { const bl = backlinks(t, all); return bl.length > 0 && <details style={{ marginTop: 6 }} open={target?.id === t.id}><summary className="mono tiny" style={{ cursor: 'pointer' }}>Mentioned in {bl.length}</summary>
                {bl.slice(0, 8).map(({ h, linked }) => <div key={h.id} className="small" style={{ borderLeft: `4px solid ${KINDS[h.kind].color}`, paddingLeft: 6, margin: '4px 0', cursor: sourceLink(h) ? 'pointer' : 'default' }} onClick={() => sourceLink(h) && nav(sourceLink(h))}>
                  {linked && <Link2 size={11} />} {hlTitle(h).slice(0, 120)}<span className="muted tiny"> · {titleOf(h.paperId) || 'note'}</span></div>)}
              </details> })()}
            </div>))}
          </div>
        </div>))}
      {edit && <TermModal draft={edit} onClose={() => setEdit(null)} onSave={patch => { dispatch({ type: 'updateHighlight', id: edit.id, patch }); setEdit(null) }} />}
    </>
  )
}

// Flashcards: dictionary terms quiz term → definition; highlights quiz your note/context → the passage.
function Streak() {
  const { state } = useStore()
  const r = state.review || { streak: 0, log: {} }
  const alive = r.last === dayKey() || r.last === dayKey(Date.now() - 864e5)
  const days = Array.from({ length: 14 }, (_, i) => dayKey(Date.now() - (13 - i) * 864e5))
  return <div className="row between wrap" style={{ marginBottom: 14 }}>
    <span className="row"><Flame size={18} color={alive && r.streak ? '#f97316' : 'currentColor'} /><b>{alive ? r.streak : 0}-day streak</b><span className="muted tiny">· {(n => `${n} card${n === 1 ? '' : 's'}`)(Object.values(r.log).reduce((a, b) => a + b, 0))} reviewed all-time</span></span>
    <div className="heat" style={{ width: 230 }} title="Last 14 days">{days.map(d => { const n = r.log[d] || 0; return <span key={d} title={`${d}: ${n}`} style={{ background: n ? `color-mix(in srgb, var(--violet) ${Math.min(100, 25 + n * 8)}%, transparent)` : 'transparent' }} /> })}</div>
  </div>
}

function Review({ due, all, titleOf }) {
  const { dispatch } = useStore()
  const [flipped, setFlipped] = useState(false)
  const [done, setDone] = useState(0)
  const card = due[0]
  if (!all.length) return <><Streak /><div className="empty">Save some highlights or dictionary terms first — they become flashcards here.</div></>
  if (!card) return <><Streak /><div className="empty">🎉 All caught up{done ? ` — reviewed ${done} card${done > 1 ? 's' : ''}` : ''}. Next card due {new Date(Math.min(...all.map(h => h.due))).toLocaleDateString()}.</div></>
  const front = card.kind === 'term' ? card.term : card.note || `${KINDS[card.kind].label} from ${titleOf(card.paperId) || 'your notes'}${card.page ? `, p.${card.page}` : ''} — what was it?`
  const back = card.kind === 'term' ? card.definition : card.text
  const answer = remembered => { dispatch({ type: 'reviewHighlight', id: card.id, remembered }); setFlipped(false); setDone(d => d + 1) }
  return (
    <div style={{ maxWidth: 620, margin: '0 auto' }}>
      <Streak />
      <div className="row between mono tiny muted" style={{ marginBottom: 8 }}><span>{due.length} due · box {card.box || 0}</span><span>{KINDS[card.kind].label}</span></div>
      <div className="flashcard" style={{ borderTop: `10px solid ${KINDS[card.kind].color}` }} onClick={() => setFlipped(!flipped)}>
        {flipped ? <div><div className="muted tiny mono" style={{ marginBottom: 10 }}>{front}</div>{back}</div> : <div><b>{front}</b><div className="muted small" style={{ marginTop: 14 }}>Click to reveal</div></div>}
      </div>
      <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
        {flipped ? <>
          <button className="btn" onClick={() => answer(false)}><RotateCcw size={14} /> Forgot</button>
          <button className="btn lime" onClick={() => answer(true)}><Check size={14} /> Remembered</button>
        </> : <button className="btn dark" onClick={() => setFlipped(true)}>Show answer</button>}
      </div>
    </div>
  )
}

function NoteModal({ papers, onClose, onSave }) {
  const [h, setH] = useState({ kind: 'important', text: '', note: '', paperId: '' })
  return (
    <Modal title="New note" onClose={onClose}>
      <form className="stack" onSubmit={e => { e.preventDefault(); h.text.trim() && onSave({ ...h, paperId: h.paperId || null, text: h.text.trim() }) }}>
        <div className="row" style={{ gap: 4 }}>{Object.entries(KINDS).filter(([k]) => k !== 'term').map(([k, v]) => <button type="button" key={k} className="btn sm" style={{ background: v.color, color: '#0d0d0d', outline: h.kind === k ? '3px solid var(--ink)' : 'none' }} onClick={() => setH({ ...h, kind: k })}>{v.label}</button>)}</div>
        <textarea className="input" autoFocus placeholder="What do you want to remember?" value={h.text} onChange={e => setH({ ...h, text: e.target.value })} />
        <input className="input" placeholder="Extra note (optional)" value={h.note} onChange={e => setH({ ...h, note: e.target.value })} />
        <select className="input" value={h.paperId} onChange={e => setH({ ...h, paperId: e.target.value })}><option value="">Not linked to a paper</option>{papers.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select>
        <button className="btn dark" disabled={!h.text.trim()}>Save</button>
      </form>
    </Modal>
  )
}
