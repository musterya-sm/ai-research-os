import { normSpec } from './reproduce.js'

// Share links carry their content in the URL fragment (#/s/<data>), compressed with deflate.
// Nothing is uploaded and the fragment never reaches the server, so links work on any host and survive restarts.
const MAX = 60000 // chars of encoded data; well under browser URL limits, keeps links pasteable

const unb64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer())

export async function encodeShare(payload) {
  const bytes = await pipe(new TextEncoder().encode(JSON.stringify(payload)), new CompressionStream('deflate-raw'))
  let out = ''
  for (let i = 0; i < bytes.length; i += 8192) out += String.fromCharCode(...bytes.subarray(i, i + 8192))
  const data = btoa(out).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  if (data.length > MAX) throw new Error('Too large to share as a link — export a file instead.')
  return `${location.origin}${location.pathname}#/s/${data}`
}

export async function decodeShare(data) {
  const bytes = await pipe(unb64url(data), new DecompressionStream('deflate-raw'))
  return cleanShare(JSON.parse(new TextDecoder().decode(bytes)))
}

const str = (v, n = 20000) => (typeof v === 'string' ? v.slice(0, n) : '')
const arr = v => (Array.isArray(v) ? v : [])
const paperOut = p => ({ id: str(p.id, 80), title: str(p.title, 300), authors: arr(p.authors).map(a => str(a, 80)).slice(0, 6), year: Number(p.year) || 0, arxiv: str(p.arxiv, 40), venue: str(p.venue, 80), abstract: str(p.abstract, 2500), finding: str(p.finding, 500), tags: arr(p.tags).map(t => str(t, 40)).slice(0, 8) })

// Shared data comes from whoever made the link: coerce everything to the expected shapes.
export function cleanShare(x) {
  const base = { kind: str(x?.kind, 20), title: str(x?.title, 300), by: str(x?.by, 80), at: Number(x?.at) || 0 }
  if (base.kind === 'draft') return { ...base, body: str(x.body, 100000), papers: arr(x.papers).filter(p => p && typeof p.id === 'string').map(paperOut).slice(0, 80) }
  if (base.kind === 'collection') return { ...base, papers: arr(x.papers).filter(p => p && typeof p.id === 'string').map(paperOut).slice(0, 200) }
  if (base.kind === 'project') return { ...base, source: str(x.source, 300), spec: normSpec(x.spec && typeof x.spec === 'object' ? x.spec : {}), steps: arr(x.steps).filter(s => s && typeof s === 'object').map(s => ({ title: str(s.title, 300), detail: str(s.detail, 3000), done: !!s.done, note: str(s.note, 3000) })).slice(0, 40) }
  if (base.kind === 'hypotheses') return { ...base, items: arr(x.items).filter(h => h && typeof h === 'object').map(h => ({ text: str(h.text, 2000), rationale: str(h.rationale, 3000), focus: str(h.focus, 200) })).slice(0, 50) }
  throw new Error('Unknown share type')
}

// Builders: only what a reader needs — no API keys, chats, PDFs or generated code.
const meta = (state, kind, title) => ({ kind, title, by: state.settings.name || '', at: Date.now() })
export const shareDraft = (state, d) => ({ ...meta(state, 'draft', d.title), body: d.body, papers: state.papers.filter(p => d.ids?.includes?.(p.id) || d.body.includes(p.arxiv)).map(paperOut) })
export const shareCollection = (state, c) => ({ ...meta(state, 'collection', c.name), papers: state.papers.filter(p => c.paperIds.includes(p.id)).map(paperOut) })
export const shareProject = (state, p) => ({ ...meta(state, 'project', p.title), source: p.source?.type === 'paper' ? `Reproducing: ${p.title}` : 'Idea → experiment', spec: { ...p.spec, related: [] }, steps: p.steps.map(s => ({ title: s.title, detail: s.detail, done: s.done, note: s.note })) })
export const shareHypotheses = (state, hs) => ({ ...meta(state, 'hypotheses', 'Research hypotheses'), items: hs.map(h => ({ text: h.text, rationale: h.rationale, focus: h.focus })) })

export async function copyShare(payload, toast) {
  try {
    const url = await encodeShare(payload)
    await navigator.clipboard.writeText(url).catch(() => prompt('Copy this link', url))
    toast('Share link copied — read-only, anyone with it can view')
  } catch (e) { toast(e.message || 'Could not create link') }
}
