import { useEffect, useState } from 'react'
import { Star, ExternalLink, Trash2, Sparkles, FolderPlus } from 'lucide-react'
import { Head, Modal, Tags, Prose, AiBadge, nav, authorLine, toast, useAI } from '../components/ui.jsx'
import { useStore } from '../lib/store.jsx'
import { summarize, keyPoints, similar } from '../lib/nlp.js'
import { paperContext } from '../lib/ai.js'

export default function PaperView({ arg }) {
  const { state, dispatch, index } = useStore()
  const p = state.papers.find(x => x.id === decodeURIComponent(arg || ''))
  const [tab, setTab] = useState('overview')
  const [ai, setAi] = useState({})
  const [collOpen, setCollOpen] = useState(false)
  const [tagText, setTagText] = useState('')
  const { run, busy, error } = useAI()
  useEffect(() => { p && dispatch({ type: 'viewPaper', id: p.id }) }, [p?.id])
  if (!p) return <><Head n={4} title="Paper View" sub="Deep dive into any paper" /><div className="empty">Paper not found. <button className="btn sm" onClick={() => nav('/library')}>Open library</button></div></>

  const tldr = summarize(p.abstract, 2)
  const points = keyPoints(p)
  const steps = ['LLM', ...(p.method || 'Method').split(/\s*\+\s*|\s+and\s+/i).slice(0, 2), p.finding ? 'Outcome' : null].filter(Boolean)
  const sims = similar(index, p.id, 6)
  const inColls = state.collections.filter(c => c.paperIds.includes(p.id))

  async function deepSummary() {
    const out = await run({
      prompt: `Write a structured deep summary of this paper with sections: TL;DR, Problem, Method, Results, Limitations, Open questions.\n\n${paperContext([p])}`,
      fallback: () => [`## TL;DR`, tldr, `## Problem & Method`, `- ${p.method || 'See abstract'}`, `## Results`, `- ${p.finding || 'See abstract'}`, `## Limitations`, `- ${p.limitation || 'Not stated'}`, `## Open questions`, ...sims.slice(0, 2).map(s => `- How does this compare with **${s.paper.title.split(':')[0]}** (${s.paper.year})?`)].join('\n'),
    })
    setAi(a => ({ ...a, summary: out }))
  }

  return (
    <>
      <Head n={4} title="Paper View" sub="Deep dive into any paper">
        <button className="btn" onClick={() => nav('/library')}>← Library</button>
      </Head>
      <div className="card">
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22 }}>{p.title}</h2>
            <div className="muted mono small" style={{ marginTop: 6 }}>{authorLine(p)} · {p.citations ? `~${p.citations} citations` : 'citations n/a'}</div>
            <div style={{ marginTop: 8 }}><Tags tags={p.tags} /></div>
          </div>
          <div className="row">
            <button className={`star ${p.starred ? 'on' : ''}`} onClick={() => dispatch({ type: 'toggleStar', id: p.id })}><Star size={20} fill={p.starred ? 'currentColor' : 'none'} /></button>
            <button className="star" title="Delete from library" onClick={() => confirm('Remove this paper from your library?') && (dispatch({ type: 'deletePaper', id: p.id }), nav('/library'))}><Trash2 size={18} /></button>
          </div>
        </div>
        <div className="tabs" style={{ marginTop: 14 }}>{['overview', 'summary', 'keypoints', 'figures', `citations`].map(t => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t === 'citations' ? `Citations (${p.citations || 0})` : t}</button>)}</div>

        {tab === 'overview' && <div className="grid g2">
          <div className="stack">
            <div className="card flat"><h3>TL;DR</h3><p style={{ margin: 0, lineHeight: 1.6 }}>{tldr}</p></div>
            <div className="card flat"><h3>Key contributions</h3><ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>{points.map(x => <li key={x}>{x}</li>)}</ul></div>
            <div className="card flat"><h3>My notes</h3><textarea className="input" placeholder="Write notes — saved automatically" value={state.notes[p.id] || ''} onChange={e => dispatch({ type: 'setNote', id: p.id, text: e.target.value })} /></div>
          </div>
          <div className="stack">
            <div className="card flat"><h3>Methodology</h3><MethodDiagram steps={steps} /></div>
            <div className="card flat small">
              <h3>Paper info</h3>
              <div>Venue: {p.venue}</div><div>Year: {p.year}</div><div>Citations: {p.citations || '—'}</div>
              <div>PDF: <a href={`https://arxiv.org/abs/${p.arxiv}`} target="_blank" rel="noreferrer">[View]</a> <a href={`https://arxiv.org/pdf/${p.arxiv}`} target="_blank" rel="noreferrer">[Download]</a></div>
              <div style={{ marginTop: 8 }}>In: {inColls.length ? inColls.map(c => <span key={c.id} className="tag lime">{c.name}</span>) : <span className="muted">no collections</span>}</div>
              <form className="row" style={{ marginTop: 8 }} onSubmit={e => { e.preventDefault(); if (tagText.trim()) { dispatch({ type: 'updatePaper', id: p.id, patch: { tags: [...new Set([...p.tags, tagText.trim()])] } }); setTagText('') } }}>
                <input className="input" placeholder="Add tag" value={tagText} onChange={e => setTagText(e.target.value)} /><button className="btn sm">Add</button>
              </form>
              <button className="btn violet block" style={{ marginTop: 12 }} onClick={() => setCollOpen(true)}><FolderPlus size={14} /> Add to collection</button>
            </div>
          </div>
        </div>}

        {tab === 'summary' && <div className="stack">
          <div className="row between"><AiBadge /><button className="btn violet" disabled={busy} onClick={deepSummary}>{busy ? <span className="spinner" /> : <Sparkles size={14} />} Generate deep summary</button></div>
          {error && <p className="small" style={{ color: 'var(--red)' }}>{error}</p>}
          <div className="card flat"><h3>Abstract</h3><p style={{ lineHeight: 1.6, margin: 0 }}>{p.abstract}</p></div>
          {ai.summary && <div className="card flat"><Prose text={ai.summary} /></div>}
        </div>}

        {tab === 'keypoints' && <table className="data"><tbody>{[['Method', p.method], ['Dataset', p.dataset], ['Key finding', p.finding], ['Limitation', p.limitation], ['Concepts', p.tags.join(', ')]].map(([k, v]) => <tr key={k}><td className="mono tiny" style={{ width: 140 }}>{k.toUpperCase()}</td><td>{v || '—'}</td></tr>)}</tbody></table>}

        {tab === 'figures' && <div className="stack"><p className="muted small">Figures are not extracted from PDFs locally; this diagram is generated from the paper's method fields. Open the PDF for original figures.</p><MethodDiagram steps={steps} big /></div>}

        {tab === 'citations' && <div className="stack">
          <p className="muted small">Most related papers in your library (by content similarity). <a href={`https://www.semanticscholar.org/arxiv/${p.arxiv}`} target="_blank" rel="noreferrer">See full citation graph on Semantic Scholar <ExternalLink size={11} /></a></p>
          {sims.map(s => <div key={s.paper.id} className="list-item" onClick={() => nav(`/paper/${s.paper.id}`)}><div className="grow"><div className="t small">{s.paper.title}</div><div className="mono tiny muted">{s.paper.year} · {s.paper.authors[0]}</div></div><span className="match">{Math.round(s.score * 100)}% sim</span></div>)}
        </div>}
      </div>

      {collOpen && <Modal title="Add to collection" onClose={() => setCollOpen(false)}>
        <div className="stack">
          {state.collections.map(c => <label key={c.id} className="row" style={{ cursor: 'pointer' }}><input type="checkbox" checked={c.paperIds.includes(p.id)} onChange={() => dispatch({ type: 'toggleInCollection', collectionId: c.id, paperId: p.id })} />{c.name}</label>)}
          <button className="btn" onClick={() => { const name = prompt('New collection name'); name && dispatch({ type: 'addCollection', name }) }}>+ New collection</button>
          <button className="btn dark" onClick={() => { setCollOpen(false); toast('Collections updated') }}>Done</button>
        </div>
      </Modal>}
    </>
  )
}

function MethodDiagram({ steps, big }) {
  const fills = ['#3b82f6', '#a5f3fc', '#a7f3d0', '#d4f53c']
  return (
    <div className="row wrap" style={{ gap: 6, padding: big ? 30 : 6, justifyContent: 'center' }}>
      {steps.map((s, i) => <span key={i} className="row" style={{ gap: 6 }}>
        <span style={{ background: fills[i % 4], color: '#0d0d0d', border: '2px solid #0d0d0d', padding: big ? '18px 22px' : '10px 12px', fontFamily: 'var(--mono)', fontSize: big ? 14 : 11, fontWeight: 700, textTransform: 'capitalize' }}>{s}</span>
        {i < steps.length - 1 && <span className="mono">→</span>}
      </span>)}
    </div>
  )
}
