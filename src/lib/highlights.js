import { tokenize } from './nlp.js'

// Shared metadata + helpers for highlights / dictionary.
export const KINDS = {
  important: { label: 'Important', color: '#fde047' },
  idea: { label: 'Idea', color: '#86efac' },
  question: { label: 'Question', color: '#f9a8d4' },
  term: { label: 'Dictionary', color: '#93c5fd' },
}

export const isDue = h => (h.due || 0) <= Date.now()
export const hlTitle = h => (h.kind === 'term' ? h.term : h.text)

// Plain substring scoring is enough here: notes are short and the user's own words.
export function searchHighlights(highlights, query, limit = 8) {
  const words = query.toLowerCase().split(/\W+/).filter(w => w.length > 2)
  if (!words.length) return []
  return highlights.map(h => {
    const hay = `${h.term || ''} ${h.definition || ''} ${h.text || ''} ${h.note || ''} ${(h.tags || []).join(' ')}`.toLowerCase()
    return { h, score: words.filter(w => hay.includes(w)).length + (h.term && query.toLowerCase().includes(h.term.toLowerCase()) ? 3 : 0) }
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map(x => x.h)
}

export const highlightsContext = hs => hs.map(h => h.kind === 'term'
  ? `- [Dictionary] ${h.term}: ${h.definition}`
  : `- [${KINDS[h.kind].label}${h.page ? `, p.${h.page}` : ''}] "${h.text}"${h.note ? ` — note: ${h.note}` : ''}`).join('\n')

export function notebookMarkdown(highlights, papers) {
  const title = id => papers.find(p => p.id === id)?.title || 'Unlinked'
  const terms = highlights.filter(h => h.kind === 'term').sort((a, b) => a.term.localeCompare(b.term))
  const byPaper = {}
  for (const h of highlights.filter(h => h.kind !== 'term')) (byPaper[h.paperId || ''] ||= []).push(h)
  return [`# Research Notebook`, '', `## Dictionary`, ...terms.map(t => `- **${t.term}** — ${t.definition}${t.paperId ? ` _(${title(t.paperId)})_` : ''}`), '',
    ...Object.entries(byPaper).flatMap(([pid, hs]) => [`## ${title(pid)}`, ...hs.map(h => `- ${KINDS[h.kind].label}${h.page ? ` (p.${h.page})` : ''}: “${h.text}”${h.note ? `\n  - ${h.note}` : ''}`), ''])].join('\n')
}

// [[term]] links inside notes and highlight text.
export const linksIn = text => [...String(text || '').matchAll(/\[\[([^\]]{1,80})\]\]/g)].map(m => m[1].trim())

// Everything that points at a dictionary term: explicit [[links]] first, then plain mentions.
export function backlinks(term, highlights) {
  const t = term.term.toLowerCase()
  return highlights.filter(h => h.id !== term.id).map(h => {
    const linked = linksIn(`${h.note} ${h.text} ${h.definition || ''}`).some(l => l.toLowerCase() === t)
    const mentioned = !linked && `${h.text} ${h.note} ${h.definition || ''}`.toLowerCase().includes(t)
    return linked || mentioned ? { h, linked } : null
  }).filter(Boolean).sort((a, b) => b.linked - a.linked)
}

// Highlights from *other* papers with the most word overlap (cosine on token counts).
export function relatedHighlights(h, all, n = 3) {
  const vec = x => { const m = new Map(); for (const t of tokenize(`${x.term || ''} ${x.text} ${x.note || ''} ${(x.tags || []).join(' ')}`)) m.set(t, (m.get(t) || 0) + 1); return m }
  const norm = m => Math.sqrt([...m.values()].reduce((s, v) => s + v * v, 0)) || 1
  const a = vec(h), na = norm(a)
  return all.filter(x => x.id !== h.id && (!h.paperId || x.paperId !== h.paperId)).map(x => {
    const b = vec(x); let dot = 0
    for (const [t, v] of a) dot += v * (b.get(t) || 0)
    return { h: x, score: dot / (na * norm(b)) }
  }).filter(r => r.score > 0.12).sort((x, y) => y.score - x.score).slice(0, n)
}
