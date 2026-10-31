// Paper sources beyond arXiv. OpenAlex covers ~250M works across every field (it indexes PubMed,
// journals and preprints); PubMed is the biomedical index. Both allow browser calls (CORS) without a key.
import { searchArxiv, inferTags } from './arxiv.js'

export const SOURCES = {
  mix: 'arXiv + OpenAlex (all fields)',
  arxiv: 'arXiv only (CS, physics, maths)',
  openalex: 'OpenAlex only (all fields)',
  pubmed: 'PubMed (biomedicine)',
}
const ARXIV_ID = /^\d{4}\.\d{4,5}$/
export const isArxivId = id => ARXIV_ID.test(id || '')
// Where to read a paper online, whatever its source.
// Only http(s) links are ever rendered, so a paper can't smuggle in a javascript: or data: URL.
export const safeHttp = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : '' } catch { return '' } }
export const paperUrl = p => isArxivId(p.arxiv) ? `https://arxiv.org/abs/${p.arxiv}` : safeHttp(p.url) || (p.doi ? `https://doi.org/${encodeURI(p.doi)}` : '')
export const sourceName = p => isArxivId(p.arxiv) ? 'arXiv' : p.pmid && !p.doi ? 'PubMed' : p.doi ? 'DOI' : 'Link'

const short = authors => authors.length > 2 ? [authors[0], 'et al.'] : authors
const abstractFrom = inv => {
  if (!inv) return ''
  const words = []
  for (const [w, at] of Object.entries(inv)) for (const i of at) words[i] = w
  return words.filter(Boolean).join(' ')
}

export async function searchOpenAlex(query, max = 10, opts = {}) {
  const qs = new URLSearchParams({ 'per-page': String(max), select: 'id,doi,display_name,publication_year,publication_date,authorships,abstract_inverted_index,primary_location,cited_by_count,ids,locations' })
  const filters = ['type:article|preprint|review']
  if (opts.field === 'au') filters.push(`raw_author_name.search:${query.replace(/[,|:]/g, ' ')}`)
  else qs.set('search', query)
  if (opts.newest) { qs.set('sort', 'publication_date:desc'); filters.push(`from_publication_date:${new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10)}`) }
  qs.set('filter', filters.join(','))
  const res = await fetch(`https://api.openalex.org/works?${qs}`)
  if (!res.ok) throw new Error(`OpenAlex ${res.status}`)
  return (await res.json()).results.map(fromOpenAlex).filter(p => p.title)
}

function fromOpenAlex(w) {
  const doi = (w.doi || '').replace(/^https?:\/\/doi\.org\//, '').toLowerCase()
  // arXiv copies keep the arXiv id, so they merge with the same paper found on arXiv.
  const arxiv = (w.locations || []).map(l => l.landing_page_url || '').join(' ').match(/arxiv\.org\/abs\/(\d{4}\.\d{4,5})/)?.[1] || doi.match(/arxiv\.(\d{4}\.\d{4,5})/)?.[1] || ''
  const pmid = (w.ids?.pmid || '').match(/(\d+)\/?$/)?.[1] || ''
  const abstract = abstractFrom(w.abstract_inverted_index)
  const venue = w.primary_location?.source?.display_name || 'OpenAlex'
  return {
    id: arxiv || doi || `openalex:${w.id.split('/').pop()}`, arxiv, doi, pmid, url: w.primary_location?.landing_page_url || w.id,
    title: w.display_name || '', authors: short((w.authorships || []).map(a => a.author?.display_name).filter(Boolean)),
    year: w.publication_year || 0, citations: w.cited_by_count || 0, tags: inferTags(`${w.display_name} ${abstract}`, [venue]),
    abstract: abstract || '(No abstract available from OpenAlex.)', venue, starred: false, addedAt: Date.now(), published: w.publication_date,
  }
}

const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'
export async function searchPubMed(query, max = 10, opts = {}) {
  const term = opts.field === 'au' ? `${query}[Author]` : query
  const s = await fetch(`${EUTILS}/esearch.fcgi?db=pubmed&retmode=json&retmax=${max}&sort=${opts.newest ? 'pub_date' : 'relevance'}&term=${encodeURIComponent(term)}`)
  if (!s.ok) throw new Error(`PubMed ${s.status}`)
  return fetchPubMed((await s.json()).esearchresult?.idlist || [])
}

async function fetchPubMed(ids) {
  if (!ids.length) return []
  const r = await fetch(`${EUTILS}/efetch.fcgi?db=pubmed&retmode=xml&id=${ids.join(',')}`)
  if (!r.ok) throw new Error(`PubMed ${r.status}`)
  const xml = new DOMParser().parseFromString(await r.text(), 'application/xml')
  return [...xml.getElementsByTagName('PubmedArticle')].map(a => {
    const get = t => a.getElementsByTagName(t)[0]?.textContent?.trim().replace(/\s+/g, ' ') || ''
    const pmid = get('PMID')
    const doi = [...a.getElementsByTagName('ArticleId')].find(x => x.getAttribute('IdType') === 'doi')?.textContent.toLowerCase() || ''
    const authors = [...a.getElementsByTagName('Author')].map(x => [x.getElementsByTagName('ForeName')[0]?.textContent, x.getElementsByTagName('LastName')[0]?.textContent].filter(Boolean).join(' ')).filter(Boolean)
    const abstract = [...a.getElementsByTagName('AbstractText')].map(x => x.textContent.trim()).join(' ')
    const y = +(get('PubDate').match(/\d{4}/)?.[0] || 0)
    const venue = get('Title') || 'PubMed'
    return {
      id: doi || `pmid:${pmid}`, arxiv: '', doi, pmid, url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      title: get('ArticleTitle').replace(/\.$/, ''), authors: short(authors), year: y, citations: 0, tags: inferTags(`${get('ArticleTitle')} ${abstract}`, [venue]),
      abstract: abstract || '(No abstract on PubMed.)', venue, starred: false, addedAt: Date.now(), published: y ? `${y}-01-01` : '',
    }
  }).filter(p => p.title)
}

// One search across the chosen source(s); "mix" interleaves arXiv and OpenAlex and drops duplicates.
export async function searchPapers(query, max = 10, opts = {}) {
  const source = opts.source || 'mix'
  if (source === 'arxiv' || (isArxivId(query.trim()) && source !== 'pubmed')) return searchArxiv(query, max, opts)
  if (source === 'openalex') return searchOpenAlex(query, max, opts)
  if (source === 'pubmed') return searchPubMed(query, max, opts)
  const half = Math.ceil(max / 2)
  const [a, o] = await Promise.allSettled([searchArxiv(query, half, opts), searchOpenAlex(query, max, opts)])
  if (a.status === 'rejected' && o.status === 'rejected') throw a.reason
  const out = [], seen = new Set()
  const A = a.value || [], O = o.value || []
  for (let i = 0; out.length < max && (i < A.length || i < O.length); i++) for (const p of [A[i], O[i]]) {
    const key = p && (p.id + '|' + p.title.toLowerCase().replace(/\W+/g, ''))
    if (!p || seen.has(p.id) || seen.has(key.split('|')[1]) || out.length >= max) continue
    seen.add(p.id); seen.add(key.split('|')[1]); out.push(p)
  }
  return out
}

// "Save to library" from any page: work out the paper from its URL, DOI or title.
export async function lookupPaper({ url = '', doi = '', title = '' }) {
  const ax = url.match(/arxiv\.org\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5})/)?.[1]
  if (ax) return (await searchArxiv(ax, 1))[0] || null
  const pm = url.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/)?.[1]
  if (pm) return (await fetchPubMed([pm]))[0] || null
  const d = (doi || decodeURIComponent(url).match(/\b(10\.\d{4,9}\/[^\s?#&"<>]+)/)?.[1] || '').replace(/[.,;)]+$/, '').replace(/\/(full|abstract|pdf|epdf)$/i, '')
  if (d) {
    const r = await fetch(`https://api.openalex.org/works/doi:${encodeURIComponent(d)}`)
    if (r.ok) return fromOpenAlex(await r.json())
  }
  const t = title.replace(/\s*[|\-–—]\s*[^|\-–—]{2,40}$/, '').trim() // drop " | Site name" suffixes
  if (t.length > 12) return (await searchOpenAlex(t, 1))[0] || null
  return null
}
