// Radar of concept coverage: explored share per dimension (filled) vs. full scale.
export default function Radar({ data, size = 300 }) {
  const c = size / 2, R = size / 2 - 62, n = data.length
  const pt = (i, r) => { const a = -Math.PI / 2 + (i / n) * Math.PI * 2; return [c + Math.cos(a) * r, c + Math.sin(a) * r] }
  const max = Math.max(...data.map(d => d.share), 0.01)
  const poly = data.map((d, i) => pt(i, R * (0.12 + 0.88 * d.share / max)).join(',')).join(' ')
  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', maxWidth: size }}>
      {[0.25, 0.5, 0.75, 1].map(f => <polygon key={f} points={data.map((_, i) => pt(i, R * f).join(',')).join(' ')} fill="none" stroke="var(--muted)" strokeWidth={0.8} />)}
      {data.map((_, i) => <line key={i} x1={c} y1={c} x2={pt(i, R)[0]} y2={pt(i, R)[1]} stroke="var(--muted)" strokeWidth={0.8} />)}
      <polygon points={poly} fill="#7c4dff" fillOpacity={0.7} stroke="#4c1d95" strokeWidth={2} />
      {data.map((d, i) => { const [x, y] = pt(i, R + 26); return <text key={d.key} x={x} y={y} textAnchor="middle" fontSize={10} fontFamily="Inter">{d.key.split(' ').map((w, j) => <tspan key={j} x={x} dy={j ? 11 : 0}>{w}</tspan>)}</text> })}
    </svg>
  )
}
