const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const texEsc = s => String(s ?? '').replace(/([&%$#_{}])/g, '\\$1')

export function download(name, content, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const citeKey = p => `${(p.authors[0] || 'anon').split(' ').pop().replace(/\W/g, '').toLowerCase()}${p.year || ''}${p.arxiv.replace(/\W/g, '').slice(-5)}`
export const toBibtex = papers => papers.map(p => `@article{${citeKey(p)},\n  title = {${p.title}},\n  author = {${p.authors.join(' and ')}},\n  year = {${p.year}},\n${/^\d{4}\.\d{4,5}$/.test(p.arxiv) ? `  eprint = {${p.arxiv}},\n  archivePrefix = {arXiv},\n` : p.doi ? `  doi = {${p.doi}},\n` : ''}  abstract = {${p.abstract}}\n}`).join('\n\n')

export function toCsv(papers) {
  const cols = ['arxiv', 'title', 'authors', 'year', 'citations', 'tags', 'method', 'dataset', 'finding', 'limitation']
  const cell = v => `"${String(Array.isArray(v) ? v.join('; ') : v ?? '').replace(/"/g, '""')}"`
  return [cols.join(','), ...papers.map(p => cols.map(c => cell(p[c])).join(','))].join('\n')
}

export function toLatex(papers, summary = '') {
  return `\\documentclass{article}\n\\usepackage{booktabs}\n\\begin{document}\n\\section*{Literature Survey}\n${texEsc(summary)}\n\n\\begin{tabular}{llllp{4cm}}\n\\toprule\nPaper & Year & Method & Dataset & Key Finding \\\\\n\\midrule\n${papers.map(p => `${texEsc(p.title.split(':')[0])} & ${p.year} & ${texEsc(p.method)} & ${texEsc(p.dataset)} & ${texEsc(p.finding)} \\\\`).join('\n')}\n\\bottomrule\n\\end{tabular}\n\\end{document}\n`
}

export function toHtmlReport(papers, title = 'Research Report', summary = '') {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:Georgia,serif;max-width:820px;margin:40px auto;line-height:1.5}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #999;padding:6px;text-align:left}</style></head><body><h1>${esc(title)}</h1><p>${esc(summary)}</p><table><tr><th>Paper</th><th>Year</th><th>Method</th><th>Dataset</th><th>Finding</th><th>Limitation</th></tr>${papers.map(p => `<tr><td>${esc(p.title)}</td><td>${esc(p.year)}</td><td>${esc(p.method)}</td><td>${esc(p.dataset)}</td><td>${esc(p.finding)}</td><td>${esc(p.limitation)}</td></tr>`).join('')}</table></body></html>`
}

export function printPdf(html) {
  const w = window.open('', '_blank')
  if (!w) return alert('Allow pop-ups to export PDF')
  w.document.write(html)
  w.document.close()
  setTimeout(() => w.print(), 300)
}

// Workspace JSON for sharing: never include the API key. Optionally bundles uploaded PDFs as base64.
export async function workspaceJson(state, { includePdfs = false } = {}) {
  const { apiKey, zoteroKey, s2Key, ...settings } = state.settings
  const out = { ...state, settings }
  if (includePdfs) {
    const { getPdf } = await import('./pdfstore.js')
    out.pdfs = {}
    for (const p of state.papers.filter(p => p.hasPdf)) {
      const rec = await getPdf(p.id).catch(() => null)
      if (rec) out.pdfs[p.id] = { name: rec.name, pages: rec.pages, text: rec.text, data: await blobToBase64(rec.blob) }
    }
  }
  return JSON.stringify(out, null, 2)
}

const blobToBase64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob) })

export async function restorePdfs(pdfs) {
  const { putPdf } = await import('./pdfstore.js')
  let n = 0
  for (const [id, rec] of Object.entries(pdfs || {})) {
    if (typeof rec?.data !== 'string') continue
    const bytes = Uint8Array.from(atob(rec.data), c => c.charCodeAt(0))
    await putPdf(id, { blob: new Blob([bytes], { type: 'application/pdf' }), name: String(rec.name || `${id}.pdf`), text: String(rec.text || ''), pages: Number(rec.pages) || 0 })
    n++
  }
  return n
}
