// Local text intelligence: TF-IDF index, cosine search, k-means clustering, extractive summaries.
const STOP = new Set('a an and are as at be by can for from has have in into is it its of on or that the their this to was we with which while without using use used via our these those than then they such also both each over more most less not only all any how what when where who why do does may new show shows paper approach method model models large language llm llms based'.split(' '))

export function tokenize(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/)
    .filter(t => t.length > 2 && !STOP.has(t))
    .map(t => t.replace(/(ies)$/, 'y').replace(/(ing|ed|es|s)$/, '') || t)
}

const docText = p => `${p.title} ${p.title} ${(p.tags || []).join(' ')} ${p.abstract} ${p.method || ''} ${p.finding || ''}`

export function buildIndex(papers) {
  const df = new Map()
  const tfs = papers.map(p => {
    const tf = new Map()
    for (const t of tokenize(docText(p))) tf.set(t, (tf.get(t) || 0) + 1)
    for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1)
    return tf
  })
  const N = papers.length || 1
  const idf = t => Math.log(1 + N / (df.get(t) || 0.5))
  const vectors = tfs.map(tf => normalize(new Map([...tf].map(([t, c]) => [t, (1 + Math.log(c)) * idf(t)]))))
  return { papers, vectors, idf, df }
}

function normalize(v) {
  let n = 0
  for (const w of v.values()) n += w * w
  n = Math.sqrt(n) || 1
  for (const [t, w] of v) v.set(t, w / n)
  return v
}

export function cosine(a, b) {
  let s = 0
  const [small, big] = a.size < b.size ? [a, b] : [b, a]
  for (const [t, w] of small) { const o = big.get(t); if (o) s += w * o }
  return s
}

export function queryVector(index, text) {
  const tf = new Map()
  for (const t of tokenize(text)) tf.set(t, (tf.get(t) || 0) + 1)
  return normalize(new Map([...tf].map(([t, c]) => [t, (1 + Math.log(c)) * index.idf(t)])))
}

// Score mapped into a readable "match %" — raw cosine of short queries is small, so stretch it.
export function search(index, text, limit = 50) {
  if (!text.trim()) return []
  const q = queryVector(index, text)
  return index.papers.map((p, i) => ({ paper: p, score: cosine(q, index.vectors[i]) }))
    .filter(r => r.score > 0.01)
    .sort((a, b) => b.score - a.score).slice(0, limit)
    .map(r => ({ ...r, match: Math.min(99, Math.round(60 + 40 * Math.sqrt(r.score))) }))
}

export function similar(index, paperId, limit = 5) {
  const i = index.papers.findIndex(p => p.id === paperId)
  if (i < 0) return []
  return index.papers.map((p, j) => ({ paper: p, score: j === i ? -1 : cosine(index.vectors[i], index.vectors[j]) }))
    .sort((a, b) => b.score - a.score).slice(0, limit)
}

export function topTerms(vectors, limit = 3) {
  const sum = new Map()
  for (const v of vectors) for (const [t, w] of v) sum.set(t, (sum.get(t) || 0) + w)
  return [...sum].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([t]) => t)
}

// Deterministic k-means over sparse vectors with farthest-point initialisation.
export function kmeans(index, k = 5, iters = 12) {
  const V = index.vectors
  if (V.length <= k) return V.map((_, i) => i)
  let centroids = [V[0]]
  while (centroids.length < k) {
    let best = 0, bestD = -1
    V.forEach((v, i) => { const d = Math.min(...centroids.map(c => 1 - cosine(v, c))); if (d > bestD) { bestD = d; best = i } })
    centroids.push(V[best])
  }
  let assign = []
  for (let it = 0; it < iters; it++) {
    assign = V.map(v => centroids.reduce((bi, c, ci) => cosine(v, c) > cosine(v, centroids[bi]) ? ci : bi, 0))
    centroids = centroids.map((c, ci) => {
      const members = V.filter((_, i) => assign[i] === ci)
      if (!members.length) return c
      const m = new Map()
      for (const v of members) for (const [t, w] of v) m.set(t, (m.get(t) || 0) + w / members.length)
      return normalize(m)
    })
  }
  return assign
}

export function summarize(text, n = 2) {
  const sentences = (text || '').match(/[^.!?]+[.!?]+/g) || [text]
  if (sentences.length <= n) return sentences.join(' ').trim()
  const freq = new Map()
  for (const t of tokenize(text)) freq.set(t, (freq.get(t) || 0) + 1)
  return sentences.map((s, i) => ({ s, i, score: tokenize(s).reduce((a, t) => a + (freq.get(t) || 0), 0) / Math.sqrt(tokenize(s).length || 1) }))
    .sort((a, b) => b.score - a.score).slice(0, n).sort((a, b) => a.i - b.i).map(x => x.s.trim()).join(' ')
}

export function keyPoints(p) {
  return [p.finding && `Key finding: ${p.finding}.`, p.method && `Approach: ${p.method}.`, p.dataset && `Evaluated on ${p.dataset}.`, p.limitation && `Limitation: ${p.limitation}.`].filter(Boolean)
}

// Concept coverage used by gap detection and the radar chart.
export const DIMENSIONS = [
  { key: 'Long-term Learning', terms: ['long-term', 'lifelong', 'continual', 'persistent', 'evolve'] },
  { key: 'Multimodal', terms: ['multimodal', 'multi-modal', 'vision', 'image', 'embodied'] },
  { key: 'Compression', terms: ['compress', 'summariz', 'consolidat', 'abstract'] },
  { key: 'Scalability', terms: ['scal', 'trillion', 'million', 'efficien', 'latency'] },
  { key: 'Evaluation', terms: ['benchmark', 'evaluat', 'dataset'] },
  { key: 'Tool Use', terms: ['tool', 'api', 'action', 'execut'] },
  { key: 'Planning', terms: ['plan', 'decision', 'curriculum', 'search'] },
  { key: 'Retrieval', terms: ['retriev', 'index', 'datastore', 'passage'] },
]

export function hasDim(p, dim) {
  const t = `${p.title} ${p.abstract} ${(p.tags || []).join(' ')}`.toLowerCase()
  return dim.terms.some(term => t.includes(term))
}

export function coverage(papers) {
  return DIMENSIONS.map(d => ({ ...d, count: papers.filter(p => hasDim(p, d)).length, share: papers.length ? papers.filter(p => hasDim(p, d)).length / papers.length : 0 }))
}

// Gap = concept pairs that each appear often but rarely together (observed << expected co-occurrence).
export function detectGaps(papers, focus = 'Memory') {
  const pool = papers.filter(p => (p.tags || []).includes(focus) || p.abstract.toLowerCase().includes(focus.toLowerCase()))
  const N = papers.length || 1
  const gaps = DIMENSIONS.map(d => {
    const withDim = papers.filter(p => hasDim(p, d)).length
    const both = pool.filter(p => hasDim(p, d)).length
    const expected = (pool.length * withDim) / N
    return { dim: d.key, both, expected, score: expected - both + (withDim > 0 && both <= 1 ? 1.5 : 0), withDim }
  }).sort((a, b) => b.score - a.score)
  return gaps.slice(0, 5).map(g => ({
    ...g, focus, title: `${focus} × ${g.dim}`,
    impact: g.score > 2 ? 'HIGH IMPACT' : g.score > 0.8 ? 'MEDIUM IMPACT' : 'EMERGING',
    detail: g.both === 0 ? `No papers combine ${focus.toLowerCase()} with ${g.dim.toLowerCase()} in your library.`
      : `Only ${g.both} paper${g.both > 1 ? 's' : ''} combine ${focus.toLowerCase()} with ${g.dim.toLowerCase()} (≈${g.expected.toFixed(1)} expected).`,
  }))
}
