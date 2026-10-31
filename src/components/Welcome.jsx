import { useState } from 'react'
import { Sparkles, Upload, BookOpen, X, Plus, HelpCircle } from 'lucide-react'
import { toast, nav } from './ui.jsx'
import ImportModal from './ImportModal.jsx'
import { useStore, samplePapers } from '../lib/store.jsx'
import { startGuide } from './Tour.jsx'
import { searchArxiv } from '../lib/arxiv.js'

const TOPICS = ['LLM Agents', 'Retrieval-Augmented Generation', 'Memory for LLMs', 'Reasoning', 'Tool Use', 'Long Context', 'Multi-Agent Systems', 'Evaluation & Benchmarks', 'Diffusion Models', 'Computer Vision', 'Reinforcement Learning', 'Graph Neural Networks', 'Speech', 'Robotics', 'AI Safety', 'Efficient Inference']
const PER_TOPIC = 6
const wait = ms => new Promise(r => setTimeout(r, ms))

// Clears the sample library, lands on the empty Dashboard and walks through the ways to add papers.
export function removeSample(state, dispatch) {
  const n = samplePapers(state).length
  if (!confirm(`Remove the sample library? Its ${n} papers, collections, canvas and any notes on them are deleted. Papers you added yourself stay.`)) return
  dispatch({ type: 'removeSample' })
  nav('/dashboard')
  startGuide('start')
}

// Shown on an empty library: who you are, what you research, and a starter library built from arXiv.
export function Welcome() {
  const { state, dispatch } = useStore()
  const [name, setName] = useState(state.settings.name)
  const [picked, setPicked] = useState([])
  const [custom, setCustom] = useState('')
  const [busy, setBusy] = useState('')
  const [importing, setImporting] = useState(false)
  const toggle = t => setPicked(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t])
  const addCustom = () => { const t = custom.trim(); if (t && !picked.includes(t)) setPicked([...picked, t]); setCustom('') }
  const saveName = () => name.trim() !== state.settings.name && dispatch({ type: 'settings', patch: { name: name.trim() } })
  // Stay on screen until the whole starter library is in, even though papers start arriving after the first topic.
  if (state.papers.length && !busy) return null

  async function build() {
    saveName()
    dispatch({ type: 'settings', patch: { setupBusy: true } })
    let added = 0, failed = 0
    for (const [i, t] of picked.entries()) {
      setBusy(`Finding papers on “${t}” (${i + 1}/${picked.length})…`)
      if (i) await wait(1200) // arXiv asks for gentle request rates
      try {
        const ps = await searchArxiv(t, PER_TOPIC)
        dispatch({ type: 'addPapers', papers: ps })
        if (ps.length) dispatch({ type: 'upsertCollections', collections: [{ name: t, paperIds: ps.map(p => p.id) }] })
        added += ps.length
      } catch { failed++ }
    }
    // Keep the library fresh: follow the same topics as daily arXiv alerts.
    dispatch({ type: 'alerts', patch: { topics: [...new Set([...state.alerts.topics, ...picked])], lastRun: Date.now() } })
    setBusy('')
    dispatch({ type: 'settings', patch: { setupBusy: false } })
    if (added) toast(`Added ${added} papers in ${picked.length} collection${picked.length > 1 ? 's' : ''}. New ones arrive daily in Topic alerts.`)
    else toast(failed ? 'arXiv is busy right now. Try again in a minute, upload PDFs, or load the sample library.' : 'No papers found for those topics. Try broader ones.')
  }

  return (
    <div className="card" data-tour="welcome" style={{ borderColor: 'var(--violet)', marginBottom: 16 }}>
      <h2 style={{ marginTop: 0, fontFamily: 'var(--mono)' }}>Welcome! Let's set up your library</h2>
      <p className="muted" style={{ marginTop: 0 }}>Your library is yours alone: it's saved in this browser (or your account, if you sign in). Start from your research interests, your own PDFs, or a sample library.</p>
      <label className="small" style={{ maxWidth: 360, display: 'block' }}>What should we call you?
        <input className="input" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} onBlur={saveName} />
      </label>
      <div data-tour="welcome-topics">
      <div className="label" style={{ marginTop: 14 }}>What do you research? Pick a few</div>
      <div style={{ margin: '6px 0' }}>
        {[...TOPICS, ...picked.filter(t => !TOPICS.includes(t))].map(t => <button key={t} type="button" className={`tag ${picked.includes(t) ? 'violet' : ''}`} style={{ cursor: 'pointer', fontSize: 11, padding: '3px 8px' }} aria-pressed={picked.includes(t)} onClick={() => toggle(t)}>{picked.includes(t) ? '✓ ' : ''}{t}</button>)}
      </div>
      <div className="row" style={{ maxWidth: 420 }}><input className="input" placeholder="Or type your own topic" value={custom} onChange={e => setCustom(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }} /><button className="btn sm" type="button" disabled={!custom.trim()} onClick={addCustom}><Plus size={13} /></button></div>
      </div>
      <div className="row wrap" style={{ marginTop: 14 }}>
        <button className="btn violet" data-tour="build" disabled={!picked.length || !!busy} onClick={build}>{busy ? <span className="spinner" /> : <Sparkles size={14} />} Build my starter library{picked.length ? ` (${picked.length * PER_TOPIC} papers)` : ''}</button>
        <button className="btn" data-tour="upload" onClick={() => { saveName(); setImporting(true) }}><Upload size={14} /> Upload PDFs / import</button>
        <button className="btn ghost" onClick={() => { saveName(); dispatch({ type: 'loadSample' }); toast('Sample library loaded. Remove it any time from the Dashboard or Settings.') }}><BookOpen size={14} /> Load sample library</button>
        <button className="btn ghost" onClick={() => startGuide('start')}><HelpCircle size={14} /> Show me how</button>
      </div>
      {busy && <p className="small muted" style={{ marginBottom: 0 }}>{busy}</p>}
      {importing && <ImportModal onClose={() => setImporting(false)} />}
    </div>
  )
}

// For libraries that still contain the demo papers (everyone who started before libraries began empty).
export function SampleBanner() {
  const { state, dispatch } = useStore()
  const n = samplePapers(state).length
  if (n < 5 || state.settings.sampleBannerHidden) return null
  return (
    <div className="card flat row between" style={{ background: 'var(--soft)', padding: '10px 14px' }} data-tour="sample-banner">
      <span className="small"><b>{n} of your papers are the sample library.</b> Remove it to start from a blank slate with only your own papers; we'll show you how to add yours.</span>
      <span className="row" style={{ gap: 6 }}>
        <button className="btn sm dark" onClick={() => removeSample(state, dispatch)}>Remove sample library</button>
        <button className="star" aria-label="Keep them" title="Keep them" onClick={() => dispatch({ type: 'settings', patch: { sampleBannerHidden: true } })}><X size={14} /></button>
      </span>
    </div>
  )
}
