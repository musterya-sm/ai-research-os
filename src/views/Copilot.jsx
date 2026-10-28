import { useEffect, useRef, useState } from 'react'
import { Send, Trash2, User, Bot } from 'lucide-react'
import { Head, Prose, AiBadge, useAI, nav } from '../components/ui.jsx'
import { useStore } from '../lib/store.jsx'
import { search, coverage } from '../lib/nlp.js'
import { paperContext } from '../lib/ai.js'

const STARTERS = ['What are the main challenges in building memory systems for LLM agents?', 'Compare RAG and long-context approaches', 'Which papers should I read first on tool use?', 'Summarize how agent reflection has evolved']

// Retrieval-only answer: top-k papers, grouped into findings and limitations.
function localAnswer(q, hits, all) {
  if (!hits.length) return 'I could not find relevant papers in your library. Try importing papers on this topic.'
  const lims = [...new Set(hits.map(h => h.paper.limitation).filter(Boolean))]
  const cov = coverage(hits.map(h => h.paper)).sort((a, b) => a.share - b.share)
  return [`Based on ${hits.length} relevant papers in your library:`, '', '## Key findings', ...hits.slice(0, 4).map((h, i) => `${i + 1}. **${h.paper.title.split(':')[0]}** (${h.paper.year}) — ${h.paper.finding || h.paper.abstract.slice(0, 100)} [${i + 1}]`),
    '', '## Main challenges', ...lims.slice(0, 4).map((l, i) => `${i + 1}. **${l}**`), `${lims.length + 1}. **Coverage**: ${cov[0].key.toLowerCase()} is rarely addressed in these papers.`,
    '', `_Local retrieval answer over ${all} papers. Add a Claude API key in Settings for synthesized answers._`].join('\n')
}

export default function Copilot() {
  const { state, dispatch, index } = useStore()
  const [q, setQ] = useState('')
  const { run, busy, error } = useAI()
  const end = useRef()
  // Scroll only the message pane; scrollIntoView would also scroll the document and push the shell off-screen.
  useEffect(() => { const el = end.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }) }, [state.chat.length, busy])

  async function ask(text) {
    if (!text.trim()) return
    setQ('')
    dispatch({ type: 'chat', msg: { role: 'user', text } })
    const hits = search(index, text, 8)
    const history = state.chat.slice(-6).map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join('\n')
    const answer = await run({ maxTokens: 1500, prompt: `${history ? `Conversation so far:\n${history}\n\n` : ''}Question: ${text}\n\nRelevant papers from the user's library:\n${paperContext(hits.map(h => h.paper))}`, fallback: () => localAnswer(text, hits, state.papers.length) })
    dispatch({ type: 'chat', msg: { role: 'ai', text: answer, sources: hits.slice(0, 5).map(h => h.paper.id) } })
  }

  return (
    <>
      <Head n={11} title="AI Research Copilot" sub="Ask any research question" violet><AiBadge /><button className="btn sm" onClick={() => dispatch({ type: 'clearChat' })}><Trash2 size={13} /> Clear</button></Head>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 150px)', minHeight: 420 }}>
        <div ref={end} className="grow stack" style={{ overflowY: 'auto', paddingRight: 6 }}>
          {!state.chat.length && <div className="stack"><p className="muted">Answers are grounded in the papers in your library. Try:</p>{STARTERS.map(s => <button key={s} className="btn ghost" style={{ textTransform: 'none', fontFamily: 'var(--sans)', justifyContent: 'flex-start', border: '2px dashed var(--muted)' }} onClick={() => ask(s)}>{s}</button>)}</div>}
          {state.chat.map((m, i) => (
            <div key={i} className="row" style={{ alignItems: 'flex-start', flexDirection: m.role === 'user' ? 'row-reverse' : 'row' }}>
              <span style={{ border: '2px solid var(--line)', borderRadius: '50%', padding: 5, display: 'grid' }}>{m.role === 'user' ? <User size={16} /> : <Bot size={16} />}</span>
              <div className={`bubble ${m.role === 'user' ? 'me' : 'ai'}`} style={{ whiteSpace: m.role === 'user' ? 'pre-wrap' : 'normal' }}>
                {m.role === 'user' ? m.text : <Prose text={m.text} />}
                {m.sources?.length > 0 && <div style={{ marginTop: 8 }}>{m.sources.map((id, j) => { const p = state.papers.find(x => x.id === id); return p && <span key={id} className="tag" style={{ cursor: 'pointer' }} onClick={() => nav(`/paper/${id}`)}>[{j + 1}] {p.title.split(':')[0].slice(0, 28)}</span> })}</div>}
              </div>
            </div>))}
          {busy && <div className="row"><span className="spinner" /> <span className="muted small">Reading your papers…</span></div>}
          {error && <p className="small" style={{ color: 'var(--red)' }}>{error}</p>}
        </div>
        <form className="row" style={{ marginTop: 12 }} onSubmit={e => { e.preventDefault(); ask(q) }}>
          <input className="input" placeholder="Ask another question..." value={q} onChange={e => setQ(e.target.value)} disabled={busy} />
          <button className="btn violet" disabled={busy || !q.trim()}><Send size={15} /></button>
        </form>
      </div>
    </>
  )
}
