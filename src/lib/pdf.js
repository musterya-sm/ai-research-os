import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { inferTags } from './arxiv.js'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export const openPdf = data => pdfjs.getDocument({ data: data instanceof Uint8Array ? data : new Uint8Array(data) }).promise

// Extracts full text plus a best-effort guess at title, authors, abstract and arXiv ID.
export async function extractPdf(file, onProgress) {
  const buf = new Uint8Array(await file.arrayBuffer())
  const doc = await openPdf(buf.slice())
  const meta = await doc.getMetadata().catch(() => ({}))
  const pages = []
  let firstItems = []
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent()
    if (i === 1) firstItems = content.items.filter(it => it.str?.trim())
    pages.push(content.items.map(it => it.str + (it.hasEOL ? '\n' : ' ')).join('').replace(/[ \t]+/g, ' '))
    onProgress?.(i / doc.numPages)
  }
  const text = pages.join('\n\n')
  const arxiv = text.slice(0, 6000).match(/arXiv:\s*(\d{4}\.\d{4,5})/i)?.[1] || file.name.match(/(\d{4}\.\d{4,5})/)?.[1] || null

  // Title: the largest upright text on page 1 (rotated arXiv side-stamps have transform[3] = 0);
  // embedded metadata is often junk (hostnames, file names), so it is only a fallback.
  const size = it => Math.abs(it.transform?.[3] || 0)
  const max = Math.max(...firstItems.map(size), 0)
  const big = firstItems.filter(it => size(it) >= max * 0.9)
  let title = big.map(it => it.str).join(' ').replace(/\s+/g, ' ').trim().slice(0, 240)
  const metaTitle = meta.info?.Title?.trim()
  if ((!title || title.length < 8) && metaTitle && !/^(untitled|microsoft word)|\.(pdf|docx?|tex)$|^[\w.-]+:\d+$/i.test(metaTitle)) title = metaTitle
  // Authors: the first line(s) after the title, if they look like a name list.
  const after = firstItems.slice(firstItems.indexOf(big.at(-1)) + 1, firstItems.indexOf(big.at(-1)) + 6).map(it => it.str).join(' ')
  const nameLine = after.split(/abstract/i)[0].replace(/[\d*†‡§∗]+/g, ' ').replace(/\s+/g, ' ').trim()
  const guessed = /^([A-Z][\w.'-]+(?: [A-Z][\w.'-]+)+)(?:\s*(?:,|and|&)\s*[A-Z][\w.'-]+(?: [A-Z][\w.'-]+)+)*$/.test(nameLine) ? nameLine.split(/\s*(?:,|\band\b|&)\s*/).filter(Boolean) : null
  if (!title) title = file.name.replace(/\.pdf$/i, '')

  const abstract = (text.match(/abstract[\s.:—-]*([\s\S]{80,2200}?)(?:\n\s*(?:1\.?\s+)?introduction|\n\s*keywords|\n\s*1\s+[A-Z])/i)?.[1] || pages[0].slice(0, 1200))
    .replace(/\s+/g, ' ').trim()
  const metaAuthors = meta.info?.Author?.trim() ? meta.info.Author.split(/,|;| and /).map(x => x.trim()).filter(Boolean) : null
  const names = guessed || metaAuthors || ['Unknown']
  return {
    buf, text, numPages: doc.numPages, arxiv,
    paper: {
      title, abstract, authors: names.length > 2 ? [names[0], 'et al.'] : names,
      year: +(meta.info?.CreationDate?.match(/D:(\d{4})/)?.[1]) || new Date().getFullYear(), tags: inferTags(title + ' ' + abstract),
    },
  }
}

// First ~20k chars are kept on the paper so search/clusters/copilot can use body text synchronously.
export const BODY_CHARS = 20000
