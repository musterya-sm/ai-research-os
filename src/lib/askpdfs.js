import { tokenize } from './nlp.js'
import { getPdf, putPdf } from './pdfstore.js'
import { openPdf } from './pdf.js'

// "Ask my PDFs": BM25 over page-sized passages of every uploaded PDF, so answers can cite the exact page.
const SIZE = 900, STEP = 700
const cache = new Map() // paperId → [{ page, text, toks }]

async function pagesOf(id) {
  const rec = await getPdf(id).catch(() => null)
  if (!rec) return []
  if (Array.isArray(rec.pageTexts)) return rec.pageTexts
  // PDFs uploaded before page texts were stored: re-read once from the blob and keep the result.
  const doc = await openPdf(new Uint8Array(await rec.blob.arrayBuffer()))
  const pages = []
  for (let i = 1; i <= doc.numPages; i++) pages.push((await (await doc.getPage(i)).getTextContent()).items.map(it => it.str + (it.hasEOL ? '\n' : ' ')).join(''))
  await putPdf(id, { ...rec, pageTexts: pages }).catch(() => {})
  return pages
}

async function chunksOf(id) {
  if (!cache.has(id)) {
    const out = []
    ;(await pagesOf(id)).forEach((raw, i) => {
      const t = raw.replace(/(\w)-\s*\n\s*(\w)/g, '$1$2').replace(/\s+/g, ' ').trim()
      for (let s = 0; s < t.length; s += STEP) { const text = t.slice(s, s + SIZE).replace(s ? /^\S*\s/ : /^/, '').replace(/\s\S*$/, s + SIZE < t.length ? '' : '$&'); if (text.length > 80) out.push({ page: i + 1, text, toks: tokenize(text) }); if (s + SIZE >= t.length) break }
    })
    cache.set(id, out)
  }
  return cache.get(id)
}

export async function askPdfs(papers, query, k = 8, onProgress) {
  const withPdf = papers.filter(p => p.hasPdf)
  const all = []
  for (const [i, p] of withPdf.entries()) { for (const c of await chunksOf(p.id)) all.push({ ...c, paper: p }); onProgress?.((i + 1) / withPdf.length) }
  const q = [...new Set(tokenize(query))]
  if (!q.length || !all.length) return []
  const df = new Map(q.map(t => [t, all.filter(c => c.toks.includes(t)).length]))
  const avg = all.reduce((n, c) => n + c.toks.length, 0) / all.length
  const N = all.length
  const scored = all.map(c => {
    let s = 0
    for (const t of q) {
      const f = c.toks.filter(x => x === t).length
      if (f) s += Math.log(1 + (N - df.get(t) + 0.5) / (df.get(t) + 0.5)) * (f * 2.2) / (f + 1.2 * (0.25 + 0.75 * c.toks.length / avg))
    }
    return { ...c, score: s }
  }).filter(c => c.score > 0).sort((a, b) => b.score - a.score)
  // At most 3 passages per paper, and never two overlapping windows from the same page.
  const per = new Map(), picked = []
  for (const c of scored) {
    const key = `${c.paper.id}:${c.page}`
    if ((per.get(c.paper.id) || 0) >= 3 || picked.some(x => `${x.paper.id}:${x.page}` === key)) continue
    per.set(c.paper.id, (per.get(c.paper.id) || 0) + 1); picked.push(c)
    if (picked.length >= k) break
  }
  return picked
}

export const short = p => p.title.split(':')[0].slice(0, 40)
export const pdfContext = hits => hits.map((h, i) => `[${i + 1}] ${h.paper.title} (${h.paper.authors[0] || 'Unknown'}, ${h.paper.year}) — page ${h.page}:\n"${h.text}"`).join('\n\n')
export const pdfPrompt = (q, hits, history) => `${history ? `Conversation so far:\n${history}\n\n` : ''}Question: ${q}\n\nPassages from the user's PDFs, each with its page:\n${pdfContext(hits)}\n\nAnswer only from these passages. Cite every claim as [n] (the passage number). If the passages don't answer the question, say so plainly and say what is missing.`

export function localPdfAnswer(q, hits) {
  if (!hits.length) return 'Nothing in your PDFs matched that question. Try different words, or upload the PDFs that cover it.'
  return [`The passages in your PDFs that best match this question:`, '', ...hits.flatMap((h, i) => [`**[${i + 1}] ${short(h.paper)}, p. ${h.page}**`, `> “${h.text.slice(0, 420)}…”`, '']),
    '_Search only. Add a Claude API key in Settings to get a written answer that cites these pages._'].join('\n')
}
