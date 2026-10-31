import { useEffect, useState } from 'react'
import { BookmarkPlus, Check, ExternalLink } from 'lucide-react'
import { useStore } from '../lib/store.jsx'
import { lookupPaper, paperUrl, sourceName } from '../lib/sources.js'
import { inferTags } from '../lib/arxiv.js'
import { nav } from '../components/ui.jsx'

// Opened by the "Save to library" bookmarklet: #/save?u=<page url>&t=<page title>&d=<citation_doi>.
export const bookmarklet = origin => `javascript:(()=>{const m=n=>document.querySelector('meta[name="'+n+'"]')?.content||'';window.open('${origin}/#/save?u='+encodeURIComponent(location.href)+'&t='+encodeURIComponent(m('citation_title')||document.title)+'&d='+encodeURIComponent(m('citation_doi')||m('dc.identifier')),'ai-research-os-save','width=560,height=720')})()`

const params = () => new URLSearchParams(location.hash.split('?')[1] || '')

export default function Save() {
  const { state, dispatch } = useStore()
  const [q] = useState(() => { const p = params(); return { url: p.get('u') || '', title: p.get('t') || '', doi: p.get('d') || '' } })
  const [paper, setPaper] = useState(null)
  const [busy, setBusy] = useState(true)
  const [col, setCol] = useState('')
  const [saved, setSaved] = useState(false)
  useEffect(() => { lookupPaper(q).then(setPaper, () => setPaper(null)).finally(() => setBusy(false)) }, [])

  // Not a recognisable paper: keep it as a link with the page title.
  const fallback = { id: `web:${q.url.replace(/^https?:\/\//, '').slice(0, 120)}`, arxiv: '', url: q.url, title: q.title || q.url, authors: [], year: new Date().getFullYear(), citations: 0, tags: inferTags(q.title), abstract: '(Saved from the web.)', venue: (() => { try { return new URL(q.url).hostname } catch { return 'Web' } })(), starred: false, addedAt: Date.now() }
  const p = paper || fallback
  const have = state.papers.find(x => x.id === p.id || (x.doi && x.doi === p.doi))

  function save() {
    const item = { ...p, status: 'toread', addedAt: Date.now() }
    dispatch({ type: 'addPapers', papers: [item] })
    if (col) dispatch({ type: 'upsertCollections', collections: [{ name: col, paperIds: [item.id] }] })
    try { const ch = new BroadcastChannel('ai-research-os'); ch.postMessage({ type: 'addPapers', papers: [item] }); ch.close() } catch {}
    setSaved(true)
    if (window.opener) setTimeout(() => window.close(), 1400)
  }

  if (!q.url) return <div className="card" style={{ maxWidth: 560, margin: '40px auto' }}><h3>Nothing to save</h3><p className="small">Open a paper's page and click the <b>Save to AI Research OS</b> bookmark. Get it from Paper Library → Import → Save from any site.</p><button className="btn" onClick={() => nav('/library')}>Open Paper Library</button></div>
  return (
    <div style={{ maxWidth: 560, margin: '24px auto', padding: '0 16px' }}>
      <div className="card stack">
        <h3 style={{ margin: 0 }}><BookmarkPlus size={16} /> Save to your library</h3>
        {busy ? <div className="row small"><span className="spinner" /> Looking up this paper…</div> : <>
          <div>
            <div className="t" style={{ fontWeight: 700, fontSize: 16 }}>{p.title}</div>
            <div className="muted tiny mono">{[p.authors.join(', '), p.year, p.venue].filter(Boolean).join(' · ')}{paperUrl(p) && <> · <a href={paperUrl(p)} target="_blank" rel="noreferrer">{sourceName(p)} <ExternalLink size={10} /></a></>}</div>
            {!paper && <div className="tiny muted" style={{ marginTop: 4 }}>Couldn't match this page to a paper, so it will be saved as a link. You can edit it later.</div>}
            <p className="small" style={{ marginBottom: 0 }}>{p.abstract.slice(0, 420)}{p.abstract.length > 420 ? '…' : ''}</p>
          </div>
          {have || saved ? <div className="row"><span className="tag lime"><Check size={12} /> {saved ? 'Saved to your To-read list' : 'Already in your library'}</span><button className="btn sm" onClick={() => window.opener ? window.close() : nav(`/paper/${encodeURIComponent((have || p).id)}`)}>{window.opener ? 'Close' : 'Open it'}</button></div> : <>
            <label className="small">Add to collection <span className="muted">(optional)</span>
              <input className="input" list="save-cols" placeholder="None" value={col} onChange={e => setCol(e.target.value)} />
              <datalist id="save-cols">{state.collections.map(c => <option key={c.id} value={c.name} />)}</datalist>
            </label>
            <button className="btn violet" autoFocus onClick={save}><BookmarkPlus size={14} /> Save to library</button>
          </>}
        </>}
      </div>
    </div>
  )
}
