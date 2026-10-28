import { useState } from 'react'
import { Download, Plus, Upload } from 'lucide-react'
import { Modal, toast } from './ui.jsx'
import { useStore } from '../lib/store.jsx'
import { searchArxiv, parseBibtex, inferTags } from '../lib/arxiv.js'
import { ingestPdf } from '../lib/ingest.js'
import { fetchZotero, parseCslJson, parseRis } from '../lib/zotero.js'
import { nav } from './ui.jsx'

export default function ImportModal({ onClose, initialTab = 'pdf' }) {
  const { state, dispatch } = useStore()
  const [tab, setTab] = useState(initialTab)
  const [jobs, setJobs] = useState([])
  const [drag, setDrag] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [bib, setBib] = useState('')
  const [manual, setManual] = useState({ title: '', authors: '', year: new Date().getFullYear(), abstract: '' })
  const [zot, setZot] = useState({ userId: state.settings.zoteroUser, key: state.settings.zoteroKey })
  const [zres, setZres] = useState('')
  const have = new Set(state.papers.map(p => p.id))

  async function go(e) {
    e.preventDefault(); setBusy(true); setErr('')
    try { setResults(await searchArxiv(q, 12)) } catch (x) { setErr(`${x.message}. Run the app with "npm run dev" so the arXiv proxy is available.`) } finally { setBusy(false) }
  }
  async function upload(files) {
    const list = [...files]
    const base = jobs.length
    setJobs(j => [...j, ...list.map(f => ({ name: f.name, status: 'queued', progress: 0 }))])
    const upd = (i, patch) => setJobs(j => j.map((x, k) => (k === base + i ? { ...x, ...patch } : x)))
    // Sequential: pdf.js is CPU-heavy and parallel parses make the page stutter.
    for (const [i, f] of list.entries()) {
      upd(i, { status: 'reading' })
      try {
        const r = await ingestPdf(f, { papers: state.papers, dispatch, onProgress: progress => upd(i, { progress }) })
        upd(i, { status: r.attached ? 'attached to existing paper' : r.enriched ? 'added · matched arXiv' : 'added', id: r.id, progress: 1 })
      } catch (e) { upd(i, { status: `failed: ${e.message}` }) }
    }
  }
  async function zotero() {
    setBusy(true); setErr(''); setZres('')
    dispatch({ type: 'settings', patch: { zoteroUser: zot.userId.trim(), zoteroKey: zot.key.trim() } })
    try {
      const { papers, collections } = await fetchZotero({ userId: zot.userId.trim(), key: zot.key.trim() })
      const fresh = papers.filter(p => !have.has(p.id))
      if (fresh.length) dispatch({ type: 'addPapers', papers: fresh })
      if (collections.length) dispatch({ type: 'upsertCollections', collections })
      setZres(`Imported ${fresh.length} new of ${papers.length} items${collections.length ? ` · ${collections.length} collections` : ''}`)
    } catch (x) { setErr(x.message) } finally { setBusy(false) }
  }
  async function zoteroFile(f) {
    const text = await f.text()
    try {
      const ps = /\.ris$/i.test(f.name) ? parseRis(text) : /\.bib$/i.test(f.name) ? parseBibtex(text + '\n') : parseCslJson(text)
      const fresh = ps.filter(p => !have.has(p.id))
      fresh.length ? add(fresh) : toast('No new items in that file')
      setZres(`Imported ${fresh.length} new of ${ps.length} items from ${f.name}`)
    } catch (x) { setErr(`Could not read ${f.name}: ${x.message}`) }
  }
  const add = ps => { dispatch({ type: 'addPapers', papers: ps }); toast(`Imported ${ps.length} paper${ps.length > 1 ? 's' : ''}`) }

  return (
    <Modal title="Import papers" onClose={onClose} wide>
      <div className="tabs">{[['pdf', 'Upload PDFs'], ['arxiv', 'arXiv search / ID'], ['zotero', 'Zotero'], ['bibtex', 'BibTeX'], ['manual', 'Manual']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'pdf' && <>
        <label className="empty" style={{ display: 'block', cursor: 'pointer', borderColor: drag ? 'var(--violet)' : null, background: drag ? 'var(--soft)' : null }}
          onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files) }}>
          <Upload size={26} /><div style={{ marginTop: 8, fontWeight: 600, color: 'var(--ink)' }}>Drop PDFs here or click to choose</div>
          <div className="small">Text is extracted in your browser. arXiv papers are auto-matched for metadata. Max 50 MB each.</div>
          <input type="file" accept="application/pdf,.pdf" multiple hidden onChange={e => { upload(e.target.files); e.target.value = '' }} />
        </label>
        <div className="stack" style={{ marginTop: 12 }}>{jobs.map((j, i) => (
          <div key={i} className="row small" style={{ borderBottom: '1.5px solid var(--soft)', paddingBottom: 6 }}>
            <span className="grow mono tiny">{j.name}</span>
            {j.status === 'reading' ? <span style={{ width: 90, height: 6, background: 'var(--soft)' }}><span style={{ display: 'block', height: 6, width: `${j.progress * 100}%`, background: 'var(--violet)' }} /></span>
              : <span className={j.status.startsWith('failed') ? '' : 'match'} style={j.status.startsWith('failed') ? { color: 'var(--red)' } : null}>{j.status}</span>}
            {j.id && <button className="btn sm" onClick={() => { onClose(); nav(`/paper/${encodeURIComponent(j.id)}`) }}>Open</button>}
          </div>))}
        </div>
      </>}
      {tab === 'arxiv' && <>
        <form className="row" onSubmit={go}>
          <input className="input" autoFocus placeholder="e.g. agent memory  ·  or an arXiv ID like 2310.08560" value={q} onChange={e => setQ(e.target.value)} />
          <button className="btn violet" disabled={busy || !q.trim()}>{busy ? <span className="spinner" /> : 'Search'}</button>
        </form>
        {err && <p className="small" style={{ color: 'var(--red)' }}>{err}</p>}
        {results.length > 0 && <div className="row between" style={{ margin: '12px 0 6px' }}><span className="muted small">{results.length} results</span><button className="btn sm lime" onClick={() => add(results.filter(r => !have.has(r.id)))}>Import all new</button></div>}
        <div className="stack">
          {results.map(p => (
            <div key={p.id} className="list-item" style={{ cursor: 'default' }}>
              <div className="grow"><div className="t">{p.title}</div><div className="muted tiny mono">{p.authors.join(', ')} · {p.year} · {p.arxiv}</div><div className="small muted" style={{ marginTop: 4 }}>{p.abstract.slice(0, 220)}…</div></div>
              {have.has(p.id) ? <span className="tag">IN LIBRARY</span> : <button className="btn sm" onClick={() => add([p])}><Download size={13} /> Add</button>}
            </div>
          ))}
        </div>
      </>}
      {tab === 'zotero' && <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>Connect your Zotero library: find your <b>user ID</b> and create a read-only <b>API key</b> at <a href="https://www.zotero.org/settings/keys" target="_blank" rel="noreferrer">zotero.org/settings/keys</a>. Collections come across too. The key stays in this browser.</p>
        <div className="row wrap">
          <input className="input" style={{ width: 160 }} placeholder="User ID (numbers)" value={zot.userId} onChange={e => setZot({ ...zot, userId: e.target.value })} />
          <input className="input mono grow" type="password" placeholder="API key" value={zot.key} onChange={e => setZot({ ...zot, key: e.target.value })} />
          <button className="btn violet" disabled={busy || !zot.userId.trim() || !zot.key.trim()} onClick={zotero}>{busy ? <span className="spinner" /> : 'Import library'}</button>
        </div>
        <label className="empty" style={{ display: 'block', cursor: 'pointer' }}>
          <Upload size={20} /><div style={{ fontWeight: 600, color: 'var(--ink)' }}>…or upload a Zotero export</div>
          <div className="small">File → Export Library as CSL JSON, RIS or BibTeX</div>
          <input type="file" accept=".json,.ris,.bib,application/json" hidden onChange={e => { e.target.files[0] && zoteroFile(e.target.files[0]); e.target.value = '' }} />
        </label>
        {err && <p className="small" style={{ color: 'var(--red)' }}>{err}</p>}
        {zres && <p className="match small">{zres}</p>}
      </div>}
      {tab === 'bibtex' && <>
        <textarea className="input mono small" style={{ minHeight: 220 }} placeholder="@article{key,&#10;  title = {...},&#10;  author = {A and B},&#10;  year = {2024},&#10;}" value={bib} onChange={e => setBib(e.target.value)} />
        <button className="btn violet" style={{ marginTop: 10 }} onClick={() => { const ps = parseBibtex(bib + '\n'); ps.length ? (add(ps), onClose()) : toast('No entries found') }}>Import BibTeX</button>
      </>}
      {tab === 'manual' && <div className="stack">
        <input className="input" placeholder="Title" value={manual.title} onChange={e => setManual({ ...manual, title: e.target.value })} />
        <div className="row"><input className="input" placeholder="Authors (comma separated)" value={manual.authors} onChange={e => setManual({ ...manual, authors: e.target.value })} /><input className="input" style={{ width: 110 }} type="number" value={manual.year} onChange={e => setManual({ ...manual, year: +e.target.value })} /></div>
        <textarea className="input" placeholder="Abstract" value={manual.abstract} onChange={e => setManual({ ...manual, abstract: e.target.value })} />
        <button className="btn violet" disabled={!manual.title} onClick={() => {
          const id = `local-${Date.now()}`
          add([{ id, arxiv: id, title: manual.title, authors: manual.authors.split(',').map(s => s.trim()).filter(Boolean), year: manual.year, citations: 0, tags: inferTags(manual.title + ' ' + manual.abstract), abstract: manual.abstract || manual.title, venue: 'Manual', starred: false, addedAt: Date.now() }])
          onClose()
        }}><Plus size={14} /> Add paper</button>
      </div>}
    </Modal>
  )
}
