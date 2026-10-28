// Optional Claude integration. Every caller supplies a local fallback, so the app works without a key.
export async function askClaude(settings, { system, prompt, maxTokens = 1200 }) {
  if (!settings.apiKey) return null
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model: settings.model || 'claude-sonnet-5-5', max_tokens: maxTokens, system, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  return data.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
}

import { passages } from './nlp.js'

// With a query, papers that have uploaded PDFs contribute their most relevant full-text passages.
export const paperContext = (papers, query = '') => papers.map((p, i) => {
  const ex = query && p.body ? passages(p.body, query, 3) : []
  return `[${i + 1}] ${p.title} (${p.authors[0] || 'Unknown'}, ${p.year}, arXiv:${p.arxiv})\nAbstract: ${p.abstract}\nMethod: ${p.method || '-'} | Finding: ${p.finding || '-'} | Limitation: ${p.limitation || '-'}${ex.length ? `\nFull-text excerpts:\n${ex.map(e => `> ${e}`).join('\n')}` : ''}`
}).join('\n\n')

export const SYSTEM = 'You are a rigorous AI research assistant inside a research workspace. Ground every claim in the provided papers and cite them as [n]. Be concise and specific.'
