const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
const texEsc = s => String(s ?? '').replace(/([&%$#_{}])/g, '\\$1')

export function download(name, content, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const toBibtex = papers => papers.map(p => `@article{${p.arxiv.replace(/\W/g, '')},\n  title = {${p.title}},\n  author = {${p.authors.join(' and ')}},\n  year = {${p.year}},\n  eprint = {${p.arxiv}},\n  archivePrefix = {arXiv},\n  abstract = {${p.abstract}}\n}`).join('\n\n')

export function toCsv(papers) {
  const cols = ['arxiv', 'title', 'authors', 'year', 'citations', 'tags', 'method', 'dataset', 'finding', 'limitation']
  const cell = v => `"${String(Array.isArray(v) ? v.join('; ') : v ?? '').replace(/"/g, '""')}"`
  return [cols.join(','), ...papers.map(p => cols.map(c => cell(p[c])).join(','))].join('\n')
}

export function toLatex(papers, summary = '') {
  return `\\documentclass{article}\n\\usepackage{booktabs}\n\\begin{document}\n\\section*{Literature Survey}\n${texEsc(summary)}\n\n\\begin{tabular}{llllp{4cm}}\n\\toprule\nPaper & Year & Method & Dataset & Key Finding \\\\\n\\midrule\n${papers.map(p => `${texEsc(p.title.split(':')[0])} & ${p.year} & ${texEsc(p.method)} & ${texEsc(p.dataset)} & ${texEsc(p.finding)} \\\\`).join('\n')}\n\\bottomrule\n\\end{tabular}\n\\end{document}\n`
}

export function toHtmlReport(papers, title = 'Research Report', summary = '') {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:Georgia,serif;max-width:820px;margin:40px auto;line-height:1.5}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #999;padding:6px;text-align:left}</style></head><body><h1>${esc(title)}</h1><p>${esc(summary)}</p><table><tr><th>Paper</th><th>Year</th><th>Method</th><th>Dataset</th><th>Finding</th><th>Limitation</th></tr>${papers.map(p => `<tr><td>${esc(p.title)}</td><td>${p.year}</td><td>${esc(p.method)}</td><td>${esc(p.dataset)}</td><td>${esc(p.finding)}</td><td>${esc(p.limitation)}</td></tr>`).join('')}</table></body></html>`
}

export function printPdf(html) {
  const w = window.open('', '_blank')
  if (!w) return alert('Allow pop-ups to export PDF')
  w.document.write(html)
  w.document.close()
  setTimeout(() => w.print(), 300)
}
