import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import { useStore } from '../lib/store.jsx'
import { KINDS } from '../lib/highlights.js'
import { nav, toast } from './ui.jsx'

// Guided product tour: each step opens a screen, spotlights part of it and explains it.
// Steps whose target is missing (e.g. no PDF uploaded yet) fall back to a centred card.
const CONTENT = 'main .head + *'
const firstPaper = s => s.papers.find(p => p.id === '2310.08560') || s.papers[0]
const withPdf = s => s.papers.find(p => p.hasPdf)
const Chips = ({ items }) => <div className="row wrap" style={{ gap: 4, margin: '8px 0 2px' }}>{items.map(([l, c]) => <span key={l} className="tag" style={{ background: c, color: '#0d0d0d', borderColor: '#0d0d0d' }}>{l}</span>)}</div>

export const STEPS = [
  { chapter: 'Basics', title: 'Welcome to AI Research OS 👋', body: 'Your workspace for finding, reading, connecting and writing up research papers. This 2-minute tour walks through every screen. Use the arrow keys, or skip and come back any time from Settings or the ? button.', route: '/dashboard' },
  { chapter: 'Basics', target: '.rail', place: 'right', title: 'Navigation', body: 'Every screen lives in this rail, grouped into: overview & papers, analysis tools, AI tools, and your notes & writing. Hover an icon to see its name.', route: '/dashboard' },
  { chapter: 'Basics', target: 'main form.search', title: 'Search anything', body: 'Search papers, authors and topics by meaning, not just keywords. Press / anywhere in the app to jump to search.', route: '/dashboard' },
  { chapter: 'Basics', target: 'main .grid.side-r > .stack:last-child', place: 'left', title: 'Your day at a glance', body: '“Continue reading” picks up where you left off, “Remember this” surfaces a note that is due for review, and the activity feed shows what you and your team changed.', route: '/dashboard' },
  { chapter: 'Papers', target: 'main .head .actions', place: 'bottom', title: 'Bring in papers', body: 'Upload your own PDFs (text is extracted in the browser and arXiv papers get matched automatically), or import from arXiv search, Zotero, BibTeX or by hand. You can also drag PDFs onto the library.', route: '/library' },
  { chapter: 'Papers', target: 'main .grid.side > .card', place: 'right', title: 'Organise your library', body: 'Filter by starred, papers with PDFs, your reading list (To read / Reading / Done) and your own collections.', route: '/library' },
  { chapter: 'Papers', target: '[data-tour=status]', title: 'One page per paper', body: 'Each paper gets a TL;DR, key points, your notes, a methodology diagram and a reading status with progress. Tabs below switch to the PDF, a deep AI summary, figures and the citation graph.', route: s => `/paper/${encodeURIComponent(firstPaper(s)?.id || '')}` },
  { chapter: 'Papers', target: 'main .tabs', title: 'Real citation graph', body: 'The Citations tab pulls actual references and citing papers from Semantic Scholar. Add them to your library in one click or map them onto the canvas.', route: s => `/paper/${encodeURIComponent(firstPaper(s)?.id || '')}` },
  { chapter: 'Reading', target: '.reader-scroll', place: 'left', title: 'The PDF reader', body: 'Scroll through the whole paper, zoom, search inside it or press Listen to have it read aloud. It reopens on the page you stopped at.', route: s => withPdf(s) ? `/paper/${encodeURIComponent(withPdf(s).id)}/pdf` : '/library', fallback: 'Upload a PDF from the Library to use the reader. It scrolls through the whole paper, supports zoom, search and read-aloud, and reopens where you left off.' },
  { chapter: 'Reading', title: 'Highlight to remember', body: 'Select any text in a PDF — even across two pages — and pick what it is:', visual: <Chips items={Object.values(KINDS).map(k => [k.label, k.color]).concat([['✨ Explain', '#c9b6ff']])} />, after: '“Explain” gives a plain-language explanation of the passage. “Dictionary” saves a term — Auto-define fills in the definition from the paper — and that term gets a hover definition everywhere it appears in the app.', route: s => withPdf(s) ? `/paper/${encodeURIComponent(withPdf(s).id)}/pdf` : '/library' },
  { chapter: 'Notes', target: 'main .tabs', title: 'Knowledge Notebook', body: 'All your highlights and notes in one place: search, filter by kind or paper, tag them, link dictionary terms with [[term]] and see related notes from other papers.', route: '/notes' },
  { chapter: 'Notes', target: CONTENT, title: 'Flashcard review', body: 'Your highlights and terms become flashcards. Mark them Remembered or Forgot and they come back after 1, 3, 7, 16 and 35 days. Keep a daily streak going — and set a reminder in Settings → Notifications.', route: '/notes/review' },
  { chapter: 'Notes', target: CONTENT, title: 'Writing Studio', body: 'Tick the highlights you want, choose a section (Related Work, Background…) and a citation style, and get a cited draft plus a references.bib file. “Open in Overleaf” turns it into a ready-to-compile LaTeX project, and “Share link” gives anyone a read-only copy.', route: '/write' },
  { chapter: 'Notes', target: '[data-tour=reading-goal]', title: 'Reading Queue', body: 'Tell it what you are working towards and your To-read list is ranked by fit, with papers already in progress first. Pin what matters, and track pages per day, streaks and finished papers. It also estimates how many reading days your queue will take at your pace.', route: '/reading' },
  { chapter: 'Notes', target: '[data-tour=lab-new]', title: 'Reproduce Lab', body: 'Want to recreate a paper, or test an idea of your own? Pick one and choose “Guide me” (one step at a time, with hints and check-yourself questions), “Plan it for me” (the full plan plus a Python scaffold) or “Build it for me” (the platform writes and checks the whole codebase and packages it as a Colab notebook for a free GPU). The Lab pulls datasets, hyperparameters, metrics and code links from the PDF, flags what the paper leaves out, tracks your numbers against the paper’s, and has a mentor for when you get stuck. Also on every paper page: “Reproduce this”.', route: '/lab' },
  { chapter: 'Analysis', target: CONTENT, title: 'Graph Canvas', body: 'A whiteboard of papers and concepts. Drag nodes, draw links with the link tool, auto-arrange, and double-click a paper to open it.', route: '/canvas' },
  { chapter: 'Analysis', target: CONTENT, title: 'Literature Survey', body: 'Pick papers and get a comparison table (method, dataset, finding, limitation) with a written overview you can export to LaTeX or CSV.', route: '/survey' },
  { chapter: 'Analysis', target: CONTENT, title: 'Gap Detection', body: 'Finds combinations of topics your library rarely covers — good places for new research.', route: '/gaps' },
  { chapter: 'Analysis', target: CONTENT, title: 'Hypothesis Generator', body: 'Turns gaps and findings into testable hypotheses with a rationale, an experiment idea and supporting papers. Save the good ones.', route: '/hypotheses' },
  { chapter: 'Analysis', target: CONTENT, title: 'Contradiction Detection', body: 'Spots papers that make opposing claims about the same topic, so you know where the field disagrees.', route: '/contradictions' },
  { chapter: 'Analysis', target: CONTENT, title: 'Timeline Evolution', body: 'See how ideas developed year by year and which papers started each wave.', route: '/timeline' },
  { chapter: 'Analysis', target: CONTENT, title: 'Concept Clusters', body: 'Papers grouped automatically by what they are about, so you can see the shape of your library.', route: '/clusters' },
  { chapter: 'AI tools', target: CONTENT, title: 'AI Research Copilot', body: 'Ask questions about your library. Answers cite your papers, quote your uploaded PDFs and include what is in your notebook.', route: '/copilot' },
  { chapter: 'AI tools', target: CONTENT, title: 'Agent Workflows', body: 'One-click multi-step jobs, such as a literature review, a related-work pass or a research briefing, that produce a full report.', route: '/workflows' },
  { chapter: 'AI tools', target: CONTENT, title: 'Recommendation Feed', body: 'Suggestions based on what you have read and starred, with the reason each paper was picked.', route: '/feed' },
  { chapter: 'AI tools', target: '[data-tour=alerts]', title: 'Topic alerts', body: 'Follow topics or authors. Once a day the app pulls their newest arXiv papers, skips anything you already have, and ranks the rest by how close they are to your library. New matches also appear on the Dashboard.', route: '/feed/alerts' },
  { chapter: 'Team', target: CONTENT, title: 'Export & Collaborate', body: 'Export to PDF, Word, LaTeX, CSV, BibTeX or a full workspace file. Once sync is on, invite teammates with single-use links and edit together live.', route: '/export' },
  { chapter: 'Team', target: 'main .nav-list', place: 'right', title: 'Settings', body: 'Add a Claude API key for AI answers (the guided setup takes about 2 minutes, and you can also click any “LOCAL ENGINE” badge; everything works without one), sign in to sync across devices, set review reminders, switch to dark mode — and restart this tour.', route: '/settings' },
  { chapter: 'Team', target: '[data-tour=help]', place: 'right', title: 'You’re all set 🎉', body: 'Revisit the tour any time with this ? button or from Settings → Preferences. A good first step: upload a PDF from the Library and highlight something you want to remember.', route: '/dashboard' },
]
export const CHAPTERS = [...new Set(STEPS.map(s => s.chapter))]

export const startTour = (chapter) => window.dispatchEvent(new CustomEvent('tour:start', { detail: { chapter } }))

const PAD = 8, W = 340

export default function Tour() {
  const { state, dispatch } = useStore()
  const [i, setI] = useState(null)
  const [rect, setRect] = useState(null)
  const [missing, setMissing] = useState(false)
  const card = useRef()
  const step = i === null ? null : STEPS[i]

  // First visit → start automatically (not on invite links or the landing page).
  useEffect(() => {
    const inApp = () => { const r = location.hash.replace(/^#\/?/, '').split('/')[0]; return !!r && r !== 'home' && r !== 'join' }
    let auto = !state.settings.tourDone
    const maybe = () => { if (auto && inApp()) { auto = false; setI(0) } }
    maybe()
    const on = e => { auto = false; const c = e.detail?.chapter; setI(c ? STEPS.findIndex(s => s.chapter === c) : 0) }
    window.addEventListener('tour:start', on)
    window.addEventListener('hashchange', maybe)
    return () => { window.removeEventListener('tour:start', on); window.removeEventListener('hashchange', maybe) }
  }, [])

  // Go to the step's screen, wait for its target, scroll it into view inside <main>.
  useEffect(() => {
    if (!step) return
    const route = typeof step.route === 'function' ? step.route(state) : step.route
    if (route && location.hash.replace(/^#/, '') !== route) nav(route)
    setRect(null); setMissing(false)
    if (!step.target) return
    let tries = 0, t
    const find = () => {
      const el = document.querySelector(step.target)
      if (el) {
        const m = document.querySelector('main'), r = el.getBoundingClientRect(), mr = m.getBoundingClientRect()
        if (m.contains(el) && (r.top < mr.top + 60 || r.top > mr.bottom - 120)) m.scrollTop += r.top - mr.top - 80
        return
      }
      if (++tries < 20) t = setTimeout(find, 100); else setMissing(true)
    }
    t = setTimeout(find, 60)
    return () => clearTimeout(t)
  }, [i])

  // Track the target every frame so the spotlight follows layout changes and scrolling.
  useLayoutEffect(() => {
    if (!step?.target) return
    let raf
    const loop = () => {
      const el = !missing && document.querySelector(step.target)
      const r = el?.getBoundingClientRect()
      setRect(prev => {
        if (!r || !r.width) return null
        const n = { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: Math.min(r.height + PAD * 2, innerHeight - r.top + PAD) }
        return prev && Math.abs(prev.x - n.x) + Math.abs(prev.y - n.y) + Math.abs(prev.w - n.w) + Math.abs(prev.h - n.h) < 1 ? prev : n
      })
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [i, missing])

  useEffect(() => {
    if (!step) return
    const k = e => {
      if (e.key === 'Escape') skip()
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') back()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [i])

  if (!step) return null
  const finish = () => { setI(null); dispatch({ type: 'settings', patch: { tourDone: true } }) }
  function skip() { finish(); toast('Tour skipped — restart it any time from Settings or the ? button') }
  function next() { i < STEPS.length - 1 ? setI(i + 1) : finish() }
  function back() { i > 0 && setI(i - 1) }

  const phone = innerWidth < 700
  const spot = step.target && rect && !missing
  // Card placement: preferred side if it fits, otherwise below/above, clamped to the viewport.
  let pos = { left: (innerWidth - W) / 2, top: innerHeight / 2 - 140 }
  if (spot && !phone) {
    const h = card.current?.offsetHeight || 220, fits = { right: rect.x + rect.w + 16 + W < innerWidth, left: rect.x - 16 - W > 0, bottom: rect.y + rect.h + 16 + h < innerHeight }
    const side = step.place && fits[step.place] ? step.place : fits.bottom ? 'bottom' : fits.right ? 'right' : fits.left ? 'left' : 'top'
    pos = side === 'right' ? { left: rect.x + rect.w + 16, top: rect.y } : side === 'left' ? { left: rect.x - 16 - W, top: rect.y }
      : side === 'bottom' ? { left: rect.x, top: rect.y + rect.h + 16 } : { left: rect.x, top: rect.y - 16 - h }
    pos = { left: Math.max(12, Math.min(pos.left, innerWidth - W - 12)), top: Math.max(12, Math.min(pos.top, innerHeight - h - 12)) }
  }
  const chapterSteps = STEPS.filter(s => s.chapter === step.chapter)

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label={`Tour step ${i + 1} of ${STEPS.length}: ${step.title}`}>
      {spot ? <div className="tour-spot" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} /> : <div className="tour-dim" />}
      <div ref={card} className={`tour-card ${phone ? 'sheet' : ''}`} style={phone ? null : { ...pos, width: W }}>
        <div className="row between">
          <span className="mono tiny" style={{ color: 'var(--violet)', fontWeight: 700 }}>{step.chapter.toUpperCase()} · {chapterSteps.indexOf(step) + 1}/{chapterSteps.length}</span>
          <button className="btn sm ghost" onClick={skip} aria-label="Skip tour"><X size={14} /></button>
        </div>
        <h3 style={{ margin: '6px 0 6px', fontSize: 15, textTransform: 'none', letterSpacing: 0, fontFamily: 'var(--sans)' }}>{step.title}</h3>
        <p className="small" style={{ margin: 0, lineHeight: 1.55 }}>{missing && step.fallback ? step.fallback : step.body}</p>
        {step.visual}
        {step.after && <p className="small" style={{ margin: '6px 0 0', lineHeight: 1.55 }}>{step.after}</p>}
        <div className="tour-dots">{STEPS.map((s, n) => <button key={n} aria-label={`Step ${n + 1}`} className={n === i ? 'on' : n < i ? 'seen' : ''} onClick={() => setI(n)} />)}</div>
        <div className="row between">
          <button className="btn sm ghost" onClick={skip}>Skip tour</button>
          <span className="row">
            {i > 0 && <button className="btn sm" onClick={back}><ArrowLeft size={13} /> Back</button>}
            <button className="btn sm dark" autoFocus onClick={next}>{i === 0 ? 'Start tour' : i === STEPS.length - 1 ? 'Finish' : 'Next'} {i < STEPS.length - 1 && <ArrowRight size={13} />}</button>
          </span>
        </div>
      </div>
    </div>
  )
}
