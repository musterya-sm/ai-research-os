import { Search, Network, FileText, TrendingUp, Lightbulb, PenLine } from 'lucide-react'
import { nav } from '../components/ui.jsx'

const FEATURES = [[Search, 'Discover & collect papers', '/library'], [Network, 'Visualize connections', '/canvas'], [FileText, 'Summarize & understand', '/paper/2310.08560'], [TrendingUp, 'Detect gaps & trends', '/gaps'], [Lightbulb, 'Generate hypotheses', '/hypotheses'], [PenLine, 'Write surveys faster', '/survey']]
// Hand-placed pixel cluster echoing the brand mark.
const PIX = '0000001100000010000110100010110001101100110100101101010010001100'

export default function Landing() {
  return (
    <div className="card" style={{ maxWidth: 1100, padding: 36 }}>
      <div className="row between wrap" style={{ alignItems: 'flex-start', gap: 30 }}>
        <div style={{ maxWidth: 560 }}>
          <h1 className="hero-title">AI RESEARCH OS</h1>
          <p className="mono" style={{ fontWeight: 700, letterSpacing: 2, margin: '14px 0 22px' }}>RESEARCH. CONNECT. DISCOVER. INNOVATE.</p>
          <p style={{ fontSize: 16, lineHeight: 1.6 }}>The AI-powered research workspace that helps you discover papers, understand fields, detect gaps, and generate new ideas.</p>
          <div className="stack" style={{ margin: '22px 0 28px' }}>
            {FEATURES.map(([Icon, label, to]) => (
              <button key={label} className="row btn ghost" style={{ padding: '4px 0', textTransform: 'none', fontFamily: 'var(--sans)', fontSize: 15, fontWeight: 500 }} onClick={() => nav(to)}>
                <span style={{ border: '2px solid var(--line)', padding: 3, display: 'grid' }}><Icon size={16} /></span>{label}
              </button>
            ))}
          </div>
          <div className="row wrap">
            <button className="btn dark" style={{ background: 'var(--ink)', color: 'var(--lime)', padding: '12px 20px' }} onClick={() => nav('/dashboard')}>RESEARCH INTELLIGENCE, REIMAGINED. →</button>
          </div>
        </div>
        <div className="pixel" aria-hidden style={{ marginTop: 60 }}>{[...PIX].map((c, i) => <i key={i} style={{ opacity: c === '1' ? 1 : 0, transform: c === '1' && i % 7 === 0 ? 'scale(1.6)' : null }} />)}</div>
      </div>
    </div>
  )
}
