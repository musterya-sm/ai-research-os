import { useMemo, useState } from 'react'
import { FlaskConical, Sparkles, Trash2, Download, Code2, Check, ChevronLeft, ChevronRight, Lightbulb, FileText, Plus, Send, AlertTriangle, Github, Compass, Map as MapIcon, Bot, Play, FileCode, Wrench, ClipboardPaste, Package, BookOpen, Share2 } from 'lucide-react'
import { Head, AiBadge, Prose, nav, toast, useAI, ago } from '../components/ui.jsx'
import { useStore } from '../lib/store.jsx'
import { download } from '../lib/exporter.js'
import { copyShare, shareProject } from '../lib/share.js'
import { search } from '../lib/nlp.js'
import { generateCodebase, fixFiles, localCodebase, toNotebook, zip, checkCode, parseResults } from '../lib/autobuild.js'
import { extractSpec, planForPaper, specForIdea, planForIdea, specPrompt, ideaPrompt, parseAI, scaffold, planMarkdown, delta, verdict, localMentor, mentorPrompt, normSpec, rid } from '../lib/reproduce.js'

const MODES = {
  guide: ['Guide me', 'One step at a time with hints and check-yourself questions. The mentor teaches instead of handing over answers.', Compass],
  plan: ['Plan it for me', 'The full plan, settings and a code scaffold up front. The mentor gives direct answers.', MapIcon],
  build: ['Build it for me', 'The platform writes the whole codebase, checks it, and packages it to run on a free GPU. You bring back the numbers.', Bot],
}
const VERDICT = { match: ['Reproduced', 'var(--lime)'], above: ['Above paper', '#93c5fd'], below: ['Below paper', '#fca5a5'] }

export default function Lab({ arg, sub }) {
  const { state } = useStore()
  const project = state.projects.find(p => p.id === arg)
  if (project) return <Project project={project} />
  return <Start preset={arg === 'new' ? sub : ''} />
}

function Start({ preset }) {
  const { state, dispatch, index } = useStore()
  const [kind, setKind] = useState(preset?.startsWith('hyp:') ? 'idea' : 'paper')
  const [paperId, setPaperId] = useState(preset?.startsWith('paper:') ? decodeURIComponent(preset.slice(6)) : '')
  const [idea, setIdea] = useState(() => state.hypotheses.find(h => `hyp:${h.id}` === preset)?.text || '')
  const [mode, setMode] = useState('guide')
  const { run, busy, error } = useAI()
  const papers = [...state.papers].sort((a, b) => (b.hasPdf ? 1 : 0) - (a.hasPdf ? 1 : 0) || b.year - a.year)
  const paper = state.papers.find(p => p.id === paperId)

  async function create() {
    let project
    if (kind === 'paper') {
      if (!paper) return toast('Pick a paper')
      const spec = extractSpec(paper), steps = planForPaper(paper, spec)
      const out = await run({ prompt: specPrompt(paper), maxTokens: 3000, fallback: () => '' })
      project = { id: rid(), title: paper.title, source: { type: 'paper', paperId: paper.id }, mode, ...parseAI(out || '', spec, steps), chat: [] }
    } else {
      if (idea.trim().length < 10) return toast('Describe the idea in a sentence or two')
      const spec = specForIdea(idea.trim(), state.papers, index), steps = planForIdea(idea.trim(), spec)
      const related = search(index, idea, 5).map(r => r.paper)
      const out = await run({ prompt: ideaPrompt(idea.trim(), related), maxTokens: 3000, fallback: () => '' })
      const r = parseAI(out || '', spec, steps)
      project = { id: rid(), title: shortTitle(idea), source: { type: 'idea', idea: idea.trim() }, mode, ...r, spec: { ...r.spec, related: spec.related }, chat: [] }
    }
    dispatch({ type: 'saveProject', project })
    nav(`/lab/${project.id}`)
  }

  return (
    <>
      <Head n={19} title="Reproduce Lab" sub="Recreate a paper or turn an idea into an experiment, guided step by step" violet />
      <div className="grid g2">
        <div className="card" data-tour="lab-new">
          <h3>Start a project</h3>
          <div className="tabs">{[['paper', 'Reproduce a paper'], ['idea', 'Build my idea']].map(([k, l]) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>)}</div>
          {kind === 'paper' ? <>
            <select className="input" value={paperId} onChange={e => setPaperId(e.target.value)}>
              <option value="">Choose a paper from your library…</option>
              {papers.map(p => <option key={p.id} value={p.id}>{p.hasPdf ? '📄 ' : ''}{p.title.slice(0, 90)} ({p.year})</option>)}
            </select>
            <p className="muted tiny">📄 = full PDF uploaded. With the PDF, the Lab reads the actual hyperparameters, datasets and results. Without it, it works from the abstract.</p>
          </> : <>
            <textarea className="input" rows={4} placeholder="e.g. Agents that summarise their own memory every N turns will answer long-conversation questions better than MemGPT-style paging." value={idea} onChange={e => setIdea(e.target.value)} />
            {!!state.hypotheses.length && <select className="input" style={{ marginTop: 8 }} value="" onChange={e => e.target.value && setIdea(e.target.value)}>
              <option value="">…or start from a saved hypothesis</option>{state.hypotheses.map(h => <option key={h.id} value={h.text}>{h.text.slice(0, 100)}</option>)}
            </select>}
          </>}
          <div className="label" style={{ margin: '14px 0 6px' }}>How should the AI help?</div>
          <div className="grid g3" style={{ gap: 10 }}>{Object.entries(MODES).map(([k, [label, desc, Icon]]) => (
            <button key={k} type="button" className="list-item" style={{ textAlign: 'left', background: mode === k ? 'var(--soft)' : null, borderColor: mode === k ? 'var(--violet)' : null }} onClick={() => setMode(k)}>
              <Icon size={18} /><span><div className="t">{label}</div><div className="small muted">{desc}</div></span>
            </button>))}
          </div>
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn violet" disabled={busy} onClick={create}>{busy ? <span className="spinner" /> : <FlaskConical size={14} />} {busy ? 'Reading the paper…' : 'Create plan'}</button>
            <AiBadge />
          </div>
          {error && <p className="small" style={{ color: 'var(--red)' }}>{error}</p>}
        </div>
        <div className="card">
          <h3>Your projects ({state.projects.length})</h3>
          {!state.projects.length && <div className="empty">No projects yet. Pick a paper you want to recreate, or describe an idea you want to test.</div>}
          <div className="stack">{state.projects.map(p => {
            const done = p.steps.filter(s => s.done).length
            return (
              <div key={p.id} className="list-item" onClick={() => nav(`/lab/${p.id}`)}>
                {p.source.type === 'paper' ? <FileText size={18} /> : <Lightbulb size={18} />}
                <div className="grow">
                  <div className="t">{p.title}</div>
                  <div className="row small muted"><span className="tag">{p.source.type === 'paper' ? 'Reproduction' : 'Idea'}</span><span className="tag">{MODES[p.mode]?.[0]}</span>{done}/{p.steps.length} steps · {ago(p.updatedAt || p.createdAt)}</div>
                  <Bar v={done / (p.steps.length || 1)} />
                </div>
              </div>)
          })}</div>
        </div>
      </div>
    </>
  )
}

// First sentence, cut at a word boundary.
const shortTitle = t => { const f = t.trim().split(/[.?!\n]/)[0]; return f.length <= 80 ? f : `${f.slice(0, 80).replace(/\s+\S*$/, '')}…` }

const Bar = ({ v }) => <div style={{ height: 5, background: 'var(--soft)', marginTop: 6 }}><div style={{ height: 5, width: `${v * 100}%`, background: 'var(--violet)' }} /></div>

function Project({ project }) {
  const { state, dispatch } = useStore()
  const spec = useMemo(() => normSpec(project.spec), [project.spec])
  const p = { ...project, spec }
  const paper = state.papers.find(x => x.id === project.source.paperId)
  const save = patch => dispatch({ type: 'saveProject', project: { id: project.id, ...patch } })
  const setStep = (id, patch) => save({ steps: project.steps.map(s => s.id === id ? { ...s, ...patch } : s) })
  const setSpec = patch => save({ spec: { ...spec, ...patch } })
  const done = project.steps.filter(s => s.done).length
  const [cur, setCur] = useState(() => Math.max(0, project.steps.findIndex(s => !s.done)))
  const { run, busy } = useAI()
  const [tab, setTab] = useState(project.mode === 'build' ? 'build' : 'steps')

  async function regenerate() {
    if (!paper && project.source.type === 'paper') return toast('The paper is no longer in your library')
    const out = await run({ prompt: paper ? specPrompt(paper) : ideaPrompt(spec.summary, (spec.related || []).map(r => state.papers.find(x => x.id === r.id)).filter(Boolean)), maxTokens: 3000, fallback: () => '' })
    if (!out) return toast('Add a Claude API key in Settings to regenerate with AI')
    const r = parseAI(out, spec, project.steps)
    save({ spec: { ...r.spec, related: spec.related }, steps: r.steps })
    setCur(0); toast('Plan regenerated')
  }

  return (
    <>
      <Head n={19} title="Reproduce Lab" sub={project.source.type === 'paper' ? 'Reproducing a paper' : 'Turning an idea into an experiment'} violet>
        <button className="btn" onClick={() => nav('/lab')}>← Projects</button>
        <select className="input" style={{ width: 'auto' }} value={project.mode} onChange={e => save({ mode: e.target.value })}>{Object.entries(MODES).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
        <button className="btn" disabled={busy} onClick={regenerate} title="Rebuild the plan with Claude">{busy ? <span className="spinner" /> : <Sparkles size={14} />}</button>
        <button className="btn" onClick={() => download(`${project.title.slice(0, 40)}-plan.md`, planMarkdown(p))} title="Export plan"><Download size={14} /> .md</button>
        <button className="btn" onClick={() => download('reproduce.py', scaffold(p))} title="Python scaffold"><Code2 size={14} /> .py</button>
        <button className="btn" title="Share a read-only link" onClick={() => copyShare(shareProject(state, p), toast)}><Share2 size={14} /></button>
        <button className="btn" onClick={() => confirm('Delete this project?') && (dispatch({ type: 'deleteProject', id: project.id }), nav('/lab'))}><Trash2 size={14} /></button>
      </Head>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div className="grow">
            <h2 style={{ margin: 0, fontSize: 20 }}>{project.title}</h2>
            {paper && <a className="small" href={`#/paper/${encodeURIComponent(paper.id)}`}>Open paper →</a>}
            {spec.summary !== project.source.idea && <p style={{ marginBottom: 0 }}>{spec.summary}</p>}
            {project.source.type === 'idea' && spec.summary === project.source.idea && project.title.endsWith('…') && <p style={{ marginBottom: 0 }}>{spec.summary}</p>}
          </div>
          <div style={{ minWidth: 150, textAlign: 'right' }}><div className="num" style={{ fontSize: 28 }}>{done}/{project.steps.length}</div><div className="muted tiny">steps done</div><Bar v={done / (project.steps.length || 1)} /></div>
        </div>
      </div>

      <div className="grid side-r">
        <div className="stack">
          <div className="tabs" style={{ marginBottom: 0 }}>{[['steps', project.mode === 'guide' ? 'Step by step' : 'Plan'], ['build', `Build it for me${project.build ? ` · ${Object.keys(project.build.files).length} files` : ''}`]].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
          {tab === 'build' ? <Build project={p} paper={paper} save={save} setSpec={setSpec} />
            : project.mode === 'guide'
            ? <Guide steps={project.steps} cur={Math.min(cur, project.steps.length - 1)} setCur={setCur} setStep={setStep} />
            : <PlanList steps={project.steps} setStep={setStep} />}
          <Scorecard spec={spec} setSpec={setSpec} idea={project.source.type === 'idea'} />
          <Mentor project={p} paper={paper} save={save} />
        </div>
        <SpecPanel spec={spec} setSpec={setSpec} paper={paper} />
      </div>
    </>
  )
}

function Guide({ steps, cur, setCur, setStep }) {
  const s = steps[cur]
  const [hint, setHint] = useState(false)
  if (!s) return null
  const go = i => { setCur(i); setHint(false) }
  return (
    <div className="card" data-tour="lab-steps">
      <div className="row between"><span className="label">Step {cur + 1} of {steps.length}</span>
        <span className="row" style={{ gap: 4 }}>{steps.map((x, i) => <button key={x.id} title={x.title} onClick={() => go(i)} style={{ width: 14, height: 14, border: '1.5px solid var(--line)', background: i === cur ? 'var(--violet)' : x.done ? 'var(--lime)' : 'var(--panel)', cursor: 'pointer', padding: 0 }} />)}</span></div>
      <h3 style={{ margin: '10px 0 6px', fontSize: 20 }}>{s.done && <Check size={18} style={{ color: 'var(--violet)' }} />} {s.title}</h3>
      <p>{s.detail}</p>
      {s.hint && (hint ? <div className="card flat small" style={{ background: 'var(--soft)' }}><b>Hint:</b> {s.hint}</div>
        : <button className="btn sm" onClick={() => setHint(true)}><Lightbulb size={13} /> Show hint</button>)}
      {s.check && <div className="small" style={{ marginTop: 12, borderLeft: '4px solid var(--lime)', paddingLeft: 10 }}><b>Check yourself:</b> {s.check}</div>}
      <textarea className="input small" rows={3} style={{ marginTop: 12 }} placeholder="Your notes for this step: commands, decisions, numbers…" value={s.note} onChange={e => setStep(s.id, { note: e.target.value })} />
      <div className="row between" style={{ marginTop: 12 }}>
        <button className="btn sm" disabled={!cur} onClick={() => go(cur - 1)}><ChevronLeft size={14} /> Back</button>
        <span className="row">
          <button className="btn sm" onClick={() => setStep(s.id, { done: !s.done })}>{s.done ? 'Mark not done' : 'Mark done'}</button>
          {cur < steps.length - 1 && <button className="btn sm violet" onClick={() => { setStep(s.id, { done: true }); go(cur + 1) }}>Done, next <ChevronRight size={14} /></button>}
        </span>
      </div>
    </div>
  )
}

function PlanList({ steps, setStep }) {
  const [open, setOpen] = useState(null)
  return (
    <div className="card" data-tour="lab-steps">
      <h3>Plan</h3>
      <div className="stack">{steps.map((s, i) => (
        <div key={s.id} style={{ borderBottom: '1.5px solid var(--soft)', paddingBottom: 8 }}>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <input type="checkbox" checked={s.done} onChange={() => setStep(s.id, { done: !s.done })} style={{ marginTop: 4 }} />
            <div className="grow" style={{ cursor: 'pointer' }} onClick={() => setOpen(open === s.id ? null : s.id)}>
              <b style={{ textDecoration: s.done ? 'line-through' : 'none' }}>{i + 1}. {s.title}</b>
              <div className="small">{s.detail}</div>
              {open === s.id && <>
                {s.hint && <div className="small muted" style={{ marginTop: 6 }}><b>Tip:</b> {s.hint}</div>}
                {s.check && <div className="small muted"><b>Check:</b> {s.check}</div>}
                <textarea className="input small" rows={2} style={{ marginTop: 6 }} placeholder="Notes…" value={s.note} onClick={e => e.stopPropagation()} onChange={e => setStep(s.id, { note: e.target.value })} />
              </>}
            </div>
          </div>
        </div>))}
      </div>
    </div>
  )
}

function Scorecard({ spec, setSpec, idea }) {
  const set = (i, patch) => setSpec({ metrics: spec.metrics.map((m, j) => j === i ? { ...m, ...patch } : m) })
  return (
    <div className="card" data-tour="lab-score">
      <div className="row between"><h3 style={{ margin: 0 }}>Results scorecard</h3><button className="btn sm" onClick={() => setSpec({ metrics: [...spec.metrics, { name: 'metric', paper: '', mine: '' }] })}><Plus size={13} /> Metric</button></div>
      <p className="muted tiny">{idea ? 'Baseline vs your method.' : 'Paper’s reported numbers vs yours. Within 2% relative counts as reproduced.'}</p>
      <table className="small" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr className="label"><td>Metric</td><td>{idea ? 'Baseline' : 'Paper'}</td><td>Mine</td><td>Δ</td><td /></tr></thead>
        <tbody>{spec.metrics.map((m, i) => {
          const v = VERDICT[verdict(m)], d = delta(m)
          return (
            <tr key={i}>
              <td><input className="input small" value={m.name} onChange={e => set(i, { name: e.target.value })} /></td>
              <td><input className="input small" style={{ width: 80 }} value={m.paper} placeholder="—" onChange={e => set(i, { paper: e.target.value })} /></td>
              <td><input className="input small" style={{ width: 80 }} value={m.mine} placeholder="yours" onChange={e => set(i, { mine: e.target.value })} /></td>
              <td className="mono">{d == null ? '' : `${d > 0 ? '+' : ''}${d}`} {v && <span className="tag" style={{ background: v[1], color: '#0d0d0d' }}>{v[0]}</span>}</td>
              <td><button className="star" onClick={() => setSpec({ metrics: spec.metrics.filter((_, j) => j !== i) })}><Trash2 size={12} /></button></td>
            </tr>)
        })}</tbody>
      </table>
    </div>
  )
}

function Mentor({ project, paper, save }) {
  const [q, setQ] = useState('')
  const { run, busy, error } = useAI()
  const chat = project.chat || []
  async function ask(text = q) {
    if (!text.trim()) return
    setQ('')
    const history = [...chat, { role: 'you', text, at: Date.now() }]
    save({ chat: history })
    const a = await run({ prompt: mentorPrompt({ question: text, project, paper, history }), maxTokens: 1500, fallback: () => localMentor({ question: text, project, paper }) })
    save({ chat: [...history, { role: 'mentor', text: a, at: Date.now() }].slice(-40) })
  }
  const quick = project.source.type === 'paper'
    ? ['My numbers are lower than the paper', 'Loss is NaN', 'What does the paper not say?', 'Explain the current step']
    : ['Is this idea novel enough?', 'What is the fastest experiment?', 'What could go wrong?', 'Explain the current step']
  return (
    <div className="card" data-tour="lab-mentor">
      <div className="row between"><h3 style={{ margin: 0 }}>Mentor</h3><AiBadge /></div>
      <p className="muted tiny">Knows your plan, your progress and notes{paper?.body ? ', and the paper’s full text' : ''}. {project.mode === 'guide' ? 'In Guide mode it teaches with hints rather than full answers.' : 'In Plan mode it answers directly.'}</p>
      <div className="stack" style={{ maxHeight: 380, overflowY: 'auto' }}>{chat.map((m, i) => (
        <div key={i} className={m.role === 'you' ? 'small' : 'card flat small'} style={m.role === 'you' ? { alignSelf: 'flex-end', background: 'var(--violet)', color: '#fff', padding: '6px 10px', maxWidth: '85%' } : { background: 'var(--soft)' }}>
          {m.role === 'you' ? m.text : <Prose text={m.text} />}
        </div>))}
      </div>
      <div className="row wrap" style={{ margin: '10px 0' }}>{quick.map(t => <button key={t} className="btn sm ghost" disabled={busy} onClick={() => ask(t)}>{t}</button>)}</div>
      <form className="row" onSubmit={e => { e.preventDefault(); ask() }}>
        <input className="input grow" placeholder="Stuck? Describe what you ran and what happened…" value={q} onChange={e => setQ(e.target.value)} />
        <button className="btn violet" disabled={busy}>{busy ? <span className="spinner" /> : <Send size={14} />}</button>
      </form>
      {error && <p className="small" style={{ color: 'var(--red)' }}>{error}</p>}
    </div>
  )
}

function Build({ project, paper, save, setSpec }) {
  const { state } = useStore()
  const live = !!state.settings.apiKey
  const b = project.build
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState([])
  const [file, setFile] = useState('run.py')
  const [problems, setProblems] = useState(null)
  const [paste, setPaste] = useState('')
  const say = t => setLog(l => [...l, t])
  const files = b?.files || {}
  const cur = files[file] != null ? file : Object.keys(files)[0]
  const slug = project.title.replace(/[^\w]+/g, '-').toLowerCase().slice(0, 40).replace(/-$/, '')

  async function generate() {
    if (b && !confirm('Replace the current codebase?')) return
    setBusy(true); setLog([]); setProblems(null)
    try {
      if (!live) { save({ build: { ...localCodebase(project), at: Date.now() } }); say('Template generated locally. Add a Claude API key in Settings to have the full implementation written for you.'); return }
      const out = await generateCodebase({ settings: state.settings, project, paper, log: say, save: part => save({ build: { ...part, at: Date.now(), partial: true } }) })
      save({ build: { ...out, at: Date.now() } })
      say('Done. Checking the code…')
      await check(out.files)
    } catch (e) { say(`Stopped: ${e.message}`) } finally { setBusy(false) }
  }
  async function check(fs = files) {
    setBusy(true)
    try { say('Loading Python in your browser…'); const p = await checkCode(fs); setProblems(p); say(Object.keys(p).length ? `Found problems in ${Object.keys(p).length} file(s)` : 'All files parse and every local import resolves ✓') } catch (e) { say(e.message) } finally { setBusy(false) }
  }
  async function fix(extra) {
    const probs = extra || problems
    if (!live) return toast('Fixing code needs a Claude API key (Settings)')
    setBusy(true)
    try {
      const out = await fixFiles({ settings: state.settings, project, paper, build: b, problems: probs, log: say })
      save({ build: { ...b, files: out, at: Date.now() } }); say('Fixed. Re-checking…')
      setBusy(false); await check(out)
    } catch (e) { say(e.message) } finally { setBusy(false) }
  }
  function importResults() {
    const r = parseResults(paste)
    if (!Object.keys(r).length) {
      if (live && /Traceback|Error/.test(paste)) {
        const path = paste.match(/File "(?:\/content\/)?([\w/.-]+\.py)"/g)?.map(x => x.match(/"(?:\/content\/)?([\w/.-]+\.py)"/)[1]).reverse().find(x => x in files)
        if (path && confirm(`That looks like an error from ${path}. Ask the AI to fix it?`)) return fix({ [path]: [`It crashed when run:\n${paste.slice(-3000)}`] })
      }
      return toast(`No ${'RESULTS_JSON'} line found in the pasted output`)
    }
    const norm = n => n.toLowerCase().replace(/[^a-z0-9@]/g, '')
    const metrics = project.spec.metrics.map(m => { const k = Object.keys(r).find(x => norm(x) === norm(m.name)); return k ? { ...m, mine: r[k] } : m })
    const extra = Object.keys(r).filter(k => !project.spec.metrics.some(m => norm(m.name) === norm(k))).map(k => ({ name: k, paper: '', mine: r[k] }))
    setSpec({ metrics: [...metrics.filter(m => m.name !== 'main metric' || m.mine || m.paper || !extra.length), ...extra] })
    setPaste(''); toast(`Imported ${Object.keys(r).length} result${Object.keys(r).length > 1 ? 's' : ''} into the scorecard`)
  }

  return (
    <div className="card" data-tour="lab-build">
      {!b && <>
        <h3>Let the platform recreate it</h3>
        <ol className="small" style={{ paddingLeft: 18, lineHeight: 1.7 }}>
          <li><b>Designs</b> the codebase from the paper: files, modules, dependencies.</li>
          <li><b>Writes every file</b>, each one aware of the files written before it, with the paper’s settings in <code>config.py</code> and every unstated choice marked <code># ASSUMPTION</code>.</li>
          <li><b>Reviews its own code</b> twice and rewrites what is broken, then <b>checks it in your browser</b> with real Python.</li>
          <li><b>Packages it</b> as a Colab notebook (free T4 GPU, one click: Run all) or a .zip. A 3-minute smoke test runs first.</li>
          <li>You <b>paste the output back</b>: the numbers fill the scorecard, and errors go to the AI to fix.</li>
        </ol>
        {!live && <p className="small" style={{ borderLeft: '4px solid #f59e0b', paddingLeft: 10 }}>Writing the full implementation needs a Claude API key (Settings → AI). Without one you get a structured template with every TODO laid out.</p>}
      </>}
      <div className="row wrap">
        <button className="btn violet" disabled={busy} onClick={generate}>{busy ? <span className="spinner" /> : <Bot size={14} />} {b ? 'Rebuild' : live ? 'Build the full codebase' : 'Generate template'}</button>
        {b && <>
          <button className="btn" disabled={busy} onClick={() => check()}><Play size={14} /> Check code</button>
          <button className="btn" onClick={() => download(`${slug}.ipynb`, toNotebook(project, b), 'application/x-ipynb+json')}><BookOpen size={14} /> Colab notebook</button>
          <button className="btn" onClick={() => { const url = URL.createObjectURL(zip(b.files, slug)); Object.assign(document.createElement('a'), { href: url, download: `${slug}.zip` }).click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }}><Package size={14} /> .zip</button>
        </>}
        <AiBadge />
      </div>
      {!!log.length && <div className="mono tiny" style={{ marginTop: 10, background: 'var(--soft)', padding: 8, maxHeight: 140, overflowY: 'auto' }}>{log.map((l, i) => <div key={i}>› {l}</div>)}</div>}
      {problems && !!Object.keys(problems).length && <div className="small build-problems" style={{ marginTop: 10, border: '2px solid #f59e0b', padding: 10 }}>
        {Object.entries(problems).map(([f, list]) => <div key={f}><b>{f}</b>{list.map((x, i) => <div key={i} className="mono tiny">• {x}</div>)}</div>)}
        <button className="btn sm violet" style={{ marginTop: 8 }} disabled={busy} onClick={() => fix()}><Wrench size={13} /> Fix with AI</button>
      </div>}
      {b && <>
        {b.plan?.notes && <p className="small muted" style={{ marginTop: 12 }}>{b.plan.notes}</p>}
        {b.partial && !busy && <p className="small" style={{ color: 'var(--red)' }}>This build was interrupted. Rebuild to finish it.</p>}
        <div className="grid" style={{ gridTemplateColumns: 'minmax(120px, 170px) 1fr', gap: 10, marginTop: 12 }}>
          <div className="stack" style={{ gap: 2 }}>{Object.keys(files).map(f => (
            <button key={f} className="mono tiny" style={{ textAlign: 'left', padding: '5px 8px', border: '1.5px solid var(--line)', background: f === cur ? 'var(--violet)' : 'var(--panel)', color: f === cur ? '#fff' : null, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis' }} onClick={() => setFile(f)}>
              <FileCode size={11} /> {f}{problems?.[f] ? ' ⚠' : ''}
            </button>))}
          </div>
          <textarea className="input mono tiny" spellCheck={false} style={{ minHeight: 420, whiteSpace: 'pre', overflow: 'auto', tabSize: 4 }} value={files[cur] || ''} onChange={e => save({ build: { ...b, files: { ...files, [cur]: e.target.value } } })} />
        </div>
        <div className="label" style={{ marginTop: 14 }}>Bring results back</div>
        <p className="muted tiny" style={{ marginTop: 2 }}>Paste the end of the notebook output. The RESULTS_JSON line fills your scorecard; a traceback is sent to the AI to fix the file it came from.</p>
        <textarea className="input mono tiny" rows={3} placeholder='RESULTS_JSON: {"accuracy": 91.8}' value={paste} onChange={e => setPaste(e.target.value)} />
        <button className="btn sm" style={{ marginTop: 6 }} disabled={!paste.trim() || busy} onClick={importResults}><ClipboardPaste size={13} /> Import</button>
      </>}
    </div>
  )
}

function SpecPanel({ spec, setSpec, paper }) {
  const setH = (i, patch) => setSpec({ hparams: spec.hparams.map((h, j) => j === i ? { ...h, ...patch } : h) })
  return (
    <div className="stack" data-tour="lab-spec" style={{ alignSelf: 'start' }}>
      <div className="card">
        <h3>What you need</h3>
        {!!spec.datasets.length && <><div className="label">Datasets</div><div style={{ marginBottom: 8 }}>{spec.datasets.map(d => <span key={d} className="tag">{d}</span>)}</div></>}
        {!!spec.models?.length && <><div className="label">Models</div><div style={{ marginBottom: 8 }}>{spec.models.map(d => <span key={d} className="tag">{d}</span>)}</div></>}
        {!!spec.components.length && <><div className="label">To build</div><div style={{ marginBottom: 8 }}>{spec.components.map(d => <span key={d} className="tag lime">{d}</span>)}</div></>}
        {spec.compute && <><div className="label">Compute</div><p className="small" style={{ marginTop: 2 }}>{spec.compute}</p></>}
        {!!spec.code.length && <><div className="label">Code</div>{spec.code.map(u => <div key={u} className="small"><a href={/^https:\/\//i.test(u) ? u : undefined} target="_blank" rel="noreferrer"><Github size={12} /> {u.replace(/^https?:\/\/(www\.)?github\.com\//, '')}</a></div>)}</>}
        {spec.baselines && <><div className="label" style={{ marginTop: 8 }}>Baselines</div><p className="small" style={{ marginTop: 2 }}>{spec.baselines}</p></>}
        {!!spec.related?.length && <><div className="label" style={{ marginTop: 8 }}>Closest papers</div>{spec.related.map(r => <div key={r.id} className="small"><a href={`#/paper/${encodeURIComponent(r.id)}`}>{r.title.split(':')[0]}</a> <span className="muted">{r.match}%</span></div>)}</>}
        {!paper?.body && !spec.related && <p className="muted tiny">Upload the PDF to this paper for exact hyperparameters, datasets and results.</p>}
      </div>
      <div className="card">
        <div className="row between"><h3 style={{ margin: 0 }}>Settings</h3><button className="btn sm" onClick={() => setSpec({ hparams: [...spec.hparams, { name: 'setting', value: '', evidence: '' }] })}><Plus size={13} /></button></div>
        {!spec.hparams.length && <p className="muted small">None found in the text. Add the ones you choose so they are recorded.</p>}
        {spec.hparams.map((h, i) => (
          <div key={i} className="row" style={{ marginTop: 6 }} title={h.evidence || 'Set by you'}>
            <input className="input small grow" value={h.name} onChange={e => setH(i, { name: e.target.value })} />
            <input className="input small mono" style={{ width: 90 }} value={h.value} onChange={e => setH(i, { value: e.target.value, evidence: h.evidence && e.target.value !== h.value ? '' : h.evidence })} />
            <span className="tag" style={{ background: h.evidence ? 'var(--lime)' : 'var(--panel)', color: h.evidence ? '#0d0d0d' : null }}>{h.evidence ? 'paper' : 'you'}</span>
          </div>))}
      </div>
      {!!spec.missing.length && <div className="card" style={{ borderColor: '#f59e0b' }}>
        <h3 className="row"><AlertTriangle size={16} /> Not in the paper</h3>
        <div className="stack small">{spec.missing.map((m, i) => <div key={i}>• {m}</div>)}</div>
      </div>}
    </div>
  )
}
