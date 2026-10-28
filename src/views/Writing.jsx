import { useMemo, useState } from 'react'
import { PenLine, Sparkles, Copy, Download, Trash2, Plus, Search } from 'lucide-react'
import { Head, AiBadge, toast, useAI } from '../components/ui.jsx'
import { useStore } from '../lib/store.jsx'
import { KINDS, hlTitle, searchHighlights } from '../lib/highlights.js'
import { citeKey, toBibtex, download } from '../lib/exporter.js'

const SECTIONS = { related: 'Related Work', background: 'Background', intro: 'Introduction', discussion: 'Discussion' }
const STYLES = { latex: 'LaTeX \\cite{}', author: '(Author, Year)', numeric: '[1] numeric' }
const surname = p => (p.authors[0] || 'Anon').split(' ').pop()
const VERB = { important: 'show that', idea: 'propose', question: 'leave open', term: 'define' }

// Local composer: groups the chosen notes by each paper's main concept, oldest work first, and turns
// every highlight into a cited sentence. A scaffold to edit, not finished prose.
function compose({ hs, papers, section, style }) {
  const used = [...new Set(hs.map(h => h.paperId).filter(Boolean))].map(id => papers.find(p => p.id === id)).filter(Boolean).sort((a, b) => a.year - b.year)
  const num = new Map(used.map((p, i) => [p.id, i + 1]))
  const cite = p => style === 'latex' ? `\\cite{${citeKey(p)}}` : style === 'author' ? `(${surname(p)} et al., ${p.year})` : `[${num.get(p.id)}]`
  const freq = {}
  for (const p of used) for (const t of p.tags) freq[t] = (freq[t] || 0) + 1
  const topic = p => [...p.tags].sort((a, b) => (freq[b] || 0) - (freq[a] || 0))[0] || 'General'
  const groups = {}
  for (const p of used) (groups[topic(p)] ||= []).push(p)
  const short = t => { const w = t.replace(/\s+/g, ' ').trim().split(' '); return w.length > 32 ? `${w.slice(0, 32).join(' ')}…` : w.join(' ') }
  const sentence = (p, h) => h.kind === 'term'
    ? `${surname(p)} et al. ${cite(p)} define *${h.term}* as ${h.definition.replace(/\.$/, '')}.`
    : h.kind === 'question' ? `${surname(p)} et al. ${cite(p)} leave open “${short(h.text)}”${h.note ? ` — ${h.note}` : ''}.`
    : `${surname(p)} et al. ${cite(p)} ${VERB[h.kind]} “${short(h.text)}”${h.note ? ` (${h.note})` : ''}.`
  const out = [`## ${SECTIONS[section]}`, '']
  if (section === 'intro') out.push(`Recent work on ${Object.keys(groups).slice(0, 3).join(', ').toLowerCase()} has moved quickly. We build on ${used.length} prior works, summarised below.`, '')
  for (const [tag, ps] of Object.entries(groups)) {
    const lines = ps.flatMap(p => hs.filter(h => h.paperId === p.id).slice(0, 3).map(h => sentence(p, h)))
    out.push(`**${tag}.** ${ps.length > 1 ? `Several works address ${tag.toLowerCase()}. ` : ''}${lines.join(' ')}`, '')
  }
  const loose = hs.filter(h => !h.paperId)
  if (loose.length) out.push(`**Our observations.** ${loose.map(h => short(hlTitle(h))).join(' ')}`, '')
  const qs = hs.filter(h => h.kind === 'question')
  if (qs.length && section !== 'intro') out.push(`These open questions motivate our work: ${qs.map(h => short(h.note || h.text)).join('; ')}.`, '')
  if (style !== 'latex') out.push('## References', ...used.map(p => `${style === 'numeric' ? `[${num.get(p.id)}]` : '-'} ${p.authors.join(', ')} (${p.year}). ${p.title}. ${p.venue}${/^\d{4}\.\d/.test(p.arxiv) ? `, arXiv:${p.arxiv}` : ''}.`))
  return out.join('\n')
}

export default function Writing() {
  const { state, dispatch } = useStore()
  const [draftId, setDraftId] = useState(state.drafts[0]?.id || null)
  const draft = state.drafts.find(d => d.id === draftId)
  const [sel, setSel] = useState(() => new Set(draft?.ids || []))
  const [q, setQ] = useState('')
  const [paper, setPaper] = useState('')
  const [section, setSection] = useState(draft?.section || 'related')
  const [style, setStyle] = useState(draft?.style || 'latex')
  const { run, busy, error } = useAI()
  const hs = state.highlights
  const titleOf = id => state.papers.find(p => p.id === id)?.title.split(':')[0]
  const shown = useMemo(() => {
    let l = q.trim() ? searchHighlights(hs, q, 500) : hs
    if (paper) l = l.filter(h => h.paperId === paper)
    return l
  }, [hs, q, paper])
  const chosen = hs.filter(h => sel.has(h.id))
  const cited = [...new Set(chosen.map(h => h.paperId).filter(Boolean))].map(id => state.papers.find(p => p.id === id)).filter(Boolean)
  const toggle = id => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const saveBody = body => {
    const id = draftId || Math.random().toString(36).slice(2, 9)
    dispatch({ type: 'saveDraft', draft: { id, title: draft?.title || `${SECTIONS[section]} draft`, body, ids: [...sel], section, style } })
    setDraftId(id)
  }

  async function generate() {
    if (!chosen.length) return toast('Pick some highlights first')
    const keys = cited.map(p => `${style === 'latex' ? `\\cite{${citeKey(p)}}` : style === 'author' ? `(${surname(p)} et al., ${p.year})` : `[${cited.indexOf(p) + 1}]`} = ${p.title} (${p.year}). Abstract: ${p.abstract.slice(0, 400)}`).join('\n')
    const notes = chosen.map(h => `- ${h.paperId ? `[${titleOf(h.paperId)}] ` : '[own note] '}${h.kind === 'term' ? `Term ${h.term}: ${h.definition}` : `${KINDS[h.kind].label}: "${h.text}"`}${h.note ? ` — my note: ${h.note}` : ''}`).join('\n')
    const out = await run({
      maxTokens: 2000,
      prompt: `Write the "${SECTIONS[section]}" section of a research paper in polished academic prose (Markdown, start with "## ${SECTIONS[section]}"). Organise by theme, not paper-by-paper; compare and contrast works; end by stating the gap these notes point to. Use ONLY these citation markers, exactly as written:\n${keys}\n\nBase every claim on the researcher's notes below (and the abstracts). Do not invent results.\n\nNotes:\n${notes}${style !== 'latex' ? '\n\nFinish with a "## References" list for the cited works.' : ''}`,
      fallback: () => compose({ hs: chosen, papers: state.papers, section, style }),
    })
    saveBody(out)
  }

  const body = draft?.body || ''
  return (
    <>
      <Head n={18} title="Writing Studio" sub="Turn your highlights into a cited draft section" violet>
        <select className="input" style={{ width: 'auto' }} value={draftId || ''} onChange={e => { const d = state.drafts.find(x => x.id === e.target.value); setDraftId(d?.id || null); setSel(new Set(d?.ids || [])); d && (setSection(d.section || 'related'), setStyle(d.style || 'latex')) }}>
          <option value="">New draft</option>{state.drafts.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
        </select>
        <button className="btn" onClick={() => { setDraftId(null); setSel(new Set()) }}><Plus size={14} /> New</button>
      </Head>
      <div className="grid g2">
        <div className="card" style={{ alignSelf: 'start' }}>
          <div className="row between"><h3 style={{ margin: 0 }}>1 · Pick sources ({sel.size})</h3>
            <span className="row"><button className="btn sm" onClick={() => setSel(new Set([...sel, ...shown.map(h => h.id)]))}>Select shown</button><button className="btn sm ghost" onClick={() => setSel(new Set())}>Clear</button></span></div>
          <div className="row wrap" style={{ margin: '10px 0' }}>
            <div className="search grow"><Search size={14} /><input placeholder="Filter notes…" value={q} onChange={e => setQ(e.target.value)} /></div>
            <select className="input" style={{ width: 'auto', maxWidth: 200 }} value={paper} onChange={e => setPaper(e.target.value)}><option value="">All papers</option>{[...new Set(hs.map(h => h.paperId).filter(Boolean))].map(id => <option key={id} value={id}>{titleOf(id)}</option>)}</select>
          </div>
          {!hs.length && <div className="empty">No highlights yet — highlight passages in your PDFs or add notes in the Notebook, then come back to write.</div>}
          <div className="stack" style={{ maxHeight: '58vh', overflowY: 'auto' }}>{shown.map(h => (
            <label key={h.id} className="row small" style={{ alignItems: 'flex-start', cursor: 'pointer', borderLeft: `5px solid ${KINDS[h.kind].color}`, paddingLeft: 8 }}>
              <input type="checkbox" checked={sel.has(h.id)} onChange={() => toggle(h.id)} style={{ marginTop: 3 }} />
              <span><span className="mono tiny muted">{titleOf(h.paperId) || 'Own note'}{h.page ? ` · p.${h.page}` : ''}</span><br />{hlTitle(h).slice(0, 180)}{h.note && <span className="muted"> — {h.note.slice(0, 80)}</span>}</span>
            </label>))}
          </div>
        </div>
        <div className="stack">
          <div className="card">
            <h3>2 · Generate</h3>
            <div className="row wrap">
              <select className="input" style={{ width: 'auto' }} value={section} onChange={e => setSection(e.target.value)}>{Object.entries(SECTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <select className="input" style={{ width: 'auto' }} value={style} onChange={e => setStyle(e.target.value)}>{Object.entries(STYLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <button className="btn violet" disabled={busy || !sel.size} onClick={generate}>{busy ? <span className="spinner" /> : <Sparkles size={14} />} Write draft</button>
              <AiBadge />
            </div>
            <p className="muted tiny" style={{ marginBottom: 0 }}>{sel.size} notes from {cited.length} papers. Without a Claude key you get a structured, cited scaffold to edit.</p>
            {error && <p className="small" style={{ color: 'var(--red)' }}>{error}</p>}
          </div>
          <div className="card">
            <div className="row between"><h3 style={{ margin: 0 }}>3 · Edit & export</h3>
              {draft && <input className="input small" style={{ width: 200, padding: '4px 8px' }} value={draft.title} onChange={e => dispatch({ type: 'saveDraft', draft: { id: draft.id, title: e.target.value } })} />}</div>
            <textarea className="input mono small" style={{ minHeight: 360, marginTop: 10 }} placeholder="Your draft appears here — edit freely, it saves automatically." value={body} onChange={e => saveBody(e.target.value)} />
            <div className="row wrap" style={{ marginTop: 10 }}>
              <button className="btn sm" disabled={!body} onClick={() => navigator.clipboard.writeText(body).then(() => toast('Copied'))}><Copy size={13} /> Copy</button>
              <button className="btn sm" disabled={!body} onClick={() => download(`${draft?.title || 'draft'}.md`, body)}><Download size={13} /> .md</button>
              <button className="btn sm" disabled={!body} onClick={() => download(`${draft?.title || 'draft'}.tex`, `\\section{${SECTIONS[section]}}\n${body.replace(/^## .*\n/, '').replace(/\*\*(.+?)\*\*/g, '\\textbf{$1}').replace(/\*(.+?)\*/g, '\\emph{$1}').replace(/“|”/g, '"')}\n\n\\bibliographystyle{plain}\n\\bibliography{references}\n`)}><PenLine size={13} /> .tex</button>
              <button className="btn sm" disabled={!cited.length} onClick={() => download('references.bib', toBibtex(cited))}><Download size={13} /> references.bib ({cited.length})</button>
              {draft && <button className="btn sm" onClick={() => confirm('Delete this draft?') && (dispatch({ type: 'deleteDraft', id: draft.id }), setDraftId(null))}><Trash2 size={13} /></button>}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
