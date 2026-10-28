import { extractPdf, BODY_CHARS } from './pdf.js'
import { putPdf } from './pdfstore.js'
import { searchArxiv } from './arxiv.js'

const MAX_MB = 50

// Upload one PDF: extract text, enrich from arXiv when an ID is found, store the file, add/attach the paper.
export async function ingestPdf(file, { papers, dispatch, attachTo, onProgress }) {
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) throw new Error('not a PDF')
  if (file.size > MAX_MB * 1e6) throw new Error(`larger than ${MAX_MB} MB`)
  const ex = await extractPdf(file, onProgress)
  if (!ex.text.trim()) throw new Error('no extractable text (scanned PDF?)')

  let id = attachTo || (ex.arxiv && papers.some(p => p.id === ex.arxiv) ? ex.arxiv : null)
  const pdfFields = { hasPdf: true, pdfName: file.name, pdfPages: ex.numPages, body: ex.text.slice(0, BODY_CHARS) }
  const attached = !!id
  if (id) {
    dispatch({ type: 'updatePaper', id, patch: pdfFields })
  } else {
    let meta = null
    if (ex.arxiv) meta = await searchArxiv(ex.arxiv, 1).then(r => r[0]).catch(() => null)
    id = ex.arxiv || `pdf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    dispatch({ type: 'addPapers', papers: [{ id, arxiv: ex.arxiv || id, citations: 0, venue: ex.arxiv ? 'arXiv' : 'Uploaded PDF', starred: false, addedAt: Date.now(), ...ex.paper, ...(meta || {}), id, ...pdfFields }] })
  }
  await putPdf(id, { blob: new Blob([ex.buf], { type: 'application/pdf' }), name: file.name, text: ex.text, pages: ex.numPages })
  return { id, attached, enriched: !!ex.arxiv }
}
