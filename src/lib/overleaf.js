import { citeKey } from './exporter.js'
import { zip } from './autobuild.js'

// Writing Studio draft → a compilable LaTeX project (main.tex + references.bib) for Overleaf.
const ESC = { '\\': '\\textbackslash{}', '&': '\\&', '%': '\\%', $: '\\$', '#': '\\#', _: '\\_', '{': '\\{', '}': '\\}', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}' }
export const texEsc = s => String(s).replace(/[\\&%$#_{}~^]/g, c => ESC[c])
const CITE = /(\\cite[pt]?\{[\w:,\s-]*\})/
const inline = s => s.split(CITE).map((part, i) => i % 2 ? part : texEsc(part)
  .replace(/\*\*(.+?)\*\*/g, '\\textbf{$1}').replace(/\*(.+?)\*/g, '\\emph{$1}')
  .replace(/“/g, '``').replace(/”/g, "''").replace(/‘/g, '`').replace(/’/g, "'").replace(/…/g, '\\ldots{}').replace(/—/g, '---').replace(/–/g, '--')).join('')

// Numeric [n] and (Surname et al., Year) citations are turned back into \cite{} using the papers they name.
function resolveCites(body, papers) {
  const lines = body.split('\n')
  const refAt = lines.findIndex(l => /^#{1,3}\s*references\s*$/i.test(l.trim()))
  const text = refAt >= 0 ? lines.slice(0, refAt) : lines
  const num = new Map()
  if (refAt >= 0) for (const l of lines.slice(refAt + 1)) {
    const m = l.match(/^\s*\[(\d+)\]\s+(.*)$/)
    const p = m && papers.find(p => m[2].includes(p.title))
    if (p) num.set(m[1], citeKey(p))
  }
  const surname = p => (p.authors[0] || '').split(' ').pop()
  const out = text.join('\n')
    .replace(/\[(\d+(?:\s*[,–-]\s*\d+)*)\]/g, (all, list) => { const ks = list.split(/\s*,\s*/).map(n => num.get(n)); return ks.every(Boolean) ? `\\cite{${ks.join(',')}}` : all })
    .replace(/\(([A-Z][\w'’-]+) et al\.,? (\d{4})\)/g, (all, sn, yr) => { const p = papers.find(p => surname(p) === sn && String(p.year) === yr); return p ? `\\cite{${citeKey(p)}}` : all })
  return out
}

function bodyToTex(md) {
  const out = [], list = []
  let env = null
  const flush = () => { if (env) { out.push(`\\begin{${env}}`, ...list.map(i => `  \\item ${i}`), `\\end{${env}}`, ''); list.length = 0; env = null } }
  for (const raw of md.split('\n')) {
    const l = raw.trimEnd()
    const h = l.match(/^(#{1,3})\s+(.*)$/), ul = l.match(/^\s*[-*•]\s+(.*)$/), ol = l.match(/^\s*\d+\.\s+(.*)$/)
    if (h) { flush(); out.push(`\\${['section', 'section', 'subsection'][h[1].length - 1]}{${inline(h[2])}}`, ''); continue }
    if (ul || ol) { const e = ul ? 'itemize' : 'enumerate'; if (env !== e) flush(); env = e; list.push(inline((ul || ol)[1])); continue }
    flush()
    out.push(l.startsWith('>') ? `\\begin{quote}${inline(l.replace(/^>\s?/, ''))}\\end{quote}` : inline(l))
  }
  flush()
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

const bibField = s => String(s ?? '').replace(/[{}\\]/g, '').replace(/([&%$#_])/g, '\\$1')
export const bib = papers => papers.map(p => `@article{${citeKey(p)},\n  title = {{${bibField(p.title)}}},\n  author = {${bibField(p.authors.filter(a => a !== 'et al.').join(' and ') || 'Unknown')}${p.authors.includes('et al.') ? ' and others' : ''}},\n  year = {${Number(p.year) || ''}},\n${/^\d{4}\.\d{4,5}$/.test(p.arxiv) ? `  journal = {arXiv preprint arXiv:${p.arxiv}},\n  eprint = {${p.arxiv}},\n  archivePrefix = {arXiv},\n  url = {https://arxiv.org/abs/${p.arxiv}},\n` : p.venue ? `  journal = {${bibField(p.venue)}},\n` : ''}}`).join('\n\n')

export function toLatexProject({ title, body, author, papers }) {
  const resolved = resolveCites(body, papers)
  const keys = new Set([...resolved.matchAll(/\\cite[pt]?\{([^}]*)\}/g)].flatMap(m => m[1].split(',').map(k => k.trim())))
  const used = papers.filter(p => keys.has(citeKey(p)))
  const main = `\\documentclass[11pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{lmodern}
\\usepackage[numbers,sort&compress]{natbib}
\\usepackage[colorlinks=true,allcolors=blue]{hyperref}

\\title{${texEsc(title || 'Draft')}}
\\author{${texEsc(author || '')}}
\\date{\\today}

\\begin{document}
\\maketitle

${bodyToTex(resolved)}

\\bibliographystyle{plainnat}
\\bibliography{references}

\\end{document}
`
  return { 'main.tex': main, 'references.bib': bib(used) + '\n', cited: used.length }
}

export const latexZip = files => zip({ 'main.tex': files['main.tex'], 'references.bib': files['references.bib'] }, 'overleaf')

// Overleaf's documented "open in Overleaf" API: POST the files to /docs and it creates a project.
export function openInOverleaf(files) {
  const form = Object.assign(document.createElement('form'), { method: 'POST', action: 'https://www.overleaf.com/docs', target: '_blank' })
  const add = (name, value) => form.appendChild(Object.assign(document.createElement('input'), { type: 'hidden', name, value }))
  for (const name of ['main.tex', 'references.bib']) { add('encoded_snip[]', encodeURIComponent(files[name])); add('snip_name[]', name) }
  add('engine', 'pdflatex')
  document.body.appendChild(form); form.submit(); form.remove()
}
