// Semantic Scholar Graph API (proxied at /s2). Real references and citing papers for a paper.
import { inferTags } from './arxiv.js'

const FIELDS = 'title,year,authors,externalIds,abstract,citationCount,venue'
const CACHE = 'ai-research-os/s2'
const cache = (() => { try { return JSON.parse(localStorage.getItem(CACHE)) || {} } catch { return {} } })()
const remember = (k, v) => {
  cache[k] = v
  // Keep the 25 most recent lookups; reference lists are big and localStorage is small.
  const keys = Object.keys(cache).sort((a, b) => cache[b].fetchedAt - cache[a].fetchedAt)
  for (const old of keys.slice(25)) delete cache[old]
  try { localStorage.setItem(CACHE, JSON.stringify(cache)) } catch {}
}

let apiKey = ''
async function get(path, retry = 2) {
  const res = await fetch(`/s2/graph/v1/${path}`, apiKey ? { headers: { 'x-api-key': apiKey } } : undefined)
  if (res.status === 429 && retry) { await new Promise(r => setTimeout(r, 1500 * (3 - retry))); return get(path, retry - 1) }
  if (res.status === 404) return null
  if (!res.ok) throw new Error(res.status === 429 ? 'Semantic Scholar is rate-limiting shared requests — try again in a minute, or add a free API key in Settings → Integrations' : `Semantic Scholar ${res.status}`)
  return res.json()
}

const slim = p => p && p.title && ({
  s2: p.paperId, arxiv: p.externalIds?.ArXiv || '', doi: p.externalIds?.DOI || '', title: p.title, year: p.year || 0,
  authors: (p.authors || []).map(a => a.name), citations: p.citationCount || 0, venue: p.venue || '', abstract: (p.abstract || '').slice(0, 600),
})

const isArxiv = p => !/^(pdf-|local-|zotero-|s2-)/.test(p.arxiv)

export async function citationGraph(paper, { force, s2Key = '' } = {}) {
  apiKey = s2Key
  const key = paper.id
  if (!force && cache[key] && Date.now() - cache[key].fetchedAt < 7 * 864e5) return cache[key]
  let ref = isArxiv(paper) ? `arXiv:${paper.arxiv}` : null
  if (!ref) {
    const m = await get(`paper/search/match?query=${encodeURIComponent(paper.title)}&fields=paperId`)
    ref = m?.data?.[0]?.paperId
    if (!ref) throw new Error('Paper not found on Semantic Scholar')
  }
  const meta = await get(`paper/${ref}?fields=citationCount,referenceCount,url`)
  if (!meta) throw new Error('Paper not found on Semantic Scholar')
  // Sequential on purpose: the keyless shared pool rate-limits bursts.
  const refs = await get(`paper/${ref}/references?fields=${FIELDS}&limit=100`)
  const cites = await get(`paper/${ref}/citations?fields=${FIELDS}&limit=100`)
  const out = {
    url: meta.url, citationCount: meta.citationCount || 0, referenceCount: meta.referenceCount || 0, fetchedAt: Date.now(),
    refs: (refs?.data || []).map(r => slim(r.citedPaper)).filter(Boolean),
    cites: (cites?.data || []).map(r => slim(r.citingPaper)).filter(Boolean).sort((a, b) => b.citations - a.citations),
  }
  remember(key, out)
  return out
}

const norm = t => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
// Finds the library paper matching a Semantic Scholar entry by arXiv id or title.
export function inLibrary(papers, item) {
  return papers.find(p => (item.arxiv && p.arxiv === item.arxiv) || norm(p.title) === norm(item.title))
}

export function toPaper(item) {
  const id = item.arxiv || `s2-${item.s2}`
  return {
    id, arxiv: item.arxiv || id, title: item.title, authors: item.authors.length > 2 ? [item.authors[0], 'et al.'] : item.authors,
    year: item.year, citations: item.citations, tags: inferTags(`${item.title} ${item.abstract}`), abstract: item.abstract || item.title,
    venue: item.venue || 'Semantic Scholar', doi: item.doi, starred: false, addedAt: Date.now(), status: 'toread',
  }
}
