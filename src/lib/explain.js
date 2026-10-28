// "Explain this" + auto-define for reader selections. Claude when a key is set; otherwise a local
// explanation stitched from the user's dictionary, definitional sentences in the paper, and related papers.
import { tokenize, passages, search } from './nlp.js'
import { highlightsContext } from './highlights.js'

// PDF text keeps line-break hyphens ("win-\ndows") and loose punctuation ("management , a").
const clean = text => (text || '').replace(/(\w)-\s*\n\s*(\w)/g, '$1$2').replace(/\s+([,.;:)])/g, '$1').replace(/\s+/g, ' ')
const sentences = text => clean(text).split(/(?<=[.!?])\s+(?=[A-Z(])/)
const DEF = /\b(is|are|refers? to|denotes?|means?|is defined as|we call|called|stands? for)\b/i
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Sentences in the paper that look like they define `term`.
export function findDefinitions(term, body, n = 2) {
  const t = term.toLowerCase().trim()
  if (!t || !body) return []
  const acro = term.match(/\(([A-Z]{2,})\)/)?.[1]
  // "X is …", "X refers to …", or an appositive right after the term: "X, a technique that …".
  const appos = new RegExp(`${esc(t)}\\)?,\\s+(a|an|the|which|i\\.e\\.)\\b`, 'i')
  const score = s => (appos.test(s) ? 2 : 0) + (DEF.test(s) ? 1 : 0)
  return sentences(body).filter(s => {
    const l = s.toLowerCase()
    return s.length < 450 && (l.includes(t) || (acro && s.includes(acro))) && score(s) > 0
  }).sort((a, b) => score(b) - score(a) || a.toLowerCase().indexOf(t) - b.toLowerCase().indexOf(t)).slice(0, n)
}

const termsIn = (text, highlights) => highlights.filter(h => h.kind === 'term' && h.term && text.toLowerCase().includes(h.term.toLowerCase()))

export function explainPrompt({ text, paper, highlights }) {
  const ctx = paper.body ? passages(paper.body, text, 2).join('\n…\n') : paper.abstract
  const terms = termsIn(text, highlights)
  return `A researcher selected this passage while reading "${paper.title}" (${paper.year}):\n\n"""${text}"""\n\nSurrounding context from the paper:\n${ctx}\n\n${terms.length ? `Their own dictionary already says:\n${highlightsContext(terms)}\n\n` : ''}Explain the passage in plain language for a smart reader new to this subfield: what it means, any jargon, and why it matters for the paper. Use 3–6 short bullets, then one line starting "In short:".`
}

export function localExplain({ text, paper, highlights, index }) {
  const out = []
  const terms = termsIn(text, highlights)
  if (terms.length) out.push('## From your dictionary', ...terms.map(t => `- **${t.term}** — ${t.definition}`))
  // A short selection is probably a term itself; otherwise try its longest content words.
  const src = paper.body || paper.abstract
  const whole = text.split(' ').length <= 6 ? findDefinitions(text, src, 2) : []
  const words = [...new Set(tokenize(text))].sort((a, b) => b.length - a.length).slice(0, 4)
  const defs = [...new Set([...whole, ...words.flatMap(w => findDefinitions(w, src, 1))])].filter(d => !text.includes(d.slice(0, 40)))
  if (defs.length) out.push('## What the paper says', ...defs.slice(0, 3).map(d => `- ${d}`))
  const around = paper.body ? passages(paper.body, text, 2, 400).filter(p => !p.includes(text.slice(0, 40))) : []
  if (around.length) out.push('## Related passages in this paper', ...around.map(p => `- …${p.slice(0, 280)}…`))
  const rel = search(index, text, 4).filter(r => r.paper.id !== paper.id).slice(0, 3)
  if (rel.length) out.push('## Also discussed in', ...rel.map(r => `- **${r.paper.title.split(':')[0]}** (${r.paper.year}) — ${r.match}% match`))
  if (!out.length) out.push('No definitions found locally. Add a Claude API key in Settings for a plain-language explanation.')
  return out.join('\n')
}

export const definePrompt = (term, paper) => `Define the term "${term}" as used in the paper "${paper?.title || 'unknown'}" in 1–2 plain sentences. Context:\n${paper?.body ? passages(paper.body, term, 2).join('\n…\n') : paper?.abstract || ''}\n\nReply with the definition only.`

export function localDefine(term, paper) {
  const [d] = findDefinitions(term, paper?.body || paper?.abstract || '')
  return d || ''
}
