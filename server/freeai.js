// Free AI allowance: signed-in users without their own key get a few requests a day on the server's key.
// Configure with FREE_AI_KEY (+ optional FREE_AI_PROVIDER, FREE_AI_MODEL, FREE_AI_URL, FREE_AI_DAILY, FREE_AI_GLOBAL).
// Gemini and Groq both have free plans and an OpenAI-compatible endpoint, so one code path serves them.
const PROVIDERS = {
  gemini: { url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', model: 'gemini-flash-latest', label: 'Gemini' },
  groq: { url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile', label: 'Llama (Groq)' },
  openai: { url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4.1-mini', label: 'OpenAI' },
  openrouter: { url: 'https://openrouter.ai/api/v1/chat/completions', model: 'meta-llama/llama-3.3-70b-instruct:free', label: 'OpenRouter' },
  anthropic: { url: 'https://api.anthropic.com/v1/messages', model: 'claude-haiku-5-5', label: 'Claude' },
}
const KEY = process.env.FREE_AI_KEY || ''
const NAME = PROVIDERS[process.env.FREE_AI_PROVIDER] ? process.env.FREE_AI_PROVIDER : 'gemini'
const P = PROVIDERS[NAME]
const MODEL = process.env.FREE_AI_MODEL || P.model
// FREE_AI_URL points at any other OpenAI-compatible endpoint (a self-hosted model, a proxy).
const URL_ = process.env.FREE_AI_URL || P.url
export const DAILY = Math.max(0, Number(process.env.FREE_AI_DAILY ?? 25))
// A cap across all users so a burst of sign-ups can't exhaust the key.
const GLOBAL = Math.max(1, Number(process.env.FREE_AI_GLOBAL ?? 1000))
const MAX_TOKENS = 1500

export const freeAiInfo = () => KEY && DAILY ? { daily: DAILY, model: `${P.label} · ${MODEL}` } : null

const today = () => new Date().toISOString().slice(0, 10)
let global = { day: today(), n: 0 }
export const usedToday = u => (u.ai?.day === today() ? u.ai.n : 0)

// Returns { text, left }. A request counts only if the provider answered.
export async function freeAsk(user, body, fail) {
  if (!freeAiInfo()) fail(404, 'Free AI is not set up on this server')
  if (global.day !== today()) global = { day: today(), n: 0 }
  const used = usedToday(user)
  if (used >= DAILY) fail(429, `You've used today's ${DAILY} free AI requests. They reset at midnight UTC — or add your own key in Settings for unlimited use.`)
  if (global.n >= GLOBAL) fail(429, 'The free AI allowance is used up for today. Add your own key in Settings, or try again tomorrow.')
  const system = String(body.system || '').slice(0, 8000), prompt = String(body.prompt || '').slice(0, 60000)
  if (!prompt.trim()) fail(400, 'Empty prompt')
  const maxTokens = Math.min(MAX_TOKENS, Math.max(16, Number(body.maxTokens) || 1200))
  // Reserve the request before the slow upstream call so parallel requests can't overshoot the cap.
  user.ai = { day: today(), n: used + 1 }
  global.n++
  const refund = () => { user.ai = { day: today(), n: Math.max(0, usedToday(user) - 1) }; global.n-- }
  const r = await call(system, prompt, maxTokens).catch(e => { refund(); throw e })
  if (!r.ok) {
    refund()
    console.error('free AI', r.status, (await r.text()).slice(0, 300))
    fail(502, r.status === 429 ? 'The free AI provider is busy. Try again in a minute.' : 'The free AI provider failed. Try again later.')
  }
  const data = await r.json()
  const text = NAME === 'anthropic' ? data.content?.filter(b => b.type === 'text').map(b => b.text).join('\n') : data.choices?.[0]?.message?.content
  return { text: text || '', left: DAILY - usedToday(user) }
}

function call(system, prompt, maxTokens) {
  return NAME === 'anthropic'
    ? fetch(URL_, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system: system || undefined, messages: [{ role: 'user', content: prompt }] }) })
    : fetch(URL_, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` }, body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }] }) })
}
