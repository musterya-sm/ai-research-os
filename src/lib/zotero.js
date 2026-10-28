// Zotero import: the Zotero Web API (user ID + key from zotero.org/settings/keys), or exported files
// (CSL JSON / RIS). BibTeX exports go through the existing BibTeX importer.
import { inferTags } from './arxiv.js'

const arxivOf = (...fields) => {
  for (const f of fields) {
    const m = String(f || '').match(/(?:arxiv\.org\/(?:abs|pdf)\/|arXiv[:.]\s?)(\d{4}\.\d{4,5})/i)
    if (m) return m[1]
  }
  return ''
}

function paper({ key, title, authors, year, abstract, venue, url, doi, extra }) {
  const arxiv = arxivOf(url, doi, extra)
  const id = arxiv || `zotero-${key}`
  return {
    id, arxiv: arxiv || id, title, authors: authors.length > 2 ? [authors[0], 'et al.'] : authors, year: year || 0, citations: 0,
    tags: inferTags(`${title} ${abstract}`), abstract: abstract || title, venue: venue || 'Zotero', doi, url, starred: false, addedAt: Date.now(), status: 'toread',
  }
}

// Returns { papers, collections: [{ name, paperIds }] }.
export async function fetchZotero({ userId, key }) {
  const base = `https://api.zotero.org/users/${encodeURIComponent(userId)}`
  const headers = { 'Zotero-API-Key': key, 'Zotero-API-Version': '3' }
  const getAll = async path => {
    const out = []
    for (let start = 0; start < 2000; start += 100) {
      const res = await fetch(`${base}${path}${path.includes('?') ? '&' : '?'}format=json&limit=100&start=${start}`, { headers })
      if (res.status === 403) throw new Error('Zotero rejected the key — check the user ID and that the key can read your library')
      if (!res.ok) throw new Error(`Zotero ${res.status}`)
      const page = await res.json()
      out.push(...page)
      if (page.length < 100) break
    }
    return out
  }
  const [items, colls] = await Promise.all([getAll('/items/top'), getAll('/collections')])
  const papers = [], byKey = {}
  for (const { data: d } of items) {
    if (!d.title) continue
    const p = paper({
      key: d.key, title: d.title, abstract: d.abstractNote, url: d.url, doi: d.DOI, extra: d.extra,
      authors: (d.creators || []).filter(c => c.creatorType === 'author' || !c.creatorType).map(c => c.name || `${c.firstName || ''} ${c.lastName || ''}`.trim()),
      year: +(String(d.date || '').match(/\d{4}/)?.[0] || 0), venue: d.publicationTitle || d.proceedingsTitle || d.conferenceName,
    })
    papers.push(p)
    for (const c of d.collections || []) (byKey[c] ||= []).push(p.id)
  }
  const collections = colls.map(c => ({ name: c.data.name, paperIds: byKey[c.key] || [] })).filter(c => c.paperIds.length)
  return { papers, collections }
}

export function parseCslJson(text) {
  const items = JSON.parse(text)
  return (Array.isArray(items) ? items : items.items || []).filter(i => i.title).map((i, n) => paper({
    key: i.id || n, title: i.title, abstract: i.abstract, url: i.URL, doi: i.DOI, extra: i.note,
    authors: (i.author || []).map(a => a.literal || `${a.given || ''} ${a.family || ''}`.trim()),
    year: i.issued?.['date-parts']?.[0]?.[0], venue: i['container-title'],
  }))
}

export function parseRis(text) {
  return text.split(/\nER\s+-/).map((rec, n) => {
    const f = tag => [...rec.matchAll(new RegExp(`^${tag}\\s+-\\s+(.*)$`, 'gm'))].map(m => m[1].trim())
    const title = f('TI')[0] || f('T1')[0]
    return title && paper({
      key: f('ID')[0] || n, title, abstract: f('AB')[0] || f('N2')[0], url: f('UR')[0], doi: f('DO')[0], extra: f('N1').join(' '),
      authors: [...f('AU'), ...f('A1')], year: +(f('PY')[0] || f('Y1')[0] || '').slice(0, 4), venue: f('JO')[0] || f('T2')[0],
    })
  }).filter(Boolean)
}
