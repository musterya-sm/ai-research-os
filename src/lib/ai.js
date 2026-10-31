// Optional LLM integration: the user's own Anthropic or OpenAI key, called straight from the browser.
// Every caller supplies a local fallback, so the app works without a key.
export const PROVIDERS = { anthropic: 'Claude', openai: 'OpenAI' }
export const activeKey = s => (s.provider === 'openai' ? s.openaiKey : s.apiKey) || ''
export const hasAI = s => !!activeKey(s)
export const aiName = s => (s.provider === 'openai' ? `OPENAI · ${s.openaiModel || 'gpt-4.1-mini'}` : `CLAUDE · ${s.model}`)

export async function askClaude(settings, { system, prompt, maxTokens = 1200 }) {
  if (!hasAI(settings)) return null
  if (settings.provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${settings.openaiKey}` },
      body: JSON.stringify({ model: settings.openaiModel || 'gpt-4.1-mini', max_completion_tokens: maxTokens, messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }] }),
    })
    if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const data = await res.json()
    return data.choices?.[0]?.message?.content || ''
  }
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
