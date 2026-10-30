import { useEffect, useState } from 'react'
import { Share2, Copy, ExternalLink, Check, Square } from 'lucide-react'
import { Prose, toast, nav } from '../components/ui.jsx'
import { useStore } from '../lib/store.jsx'
import { decodeShare } from '../lib/share.js'
import { rid } from '../lib/reproduce.js'

const KIND = { draft: 'Writing draft', collection: 'Paper collection', project: 'Reproduce Lab project', hypotheses: 'Hypotheses' }
const fullPaper = p => ({ method: '', dataset: '', limitation: '', citations: 0, starred: false, addedAt: Date.now(), ...p, venue: p.venue || 'Shared' })

function Paper({ p }) {
  return (
    <div style={{ borderTop: '1.5px solid var(--soft)', padding: '10px 0' }}>
      <b>{p.title}</b>
      <div className="small muted">{p.authors.join(', ')}{p.year ? ` · ${p.year}` : ''}{p.venue ? ` · ${p.venue}` : ''}
        {/^\d{4}\.\d{4,5}(v\d+)?$/.test(p.arxiv) && <> · <a href={`https://arxiv.org/abs/${encodeURIComponent(p.arxiv)}`} target="_blank" rel="noreferrer">arXiv:{p.arxiv}</a></>}</div>
      {(p.finding || p.abstract) && <div className="small" style={{ marginTop: 4 }}>{p.finding || `${p.abstract.slice(0, 280)}…`}</div>}
    </div>
  )
}

// Read-only page for a #/s/<data> link. Rendered without the app shell: the viewer may be new to the app.
export default function Shared({ data }) {
  const { dispatch } = useStore()
  const [doc, setDoc] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => { setDoc(null); setErr(''); decodeShare(data || '').then(setDoc, () => setErr('This share link is broken or incomplete. Ask for it to be sent again.')) }, [data])

  function saveCopy() {
    // Don't let the first-visit tour hijack the jump to the copied item; it stays one click away on the rail.
    dispatch({ type: 'settings', patch: { tourDone: true } })
    if (doc.papers?.length) dispatch({ type: 'addPapers', papers: doc.papers.map(fullPaper) })
    if (doc.kind === 'collection') dispatch({ type: 'upsertCollections', collections: [{ name: doc.title || 'Shared collection', paperIds: doc.papers.map(p => p.id) }] })
    if (doc.kind === 'draft') dispatch({ type: 'saveDraft', draft: { title: doc.title, body: doc.body, ids: doc.papers.map(p => p.id), section: 'related', style: 'numeric' } })
    if (doc.kind === 'hypotheses') doc.items.forEach(h => dispatch({ type: 'saveHypothesis', h: { ...h, concepts: [] } }))
    if (doc.kind === 'project') {
      const id = rid()
      dispatch({ type: 'saveProject', project: { id, title: doc.title, source: { type: 'idea', idea: doc.spec.summary || doc.title }, mode: 'guide', spec: doc.spec, steps: doc.steps.map(s => ({ id: rid(), hint: '', check: '', ...s })), chat: [] } })
      toast('Copied to your Reproduce Lab'); return nav(`/lab/${id}`)
    }
    toast('Saved to your workspace')
    nav({ draft: '/write', collection: '/library', hypotheses: '/hypotheses' }[doc.kind])
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '32px 16px 64px' }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 16 }}>
        <span className="row"><span className="logo" style={{ position: 'static' }}>RO</span><span className="label">AI Research OS · shared, read-only</span></span>
        <span className="row">
          {doc && <button className="btn sm violet" onClick={saveCopy}><Copy size={13} /> Save a copy to my workspace</button>}
          <button className="btn sm" onClick={() => nav('/')}><ExternalLink size={13} /> Open the app</button>
        </span>
      </div>
      {err && <div className="card"><h3>Can't open this link</h3><p className="muted">{err}</p></div>}
      {!doc && !err && <div className="row"><span className="spinner" /> Opening…</div>}
      {doc && (
        <div className="card">
          <div className="label muted"><Share2 size={12} /> {KIND[doc.kind]}{doc.by ? ` · shared by ${doc.by}` : ''}{doc.at ? ` · ${new Date(doc.at).toLocaleDateString()}` : ''}</div>
          <h1 style={{ margin: '8px 0 16px', fontSize: 28 }}>{doc.title}</h1>

          {doc.kind === 'draft' && <>
            <Prose text={doc.body} />
            {doc.papers.length > 0 && <><h3 style={{ marginTop: 24 }}>References</h3>{doc.papers.map(p => <Paper key={p.id} p={p} />)}</>}
          </>}

          {doc.kind === 'collection' && <>{doc.papers.length ? doc.papers.map(p => <Paper key={p.id} p={p} />) : <p className="muted">This collection is empty.</p>}</>}

          {doc.kind === 'hypotheses' && doc.items.map((h, i) => (
            <div key={i} style={{ borderTop: '1.5px solid var(--soft)', padding: '10px 0' }}>
              <b>{i + 1}. {h.text}</b>{h.focus && <span className="tag" style={{ marginLeft: 8 }}>{h.focus}</span>}
              {h.rationale && <div className="small muted" style={{ marginTop: 4 }}>{h.rationale}</div>}
            </div>))}

          {doc.kind === 'project' && <>
            <p className="muted small">{doc.source}</p>
            {doc.spec.summary && <p>{doc.spec.summary}</p>}
            <div className="g2" style={{ margin: '12px 0' }}>
              {[['Datasets', doc.spec.datasets], ['Models', doc.spec.models], ['Components', doc.spec.components]].filter(([, v]) => v.length).map(([k, v]) =>
                <div key={k}><div className="label">{k}</div>{v.map(x => <span key={x} className="tag">{x}</span>)}</div>)}
              {doc.spec.compute && <div><div className="label">Compute</div><span className="small">{doc.spec.compute}</span></div>}
            </div>
            {doc.spec.hparams.length > 0 && <><div className="label">Settings</div><table className="small" style={{ width: '100%', marginBottom: 12 }}><tbody>{doc.spec.hparams.map((h, i) => <tr key={i}><td>{h.name}</td><td className="mono">{h.value}</td></tr>)}</tbody></table></>}
            {doc.spec.metrics.some(m => m.paper || m.mine) && <><div className="label">Results</div><table className="small" style={{ width: '100%', marginBottom: 12 }}><thead><tr><th align="left">Metric</th><th align="left">Paper</th><th align="left">Reproduced</th></tr></thead><tbody>{doc.spec.metrics.map((m, i) => <tr key={i}><td>{m.name}</td><td className="mono">{m.paper || '—'}</td><td className="mono">{m.mine || '—'}</td></tr>)}</tbody></table></>}
            <div className="label">Plan · {doc.steps.filter(s => s.done).length}/{doc.steps.length} done</div>
            {doc.steps.map((s, i) => (
              <div key={i} className="row" style={{ alignItems: 'flex-start', borderTop: '1.5px solid var(--soft)', padding: '8px 0' }}>
                {s.done ? <Check size={16} /> : <Square size={16} />}
                <div className="grow"><b>{s.title}</b><div className="small muted">{s.detail}</div>{s.note && <div className="small" style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>📝 {s.note}</div>}</div>
              </div>))}
            {doc.spec.code.length > 0 && <p className="small">Code: {doc.spec.code.filter(u => /^https:\/\/(www\.)?github\.com\/[\w.-]+\/[\w.-]+\/?$/i.test(u)).map(u => <a key={u} href={u} target="_blank" rel="noreferrer" style={{ marginRight: 8 }}>{u.replace('https://github.com/', '')}</a>)}</p>}
          </>}
        </div>
      )}
    </div>
  )
}
