import { searchArxiv } from './arxiv.js'
import { queryVector, cosine } from './nlp.js'
import { dayKey } from './store.jsx'

// Topic alerts: once a day, ask arXiv for the newest papers on each followed topic and author,
// drop what's already in the library or was shown before, and rank the rest by closeness to the library.
const PER_QUERY = 15, MAX_ITEMS = 40, MAX_AGE_DAYS = 30
const wait = ms => new Promise(r => setTimeout(r, ms))

// Mean of the 3 best cosine matches against library papers: "how much this looks like what you read".
export function relevance(index, p) {
  if (!index.papers.length) return 0
  const q = queryVector(index, `${p.title} ${p.title} ${p.abstract}`)
  const best = index.vectors.map(v => cosine(q, v)).sort((a, b) => b - a).slice(0, 3)
  return best.reduce((n, x) => n + x, 0) / best.length
}

export const due = alerts => (alerts.topics.length || alerts.authors.length) && dayKey(alerts.lastRun || 0) !== dayKey()

export async function runAlerts({ alerts, papers, index }) {
  const known = new Set([...papers.map(p => p.id), ...alerts.seen])
  const found = new Map()
  const queries = [...alerts.topics.map(t => ['all', t, `Topic “${t}”`]), ...alerts.authors.map(a => ['au', a, `New from ${a}`])]
  let failures = 0
  for (const [i, [field, q, why]] of queries.entries()) {
    if (i) await wait(1200) // arXiv asks for gentle request rates
    try {
      for (const p of await searchArxiv(q, PER_QUERY, { field, phrase: true, newest: true })) {
        if (known.has(p.id)) continue
        const age = p.published ? (Date.now() - Date.parse(p.published)) / 864e5 : 0
        if (age > MAX_AGE_DAYS) continue
        const prev = found.get(p.id)
        found.set(p.id, prev ? { ...prev, why: [...new Set([...prev.why, why])] } : { paper: p, why: [why], at: Date.now() })
      }
    } catch { failures++ }
  }
  if (failures && failures === queries.length) throw new Error('arXiv is not reachable right now')
  const fresh = [...found.values()].map(x => ({ ...x, score: relevance(index, x.paper) })).sort((a, b) => b.score - a.score)
  // New matches go on top; older unread ones stay below until dismissed.
  const items = [...fresh, ...alerts.items.filter(x => !found.has(x.paper.id))].slice(0, MAX_ITEMS)
  return { items, fresh: fresh.length, lastRun: Date.now(), seen: [...alerts.seen, ...fresh.map(x => x.paper.id)].slice(-1000) }
}

export const matchPct = s => Math.min(99, Math.round(100 * Math.sqrt(Math.max(0, s))))
