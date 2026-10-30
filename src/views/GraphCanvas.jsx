import { useMemo, useRef, useState } from 'react'
import { MousePointer2, Link2, Plus, FileText, Trash2, ZoomIn, ZoomOut, Maximize, Wand2, RotateCcw, Library } from 'lucide-react'
import { Head, Modal, Tags, nav, toast } from '../components/ui.jsx'
import { useStore, uid, CONCEPT_COLORS } from '../lib/store.jsx'

const W = 900, H = 540
const radius = n => (n.kind === 'concept' ? 34 : 24)
// Paper labels wrap at word boundaries onto at most 3 lines; anything longer ends in an ellipsis.
function wrap(text, width = 22, max = 3) {
  const lines = []
  for (const w of String(text).split(/\s+/).filter(Boolean)) {
    const last = lines.length - 1
    if (last >= 0 && (lines[last] + ' ' + w).length <= width) lines[last] += ' ' + w
    else lines.push(w.length > width ? w.slice(0, width - 1) + '…' : w)
  }
  if (lines.length > max) { lines.length = max; const l = lines[max - 1]; lines[max - 1] = (l.length < width ? l : l.slice(0, width - 1)) + '…' }
  return lines
}

// A few hundred iterations of spring + repulsion, enough to untangle small graphs.
function forceLayout(nodes, edges) {
  const pos = nodes.map(n => ({ ...n }))
  const idx = Object.fromEntries(pos.map((n, i) => [n.id, i]))
  for (let it = 0; it < 300; it++) {
    const f = pos.map(() => ({ x: 0, y: 0 }))
    for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) {
      const dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y, d2 = dx * dx + dy * dy + 0.01, rep = 9000 / d2
      const d = Math.sqrt(d2); f[i].x += (dx / d) * rep; f[i].y += (dy / d) * rep; f[j].x -= (dx / d) * rep; f[j].y -= (dy / d) * rep
    }
    for (const e of edges) {
      const a = idx[e.from], b = idx[e.to]; if (a == null || b == null) continue
      const dx = pos[b].x - pos[a].x, dy = pos[b].y - pos[a].y, d = Math.sqrt(dx * dx + dy * dy) || 1, s = (d - 140) * 0.05
      f[a].x += (dx / d) * s; f[a].y += (dy / d) * s; f[b].x -= (dx / d) * s; f[b].y -= (dy / d) * s
    }
    pos.forEach((p, i) => { p.x += Math.max(-8, Math.min(8, f[i].x + (W / 2 - p.x) * 0.01)); p.y += Math.max(-8, Math.min(8, f[i].y + (H / 2 - p.y) * 0.01)) })
  }
  return pos
}

export default function GraphCanvas() {
  const { state, dispatch } = useStore()
  const { nodes, edges } = state.canvas
  const [tool, setTool] = useState('select')
  const [sel, setSel] = useState(nodes[0]?.id)
  const [linkFrom, setLinkFrom] = useState(null)
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const [picker, setPicker] = useState(false)
  const drag = useRef(null)
  const svg = useRef(null)
  const set = (n, e = edges) => dispatch({ type: 'setCanvas', canvas: { nodes: n, edges: e } })

  const toWorld = ev => {
    const r = svg.current.getBoundingClientRect()
    return { x: ((ev.clientX - r.left) * (W / r.width) - view.x) / view.k, y: ((ev.clientY - r.top) * (H / r.height) - view.y) / view.k }
  }
  const onDown = (ev, node) => {
    ev.stopPropagation()
    if (node && tool === 'link') {
      if (!linkFrom) return setLinkFrom(node.id)
      if (linkFrom !== node.id && !edges.some(e => (e.from === linkFrom && e.to === node.id) || (e.to === linkFrom && e.from === node.id))) set(nodes, [...edges, { id: uid(), from: linkFrom, to: node.id }])
      return setLinkFrom(null)
    }
    if (node) { setSel(node.id); drag.current = { id: node.id, start: toWorld(ev), orig: { x: node.x, y: node.y }, moved: false } }
    else drag.current = { pan: true, sx: ev.clientX, sy: ev.clientY, orig: view }
  }
  const onMove = ev => {
    const d = drag.current; if (!d) return
    if (d.pan) { const r = svg.current.getBoundingClientRect(); setView({ ...d.orig, x: d.orig.x + (ev.clientX - d.sx) * (W / r.width), y: d.orig.y + (ev.clientY - d.sy) * (H / r.height) }); return }
    const p = toWorld(ev); d.moved = true
    set(nodes.map(n => n.id === d.id ? { ...n, x: d.orig.x + p.x - d.start.x, y: d.orig.y + p.y - d.start.y } : n))
  }
  const zoom = f => setView(v => ({ k: Math.min(3, Math.max(0.3, v.k * f)), x: W / 2 - (W / 2 - v.x) * f, y: H / 2 - (H / 2 - v.y) * f }))
  const fit = () => {
    if (!nodes.length) return setView({ x: 0, y: 0, k: 1 })
    const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y), pad = 70
    const [x0, x1, y0, y1] = [Math.min(...xs) - pad, Math.max(...xs) + pad, Math.min(...ys) - pad, Math.max(...ys) + pad]
    const k = Math.min(2, W / (x1 - x0), H / (y1 - y0))
    setView({ k, x: -x0 * k + (W - (x1 - x0) * k) / 2, y: -y0 * k + (H - (y1 - y0) * k) / 2 })
  }
  const addConcept = () => { const label = prompt('Concept name'); if (!label) return; const id = `c:${label}`; if (nodes.some(n => n.id === id)) return setSel(id); set([...nodes, { id, label, kind: 'concept', x: W / 2 + Math.random() * 80 - 40, y: H / 2 + Math.random() * 80 - 40, color: CONCEPT_COLORS[label] || '#e5e7eb' }]); setSel(id) }
  const addPaper = p => {
    const id = `p:${p.id}`
    const newNodes = nodes.some(n => n.id === id) ? nodes : [...nodes, { id, label: p.title.split(':')[0], kind: 'paper', paperId: p.id, x: W / 2 + Math.random() * 120 - 60, y: H / 2 + Math.random() * 120 - 60, color: '#8b5cf6' }]
    const autoEdges = p.tags.filter(t => newNodes.some(n => n.id === `c:${t}`)).map(t => ({ id: uid(), from: `c:${t}`, to: id })).filter(e => !edges.some(x => x.from === e.from && x.to === e.to))
    set(newNodes, [...edges, ...autoEdges]); setSel(id); setPicker(false)
  }
  const buildFromLibrary = () => {
    const starred = state.papers.filter(p => p.starred)
    const tagSet = [...new Set(starred.flatMap(p => p.tags))]
    let ns = [...nodes]
    tagSet.forEach((t, i) => { if (!ns.some(n => n.id === `c:${t}`)) ns.push({ id: `c:${t}`, label: t, kind: 'concept', x: 100 + (i * 97) % 700, y: 80 + (i * 61) % 380, color: CONCEPT_COLORS[t] || '#e5e7eb' }) })
    starred.forEach((p, i) => { if (!ns.some(n => n.id === `p:${p.id}`)) ns.push({ id: `p:${p.id}`, label: p.title.split(':')[0], kind: 'paper', paperId: p.id, x: 150 + (i * 131) % 600, y: 120 + (i * 83) % 320, color: '#8b5cf6' }) })
    const es = [...edges]
    starred.forEach(p => p.tags.forEach(t => { if (!es.some(e => e.from === `c:${t}` && e.to === `p:${p.id}`)) es.push({ id: uid(), from: `c:${t}`, to: `p:${p.id}` }) }))
    set(forceLayout(ns, es), es); toast(`Added ${starred.length} starred papers`)
  }
  const del = () => { if (!sel) return; set(nodes.filter(n => n.id !== sel), edges.filter(e => e.from !== sel && e.to !== sel)); setSel(null) }

  // Older canvases stored titles cut at 22 characters; show the full title unless the label was renamed.
  const paperOf = n => n.paperId && state.papers.find(p => p.id === n.paperId)
  const labelOf = n => { const p = paperOf(n), full = p?.title.split(':')[0]; return full && full.startsWith(n.label) ? full : n.label }
  const titleOf = n => paperOf(n)?.title || n.label
  const byId = useMemo(() => Object.fromEntries(nodes.map(n => [n.id, n])), [nodes])
  const node = byId[sel]
  const paper = node?.paperId && state.papers.find(p => p.id === node.paperId)
  const related = node ? edges.filter(e => e.from === node.id || e.to === node.id).map(e => byId[e.from === node.id ? e.to : e.from]).filter(Boolean) : []
  const conceptPapers = node?.kind === 'concept' ? state.papers.filter(p => p.tags.includes(node.label)) : []

  const TOOLS = [['select', MousePointer2, 'Select / move / pan'], ['link', Link2, 'Connect two nodes']]
  return (
    <>
      <Head n={3} title="Graph Canvas" sub="Visualize connections between papers & concepts">
        <button className="btn" onClick={addConcept}><Plus size={14} /> Add node</button>
        <button className="btn" onClick={() => setPicker(true)}><FileText size={14} /> Add paper</button>
        <button className="btn" onClick={buildFromLibrary}><Library size={14} /> From starred</button>
        <button className="btn" onClick={() => { set(forceLayout(nodes, edges)); setTimeout(fit, 0) }}><Wand2 size={14} /> Auto-layout</button>
      </Head>
      <div className="grid side-r">
        <div className="svgbox" style={{ boxShadow: 'var(--shadow)' }}>
          <div className="stack" style={{ position: 'absolute', left: 10, top: 10, zIndex: 2, background: 'var(--panel)', border: '2px solid var(--line)', padding: 4 }}>
            {TOOLS.map(([k, Icon, t]) => <button key={k} title={t} className={`btn sm ${tool === k ? 'dark' : 'ghost'}`} onClick={() => { setTool(k); setLinkFrom(null) }}><Icon size={15} /></button>)}
            <button title="Delete selected" className="btn sm ghost" onClick={del}><Trash2 size={15} /></button>
            <button title="Reset canvas" className="btn sm ghost" onClick={() => confirm('Reset canvas to default?') && dispatch({ type: 'resetCanvas' })}><RotateCcw size={15} /></button>
          </div>
          {tool === 'link' && <div className="tag lime" style={{ position: 'absolute', left: 60, top: 12, zIndex: 2 }}>{linkFrom ? 'Click the target node' : 'Click the source node'}</div>}
          <svg ref={svg} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block', cursor: drag.current?.pan ? 'grabbing' : 'grab', touchAction: 'none', background: 'radial-gradient(circle, var(--soft) 1px, transparent 1px) 0 0/22px 22px' }}
            onPointerDown={e => onDown(e)} onPointerMove={onMove} onPointerUp={() => { drag.current = null }} onPointerLeave={() => { drag.current = null }}
            onWheel={e => zoom(e.deltaY < 0 ? 1.1 : 0.9)}>
            <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
              {edges.map(e => { const a = byId[e.from], b = byId[e.to]; return a && b && <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--ink)" strokeWidth={sel === e.from || sel === e.to ? 2.5 : 1.5} opacity={0.8} /> })}
              {nodes.map(n => {
                const r = radius(n), on = sel === n.id || linkFrom === n.id
                return (
                  <g key={n.id} transform={`translate(${n.x},${n.y})`} style={{ cursor: tool === 'link' ? 'crosshair' : 'move' }} onPointerDown={e => onDown(e, n)} onDoubleClick={() => n.paperId && nav(`/paper/${n.paperId}`)}>
                    {n.kind === 'concept'
                      ? <rect x={-r * 1.5} y={-16} width={r * 3} height={32} fill={n.color} stroke="#0d0d0d" strokeWidth={on ? 3.5 : 2} />
                      : <circle r={r} fill={n.color} stroke="#0d0d0d" strokeWidth={on ? 3.5 : 2} />}
                    <title>{titleOf(n)}</title>
                    <text textAnchor="middle" dy={n.kind === 'paper' ? 0 : 4} fontSize={11} fontFamily="JetBrains Mono" fontWeight={700} style={{ fill: n.kind === 'paper' ? 'var(--ink)' : '#0d0d0d', pointerEvents: 'none' }}>
                      {n.kind === 'paper' ? wrap(labelOf(n)).map((l, i) => <tspan key={i} x={0} dy={i ? 13 : r + 14}>{l}</tspan>) : n.label}
                    </text>
                  </g>
                )
              })}
            </g>
          </svg>
          <div className="row" style={{ position: 'absolute', left: 10, bottom: 10, background: 'var(--panel)', border: '2px solid var(--line)', padding: 2, gap: 2 }}>
            <button className="btn sm ghost" onClick={() => zoom(0.85)}><ZoomOut size={14} /></button>
            <span className="mono tiny" style={{ width: 42, textAlign: 'center' }}>{Math.round(view.k * 100)}%</span>
            <button className="btn sm ghost" onClick={() => zoom(1.18)}><ZoomIn size={14} /></button>
            <button className="btn sm ghost" onClick={fit}><Maximize size={14} /></button>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', right: 10, bottom: 10, width: 150, border: '2px solid var(--line)', background: 'var(--panel)' }}>
            {edges.map(e => { const a = byId[e.from], b = byId[e.to]; return a && b && <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--muted)" strokeWidth={4} /> })}
            {nodes.map(n => <circle key={n.id} cx={n.x} cy={n.y} r={14} fill="var(--ink)" />)}
            <rect x={-view.x / view.k} y={-view.y / view.k} width={W / view.k} height={H / view.k} fill="none" stroke="var(--violet)" strokeWidth={8} />
          </svg>
        </div>
        <div className="card" style={{ alignSelf: 'start' }}>
          <h3>Node details</h3>
          {!node && <p className="muted small">Select a node. Drag to move, drag the background to pan, scroll to zoom, double-click a paper to open it.</p>}
          {node && <div className="stack small">
            <input className="input" style={{ fontWeight: 700 }} value={node.label} onChange={e => set(nodes.map(n => n.id === node.id ? { ...n, label: e.target.value } : n))} />
            {paper ? <>
              <div className="muted mono tiny">Type: Paper · Year: {paper.year} · Citations: {paper.citations} · arXiv: {paper.arxiv}</div>
              <div><div className="label">Tags</div><Tags tags={paper.tags} /></div>
              <div><div className="label">Summary</div>{paper.abstract.slice(0, 220)}…</div>
            </> : <>
              <div className="muted mono tiny">Type: Concept · {conceptPapers.length} papers in library</div>
              <div className="row wrap">{Object.entries(CONCEPT_COLORS).slice(0, 8).map(([k, c]) => <button key={k} title={k} onClick={() => set(nodes.map(n => n.id === node.id ? { ...n, color: c } : n))} style={{ width: 20, height: 20, background: c, border: '2px solid var(--line)', cursor: 'pointer' }} />)}</div>
              {conceptPapers.slice(0, 5).map(p => <div key={p.id} className="row between"><span className="grow" style={{ cursor: 'pointer' }} onClick={() => nav(`/paper/${p.id}`)}>{p.title.split(':')[0]}</span><button className="btn sm" onClick={() => addPaper(p)}>+</button></div>)}
            </>}
            <div><div className="label">Related nodes ({related.length})</div>{related.map(r => <span key={r.id} className="tag" style={{ cursor: 'pointer' }} onClick={() => setSel(r.id)}>{r.label}</span>)}</div>
            {paper && <button className="btn block" onClick={() => nav(`/paper/${paper.id}`)}>View full details</button>}
          </div>}
        </div>
      </div>
      {picker && <Modal title="Add paper to canvas" onClose={() => setPicker(false)}>
        <div className="stack">{state.papers.map(p => <div key={p.id} className="list-item" onClick={() => addPaper(p)}><div className="grow"><div className="t small">{p.title}</div><Tags tags={p.tags} /></div></div>)}</div>
      </Modal>}
    </>
  )
}
