import { useEffect, useMemo, useRef, useState } from 'react'
import { Play, Pause, Flag, RotateCcw } from 'lucide-react'
import { Head, nav } from '../components/ui.jsx'
import { useStore } from '../lib/store.jsx'

const ERAS = [
  { name: 'Foundations', range: [0, 2018], color: '#94a3b8' },
  { name: 'Early RAG', range: [2019, 2021], color: '#3b82f6' },
  { name: 'Advanced RAG & Reasoning', range: [2022, 2022], color: '#84cc16' },
  { name: 'Agentic RAG', range: [2023, 2023], color: '#8b5cf6' },
  { name: 'Memory Agents', range: [2024, 9999], color: '#ec4899' },
]
const eraOf = y => ERAS.find(e => y >= e.range[0] && y <= e.range[1])
const W = 900, H = 320

export default function Timeline() {
  const { state } = useStore()
  const tags = [...new Set(state.papers.flatMap(p => p.tags))].sort()
  const [tag, setTag] = useState('')
  const [hover, setHover] = useState(null)
  const papers = state.papers.filter(p => !tag || p.tags.includes(tag))
  const years = papers.map(p => p.year)
  const y0 = Math.min(...years, 2014), y1 = Math.max(...years, 2025)
  const [cursor, setCursor] = useState(y1)
  const [playing, setPlaying] = useState(false)
  const timer = useRef()
  useEffect(() => {
    if (!playing) return
    timer.current = setInterval(() => setCursor(c => { if (c >= y1) { setPlaying(false); return y1 } return c + 1 }), 700)
    return () => clearInterval(timer.current)
  }, [playing, y1])

  const x = y => 50 + ((y - y0) / Math.max(1, y1 - y0)) * (W - 100)
  // Stable pseudo-random jitter per paper so dots don't move between renders.
  const dots = useMemo(() => papers.map(p => {
    const h = [...p.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
    return { p, cx: x(p.year) + ((h % 100) / 100 - 0.5) * 50, cy: 40 + ((h >>> 7) % 1000) / 1000 * (H - 110), r: 4 + Math.log10(p.citations + 10) * 2.2 }
  }), [papers, y0, y1])
  const milestones = Object.values(papers.reduce((m, p) => { if (!m[p.year] || m[p.year].citations < p.citations) m[p.year] = p; return m }, {})).filter(p => p.year <= cursor)

  return (
    <>
      <Head n={10} title="Timeline Evolution" sub="See how research evolves over time">
        <select className="input" style={{ width: 'auto' }} value={tag} onChange={e => setTag(e.target.value)}><option value="">All concepts</option>{tags.map(t => <option key={t}>{t}</option>)}</select>
      </Head>
      <div className="card">
        <h3>Evolution: From RAG to Agentic Memory {tag && `· ${tag}`}</h3>
        <div className="row" style={{ alignItems: 'stretch' }}>
          <div className="stack" style={{ paddingTop: 10 }}>
            <button className="btn sm" title={playing ? 'Pause' : 'Play'} onClick={() => { if (cursor >= y1) setCursor(y0); setPlaying(!playing) }}>{playing ? <Pause size={15} /> : <Play size={15} />}</button>
            <button className="btn sm" title="Jump to end" onClick={() => { setPlaying(false); setCursor(y1) }}><Flag size={15} /></button>
            <button className="btn sm" title="Restart" onClick={() => { setPlaying(false); setCursor(y0) }}><RotateCcw size={15} /></button>
          </div>
          <div className="grow" style={{ position: 'relative' }}>
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%' }}>
              <line x1={40} x2={W - 40} y1={H - 50} y2={H - 50} stroke="var(--ink)" strokeWidth={2} />
              {Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i).map(y => <g key={y}><line x1={x(y)} x2={x(y)} y1={H - 55} y2={H - 45} stroke="var(--ink)" /><text x={x(y)} y={H - 28} textAnchor="middle" fontSize={11} fontFamily="JetBrains Mono" fontWeight={y % 2 ? 400 : 700}>{y}</text></g>)}
              <rect x={x(cursor) + 25} y={0} width={Math.max(0, W - x(cursor) - 25)} height={H - 52} fill="var(--bg)" opacity={0.75} />
              {dots.map(d => <circle key={d.p.id} cx={d.cx} cy={d.cy} r={d.r} fill={eraOf(d.p.year).color} stroke="#0d0d0d" strokeWidth={hover === d.p.id ? 2 : 0.6} opacity={d.p.year <= cursor ? 0.9 : 0.12} style={{ cursor: 'pointer', transition: 'opacity .4s' }} onMouseEnter={() => setHover(d.p.id)} onMouseLeave={() => setHover(null)} onClick={() => nav(`/paper/${d.p.id}`)} />)}
              {hover && (() => { const d = dots.find(z => z.p.id === hover); return d && <g pointerEvents="none"><rect x={Math.min(d.cx + 10, W - 260)} y={d.cy - 30} width={250} height={36} fill="var(--panel)" stroke="var(--line)" strokeWidth={1.5} /><text x={Math.min(d.cx + 18, W - 252)} y={d.cy - 14} fontSize={11} fontWeight={700}>{d.p.title.slice(0, 38)}</text><text x={Math.min(d.cx + 18, W - 252)} y={d.cy} fontSize={10} fontFamily="JetBrains Mono">{d.p.year} · ~{d.p.citations} cites</text></g> })()}
            </svg>
          </div>
        </div>
        <div className="row wrap" style={{ gap: 18, marginTop: 6 }}>{ERAS.map(e => <span key={e.name} className="small row" style={{ gap: 6 }}><i style={{ width: 12, height: 12, background: e.color, display: 'inline-block', border: '1px solid #0d0d0d' }} />{e.name} <span className="muted mono tiny">({e.range[0] === e.range[1] ? e.range[0] : `${e.range[0] || '…'}–${e.range[1] > 3000 ? 'now' : e.range[1]}`})</span></span>)}</div>
        <p className="muted tiny">Dot size ∝ log(citations). Press play to watch the field grow year by year.</p>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h3>Milestones through {cursor}</h3>
        <div className="stack">{milestones.sort((a, b) => a.year - b.year).map(p => <div key={p.id} className="row small" style={{ cursor: 'pointer' }} onClick={() => nav(`/paper/${p.id}`)}><span className="tag" style={{ background: eraOf(p.year).color, color: '#0d0d0d' }}>{p.year}</span><b>{p.title.split(':')[0]}</b><span className="muted">— {p.finding}</span></div>)}</div>
      </div>
    </>
  )
}
