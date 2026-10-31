// arXiv Atom API (proxied through Vite at /arxiv to avoid CORS).
// opts.field: 'all' (default) or 'au' for an author; opts.newest sorts by submission date, for alerts.
export async function searchArxiv(query, max = 10, opts = {}) {
  const isId = /^\d{4}\.\d{4,5}(v\d+)?$/.test(query.trim())
  const term = opts.phrase ? `"${query.replace(/"/g, '')}"` : query
  const qs = isId ? `id_list=${query.trim()}` : `search_query=${opts.field || 'all'}:${encodeURIComponent(term)}&sortBy=${opts.newest ? 'submittedDate&sortOrder=descending' : 'relevance'}`
  const res = await fetch(`/arxiv/query?${qs}&max_results=${max}`)
  if (!res.ok) throw new Error(`arXiv ${res.status}`)
  const xml = new DOMParser().parseFromString(await res.text(), 'application/xml')
  return [...xml.getElementsByTagName('entry')].map(e => {
    const get = t => e.getElementsByTagName(t)[0]?.textContent?.trim().replace(/\s+/g, ' ') || ''
    const arxiv = get('id').split('/abs/')[1]?.replace(/v\d+$/, '') || get('id')
    const authors = [...e.getElementsByTagName('author')].map(a => a.getElementsByTagName('name')[0].textContent)
    const cats = [...e.getElementsByTagName('category')].map(c => c.getAttribute('term'))
    return {
      id: arxiv, arxiv, title: get('title'), authors: authors.length > 2 ? [authors[0], 'et al.'] : authors,
      year: +get('published').slice(0, 4), citations: 0, tags: inferTags(get('title') + ' ' + get('summary'), cats),
      abstract: get('summary'), venue: 'arXiv', starred: false, addedAt: Date.now(), published: get('published'),
    }
  }).filter(p => p.title)
}

const TAG_RULES = [['Memory', /memor/i], ['LLM Agents', /agent/i], ['RAG', /retriev|rag\b/i], ['Tool Use', /tool|api/i], ['Planning', /plan/i], ['Reasoning', /reason|chain[- ]of[- ]thought/i], ['Long Context', /long[- ]context|context window/i], ['Compression', /compress/i], ['Multi-Agent', /multi[- ]agent/i], ['Graph', /graph/i], ['Evaluation', /benchmark|evaluat/i], ['Survey', /survey/i]]
export function inferTags(text, cats = []) {
  const tags = TAG_RULES.filter(([, re]) => re.test(text)).map(([t]) => t)
  return tags.length ? tags.slice(0, 4) : [cats[0] || 'General']
}

// Minimal BibTeX importer: one paper per @entry.
export function parseBibtex(src) {
  return [...src.matchAll(/@\w+\s*\{\s*([^,]+),([\s\S]*?)\n\}/g)].map(([, key, body]) => {
    const f = name => body.match(new RegExp(`${name}\\s*=\\s*[{"]([\\s\\S]*?)[}"]\\s*,?\\s*\\n`, 'i'))?.[1].replace(/[{}]/g, '').replace(/\s+/g, ' ').trim() || ''
    const authors = f('author').split(/\s+and\s+/).filter(Boolean)
    const arxiv = f('eprint') || key.trim()
    return { id: arxiv, arxiv, title: f('title'), authors: authors.length > 2 ? [authors[0], 'et al.'] : authors, year: +f('year') || new Date().getFullYear(), citations: 0, tags: inferTags(f('title') + ' ' + f('abstract')), abstract: f('abstract') || f('title'), venue: f('journal') || f('booktitle') || 'BibTeX', starred: false, addedAt: Date.now() }
  }).filter(p => p.title)
}
