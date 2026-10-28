import { useMemo, useState } from 'react'
import { Head, PaperRow, nav } from '../components/ui.jsx'
import { useStore } from '../lib/store.jsx'
import { kmeans, topTerms } from '../lib/nlp.js'

const COLORS = ['#a78bfa', '#d4f53c', '#3b82f6', '#ef4444', '#6b7280', '#f59e0b', '#10b981', '#ec4899']
const W = 640, H = 420

export default function ConceptClusters() {
  const { state, index } = useStore()
  const [k, setK] = useState(5)
  const [sel, setSel] = useState(0)
  const clusters = useMemo(() => {
    const assign = kmeans(index, k)
    return Array.from({ length: k }, (_, c) => {
      const idx = assign.map((a, i) => (a === c ? i : -1)).filter(i => i >= 0)
      const papers = idx.map(i => index.papers[i])
      const tagCount = papers.flatMap(p => p.tags).reduce((m, t) => (m[t] = (m[t] || 0) + 1, m), {})
      const top = Object.entries(tagCount).sort((a, b) => b[1] - a[1])
      return { c, papers, name: top[0]?.[0] || 'Misc', sub: top.slice(1, 3).map(t => t[0]), terms: topTerms(idx.map(i => index.vectors[i]), 4), color: COLORS[c % COLORS.length] }
    }).filter(x => x.papers.length).sort((a, b) => b.papers.length - a.papers.length)
      // Two clusters can share a dominant tag; disambiguate with their next tag or top term.
      .map((cl, i, all) => all.findIndex(o => o.name === cl.name) < i ? { ...cl, name: `${cl.name} · ${cl.sub.find(t => !all.some(o => o.name === t)) || cl.terms[0]}` } : cl)
  }, [index, k])

  // Lay clusters on a ring, bubble radius by size; members scatter deterministically inside.
  const layout = clusters.map((cl, i) => {
    const a = (i / clusters.length) * Math.PI * 2 - Math.PI / 2, r = 18 + Math.sqrt(cl.papers.length) * 8
    return { ...cl, x: W / 2 + Math.cos(a) * 205, y: H / 2 + Math.sin(a) * 140, r }
  })
  const current = layout[Math.min(sel, layout.length - 1)]

  return (
    <>
      <Head n={14} title="Concept Clusters" sub="AI groups related concepts automatically">
        <label className="row small mono">CLUSTERS <input type="range" min={2} max={8} value={k} onChange={e => { setK(+e.target.value); setSel(0) }} /> {k}</label>
      </Head>
      <div className="grid side">
        <div className="card" style={{ alignSelf: 'start', padding: 10 }}>
          <h3 style={{ padding: '4px 8px' }}>Clusters</h3>
          <div className="nav-list">{layout.map((cl, i) => <button key={cl.c} className={sel === i ? 'on' : ''} onClick={() => setSel(i)}><span className="row" style={{ gap: 8 }}><i style={{ width: 10, height: 10, background: cl.color, border: '1px solid #0d0d0d', display: 'inline-block' }} />{cl.name}</span><span className="mono tiny">({cl.papers.length})</span></button>)}</div>
          <p className="muted tiny" style={{ padding: 8 }}>k-means over TF-IDF vectors of title + abstract. Named by the dominant tag.</p>
        </div>
        <div className="stack">
          <div className="svgbox">
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
              {layout.map((cl, i) => layout.slice(i + 1).map(o => <line key={cl.c + '-' + o.c} x1={cl.x} y1={cl.y} x2={o.x} y2={o.y} stroke="var(--muted)" strokeWidth={0.6} strokeDasharray="3 4" />))}
              {layout.map((cl, i) => <g key={cl.c} style={{ cursor: 'pointer' }} onClick={() => setSel(i)}>
                {cl.papers.map((p, j) => { const h = [...p.id].reduce((a, ch) => (a * 33 + ch.charCodeAt(0)) >>> 0, 5), ang = (h % 360) * Math.PI / 180, d = cl.r + 6 + (h >>> 9) % 22; return <circle key={p.id} cx={cl.x + Math.cos(ang) * d} cy={cl.y + Math.sin(ang) * d} r={3} fill={cl.color} stroke="#0d0d0d" strokeWidth={0.5} onClick={e => { e.stopPropagation(); nav(`/paper/${p.id}`) }}><title>{p.title}</title></circle> })}
                <circle cx={cl.x} cy={cl.y} r={cl.r} fill={cl.color} stroke="#0d0d0d" strokeWidth={sel === i ? 3.5 : 2} />
                <text x={cl.x} y={cl.y} textAnchor="middle" fontSize={11} fontWeight={700} fontFamily="Inter" style={{ fill: '#0d0d0d' }}>{cl.name.split(/ · | /).map((w, j) => <tspan key={j} x={cl.x} dy={j ? 14 : 0}>{w}</tspan>)}</text>
              </g>)}
            </svg>
          </div>
          {current && <div className="card">
            <div className="row between"><h3 style={{ margin: 0 }}>{current.name} · {current.papers.length} papers</h3><span>{current.terms.map(t => <span key={t} className="tag">{t}</span>)}{current.sub.map(t => <span key={t} className="tag lime">{t}</span>)}</span></div>
            <div className="stack" style={{ marginTop: 12 }}>{current.papers.map(p => <PaperRow key={p.id} paper={p} />)}</div>
          </div>}
        </div>
      </div>
    </>
  )
}
