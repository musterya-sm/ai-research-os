import { useEffect, useState } from 'react'
import { Star, X } from 'lucide-react'
import { useStore } from '../lib/store.jsx'
import { askClaude, SYSTEM } from '../lib/ai.js'

export const nav = path => { window.location.hash = path }
export const ago = t => { const m = (Date.now() - t) / 6e4; return m < 60 ? `${Math.max(1, m | 0)}m ago` : m < 1440 ? `${(m / 60) | 0}h ago` : `${(m / 1440) | 0}d ago` }
export const authorLine = p => `${p.authors.join(' ')} · ${p.year} · arXiv: ${p.arxiv}`

export function Head({ n, title, sub, children, violet }) {
  return (
    <div className="head">
      <span className={`num ${violet ? 'violet' : ''}`}>{String(n).padStart(2, '0')}</span>
      <div><h1>{title}</h1><p>{sub}</p></div>
      {children && <div className="actions">{children}</div>}
    </div>
  )
}

export const Toggle = ({ on, onChange, label }) => <button type="button" aria-label={label} aria-pressed={on} className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => { const k = e => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  return (
    <div className="modal-bg" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={wide ? { width: 'min(900px,100%)' } : null}>
        <div className="row between" style={{ marginBottom: 14 }}><h3 className="label" style={{ margin: 0 }}>{title}</h3><button className="btn ghost sm" onClick={onClose}><X size={16} /></button></div>
        {children}
      </div>
    </div>
  )
}

export const Tags = ({ tags }) => <span>{(tags || []).map(t => <span key={t} className="tag">{t}</span>)}</span>

export function PaperRow({ paper, right, onClick }) {
  const { dispatch } = useStore()
  return (
    <div className="list-item" onClick={onClick || (() => nav(`/paper/${paper.id}`))}>
      <div className="thumb" />
      <div className="grow">
        <div className="t">{paper.title} {paper.hasPdf && <span className="tag violet">PDF</span>}</div>
        <div className="muted tiny mono">{authorLine(paper)}</div>
        {right === undefined && <div style={{ marginTop: 6 }}><Tags tags={paper.tags} /></div>}
      </div>
      {right}
      <button className={`star ${paper.starred ? 'on' : ''}`} aria-label="Star" onClick={e => { e.stopPropagation(); dispatch({ type: 'toggleStar', id: paper.id }) }}>
        <Star size={17} fill={paper.starred ? 'currentColor' : 'none'} />
      </button>
    </div>
  )
}

export function AiBadge() {
  const { state } = useStore()
  const on = !!state.settings.apiKey
  return <span className={`ai-badge ${on ? 'on' : ''}`} title={on ? 'Using Claude' : 'Add a Claude API key in Settings for LLM answers'}>{on ? `CLAUDE · ${state.settings.model}` : 'LOCAL ENGINE'}</span>
}

// Runs a Claude prompt when a key is configured, otherwise the local fallback.
export function useAI() {
  const { state } = useStore()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function run({ prompt, system = SYSTEM, fallback, maxTokens }) {
    setBusy(true); setError('')
    try {
      const out = await askClaude(state.settings, { system, prompt, maxTokens })
      return out ?? (await fallback())
    } catch (e) {
      setError(`${e.message} — showing local result instead.`)
      return await fallback()
    } finally { setBusy(false) }
  }
  return { run, busy, error, live: !!state.settings.apiKey }
}

let toastTimer
export function toast(msg) {
  let el = document.querySelector('.toast')
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el) }
  el.textContent = msg
  el.style.display = 'block'
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { el.style.display = 'none' }, 2200)
}

const escHtml = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Wraps dictionary terms found in already-escaped HTML with a hover definition (first occurrence per block).
function useGlossary() {
  const { state } = useStore()
  const terms = state.highlights.filter(h => h.kind === 'term' && h.term?.length > 2).sort((a, b) => b.term.length - a.term.length)
  return html => {
    if (!terms.length) return html
    const seen = new Set()
    const re = new RegExp(`\\b(${terms.map(t => escHtml(t.term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'gi')
    // Only replace in text, never inside tags/attributes.
    return html.split(/(<[^>]+>)/).map(part => part.startsWith('<') ? part : part.replace(re, m => {
      const t = terms.find(x => escHtml(x.term).toLowerCase() === m.toLowerCase())
      if (!t || seen.has(t.id)) return m
      seen.add(t.id)
      return `<abbr class="gloss" title="${escHtml(t.definition)}">${m}</abbr>`
    })).join('')
  }
}

// Plain text with dictionary terms underlined.
export function Gloss({ text }) {
  const link = useGlossary()
  return <span dangerouslySetInnerHTML={{ __html: link(escHtml(text)) }} />
}

// Renders light markdown from LLM output: headings, bullets, bold.
export function Prose({ text }) {
  const link = useGlossary()
  return (
    <div style={{ lineHeight: 1.6 }}>
      {String(text || '').split('\n').map((line, i) => {
        const html = link(escHtml(line).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'))
        if (/^#{1,3}\s/.test(line)) return <div key={i} className="label" style={{ marginTop: 10 }} dangerouslySetInnerHTML={{ __html: html.replace(/^#+\s/, '') }} />
        if (/^\s*([-*•]|\d+\.)\s/.test(line)) return <div key={i} style={{ paddingLeft: 14 }} dangerouslySetInnerHTML={{ __html: html }} />
        return line.trim() ? <p key={i} style={{ margin: '4px 0' }} dangerouslySetInnerHTML={{ __html: html }} /> : null
      })}
    </div>
  )
}
