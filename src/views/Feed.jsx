import { useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Head, Tags, nav, toast } from '../components/ui.jsx'
import { useStore } from '../lib/store.jsx'
import { cosine, topTerms } from '../lib/nlp.js'
import { searchArxiv } from '../lib/arxiv.js'

export default function Feed() {
  const { state, dispatch, index } = useStore()
  const [tab, setTab] = useState('foryou')
  const [busy, setBusy] = useState(false)
  const [following, setFollowing] = useState(['Memory', 'LLM Agents'])
  const starredIdx = index.papers.map((p, i) => (p.starred ? i : -1)).filter(i => i >= 0)
  const interests = topTerms(starredIdx.map(i => index.vectors[i]), 4)

  const items = useMemo(() => {
    const unstarred = index.papers.map((p, i) => ({ p, i })).filter(x => !x.p.starred)
    if (tab === 'foryou') {
      // Score = mean similarity to starred papers — a simple content-based recommender.
      return unstarred.map(x => ({ ...x, score: starredIdx.reduce((s, j) => s + cosine(index.vectors[x.i], index.vectors[j]), 0) / (starredIdx.length || 1), why: 'Similar to your starred papers' })).sort((a, b) => b.score - a.score)
    }
    if (tab === 'trending') return unstarred.map(x => ({ ...x, score: x.p.citations / Math.max(1, new Date().getFullYear() - x.p.year), why: `~${Math.round(x.p.citations / Math.max(1, new Date().getFullYear() - x.p.year))} citations / year` })).sort((a, b) => b.score - a.score)
    if (tab === 'recent') return [...unstarred].sort((a, b) => b.p.year - a.p.year || b.p.addedAt - a.p.addedAt).map(x => ({ ...x, why: `Published ${x.p.year}` }))
    return unstarred.filter(x => x.p.tags.some(t => following.includes(t))).map(x => ({ ...x, why: `You follow ${x.p.tags.filter(t => following.includes(t)).join(', ')}` }))
  }, [tab, index, following])

  async function fetchNew() {
    setBusy(true)
    try {
      const fresh = (await searchArxiv(interests.join(' '), 10)).filter(p => !state.papers.some(x => x.id === p.id))
      dispatch({ type: 'addPapers', papers: fresh }); toast(`${fresh.length} new papers from arXiv`); setTab('recent')
    } catch (e) { toast(`arXiv unavailable: ${e.message}`) } finally { setBusy(false) }
  }
  const tags = [...new Set(state.papers.flatMap(p => p.tags))].sort()

  return (
    <>
      <Head n={15} title="Recommendation Feed" sub="Personalized paper recommendations" violet>
        <button className="btn" disabled={busy} onClick={fetchNew}>{busy ? <span className="spinner" /> : <RefreshCw size={14} />} Fetch from arXiv</button>
      </Head>
      <div className="card">
        <div className="seg">{[['foryou', 'For you'], ['trending', 'Trending'], ['recent', 'Recent'], ['following', 'Following']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
        {tab === 'foryou' && <p className="small muted">Your interests: {interests.map(t => <span key={t} className="tag lime">{t}</span>)}</p>}
        {tab === 'following' && <div style={{ margin: '10px 0' }}>{tags.map(t => <button key={t} className={`tag ${following.includes(t) ? 'violet' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setFollowing(f => f.includes(t) ? f.filter(x => x !== t) : [...f, t])}>{t}</button>)}</div>}
        <div className="stack" style={{ marginTop: 12 }}>
          {items.slice(0, 15).map(({ p, why }) => (
            <div key={p.id} className="list-item" onClick={() => nav(`/paper/${p.id}`)}>
              <div className="grow"><div className="t">{p.title}</div><div className="muted tiny mono">{p.authors.join(' ')} · {p.year} · arXiv</div><div className="small" style={{ margin: '6px 0' }}>{p.abstract.slice(0, 160)}…</div><Tags tags={p.tags} /><div className="tiny muted mono">↳ {why}</div></div>
              <button className="btn sm" onClick={e => { e.stopPropagation(); dispatch({ type: 'toggleStar', id: p.id }); toast('Saved to starred') }}>Save</button>
            </div>))}
          {!items.length && <div className="empty">Nothing here yet.</div>}
        </div>
      </div>
    </>
  )
}
