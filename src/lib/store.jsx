import { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react'
import { SEED_PAPERS } from '../data/seed.js'
import { buildIndex } from './nlp.js'
import { normSpec } from './reproduce.js'
import { normBuild } from './autobuild.js'
import { SHARED, startEngine, schedulePush, getAuth, useSync } from './sync.js'

const KEY = 'ai-research-os/v1'
const uid = () => Math.random().toString(36).slice(2, 9)
export const CONCEPT_COLORS = { Memory: '#d4f53c', 'LLM Agents': '#8b5cf6', RAG: '#3b82f6', 'Tool Use': '#a78bfa', Planning: '#f4f4f0', Reasoning: '#fbbf24', 'Long Context': '#f472b6', Compression: '#34d399', 'Multi-Agent': '#60a5fa', Graph: '#fb923c', Evaluation: '#94a3b8', Survey: '#e5e7eb', OS: '#c4b5fd', Retrieval: '#93c5fd' }

function defaultCanvas() {
  const concepts = ['Memory', 'LLM Agents', 'RAG', 'Tool Use', 'Planning', 'Reasoning', 'Long Context']
  const nodes = concepts.map((c, i) => {
    const a = (i / concepts.length) * Math.PI * 2
    return { id: `c:${c}`, label: c, kind: 'concept', x: 420 + Math.cos(a) * 230, y: 260 + Math.sin(a) * 170, color: CONCEPT_COLORS[c] }
  })
  nodes.push({ id: 'p:2310.08560', label: 'MemGPT', kind: 'paper', paperId: '2310.08560', x: 430, y: 270, color: '#8b5cf6' })
  const edges = [['c:Memory', 'p:2310.08560'], ['c:LLM Agents', 'p:2310.08560'], ['c:Memory', 'c:RAG'], ['c:RAG', 'c:LLM Agents'], ['c:LLM Agents', 'c:Tool Use'], ['c:Planning', 'c:Reasoning'], ['c:Tool Use', 'c:Planning'], ['c:Memory', 'c:Long Context'], ['c:Reasoning', 'c:LLM Agents']]
    .map(([a, b]) => ({ id: uid(), from: a, to: b }))
  return { nodes, edges }
}

// The demo library is opt-in: new users start empty and build their own from the welcome card.
const SAMPLE_IDS = new Set(SEED_PAPERS.map(p => p.id))
const SAMPLE_STARRED = new Set(SEED_PAPERS.filter(p => p.starred).map(p => p.id))
const DEMO_PEOPLE = new Set(['Priya Sharma', 'Rahul Verma', 'Priya', 'Rahul'])
export const sample = () => ({
  papers: SEED_PAPERS.map(p => ({ ...p, sample: true })),
  collections: [
    { id: 'agents', name: 'AI Agents', paperIds: SEED_PAPERS.filter(p => p.tags.includes('LLM Agents')).map(p => p.id) },
    { id: 'memory', name: 'Memory', paperIds: SEED_PAPERS.filter(p => p.tags.includes('Memory')).map(p => p.id) },
    { id: 'rag', name: 'RAG', paperIds: SEED_PAPERS.filter(p => p.tags.includes('RAG')).map(p => p.id) },
  ],
  recent: ['2310.08560', '2201.11903', '2404.13501', '2304.03442'],
  canvas: defaultCanvas(),
})
// A sample paper counts as untouched if the user never annotated, read, re-starred or built on it.
export const untouchedSample = s => s.papers.filter(p => SAMPLE_IDS.has(p.id) && !p.hasPdf && !p.status && !s.notes?.[p.id] && !!p.starred === SAMPLE_STARRED.has(p.id)
  && !s.highlights.some(h => h.paperId === p.id) && !s.projects?.some(x => x.source?.paperId === p.id))

const initial = () => ({
  papers: [],
  collections: [],
  notes: {},
  recent: [],
  canvas: { nodes: [], edges: [] },
  hypotheses: [],
  // Highlights from the PDF reader plus manual entries. kind: important | idea | question | term.
  // Terms form the dictionary; box/due drive Leitner-style flashcard review.
  highlights: [],
  drafts: [], // Writing Studio drafts
  projects: [], // Reproduce Lab: { id, title, source, mode, spec, steps, chat, createdAt }
  review: { streak: 0, last: '', log: {} }, // daily flashcard streak; log = { 'YYYY-MM-DD': cards }
  chat: [],
  // Topic alerts: followed arXiv topics/authors, the latest matches, and ids already shown or dismissed.
  alerts: { topics: [], authors: [], lastRun: 0, items: [], seen: [] },
  readLog: {}, // pages read per day: { 'YYYY-MM-DD': n }
  members: [{ id: 'me', name: '', role: 'Owner', you: true }],
  activity: [],
  settings: { name: '', email: '', autoSummarize: true, autoCluster: true, gapAlerts: true, weeklyDigest: false, darkMode: false, defaultView: 'canvas', apiKey: '', model: 'claude-sonnet-5-5', notifyEmail: true, notifyApp: true, shareAnalytics: false, reminder: true, reminderTime: '09:00', readingGoal: '', keyNudgeHidden: false, provider: 'anthropic', openaiKey: '', openaiModel: 'gpt-4.1-mini', zoteroUser: '', zoteroKey: '', s2Key: '' },
})

const str = v => (typeof v === 'string' ? v : '')
const arr = v => (Array.isArray(v) ? v : [])
const normAlerts = x => {
  const a = x && typeof x === 'object' ? x : {}, strs = v => (Array.isArray(v) ? v.filter(t => typeof t === 'string') : [])
  return { topics: strs(a.topics), authors: strs(a.authors), lastRun: Number(a.lastRun) || 0, seen: strs(a.seen).slice(-1000), items: Array.isArray(a.items) ? a.items.filter(i => i && i.paper && typeof i.paper.id === 'string' && typeof i.paper.title === 'string') : [] }
}
export const dayKey = (t = Date.now()) => new Date(t).toLocaleDateString('en-CA')

// Coerces the shared parts of a workspace (from a file or a sync server) to the shapes the app expects.
export function sanitizeDoc(d) {
  const papers = arr(d.papers).filter(p => p && typeof p.id === 'string' && typeof p.title === 'string').map(p => ({
    ...p, arxiv: str(p.arxiv) || p.id, abstract: str(p.abstract), method: str(p.method), dataset: str(p.dataset), finding: str(p.finding), limitation: str(p.limitation), venue: str(p.venue),
    year: Number(p.year) || 0, citations: Number(p.citations) || 0,
    authors: arr(p.authors).map(String), tags: arr(p.tags).map(String),
    status: ['toread', 'reading', 'done'].includes(p.status) ? p.status : undefined,
  }))
  const highlights = arr(d.highlights).filter(h => h && typeof h.id === 'string').map(h => ({
    ...h, text: str(h.text), note: str(h.note), term: str(h.term), definition: str(h.definition), kind: ['important', 'idea', 'question', 'term'].includes(h.kind) ? h.kind : 'important',
    page: Number(h.page) || 0, box: Number(h.box) || 0, due: Number(h.due) || Date.now(), createdAt: Number(h.createdAt) || Date.now(),
    tags: arr(h.tags).map(String), rects: arr(h.rects).filter(r => r && [r.x, r.y, r.w, r.h].every(Number.isFinite)),
  }))
  const out = { papers, highlights }
  if ('collections' in d) out.collections = arr(d.collections).filter(c => c && typeof c.id === 'string').map(c => ({ id: c.id, name: str(c.name), paperIds: arr(c.paperIds).map(String) }))
  if ('drafts' in d) out.drafts = arr(d.drafts).filter(x => x && typeof x.id === 'string').map(x => ({ ...x, title: str(x.title), body: str(x.body) }))
  if ('projects' in d) out.projects = arr(d.projects).filter(x => x && typeof x.id === 'string' && x.spec && typeof x.spec === 'object').map(x => ({ ...x, title: str(x.title), spec: normSpec(x.spec), build: normBuild(x.build), steps: arr(x.steps).filter(t => t && typeof t.id === 'string'), chat: arr(x.chat) }))
  if ('hypotheses' in d) out.hypotheses = arr(d.hypotheses).filter(x => x && typeof x.id === 'string')
  if ('activity' in d) out.activity = arr(d.activity).filter(x => x && typeof x.id === 'string').map(x => ({ ...x, who: str(x.who) || '?', text: str(x.text), at: Number(x.at) || 0 }))
  if (d.notes && typeof d.notes === 'object') out.notes = Object.fromEntries(Object.entries(d.notes).map(([k, v]) => [k, str(v)]))
  if (d.canvas && typeof d.canvas === 'object') out.canvas = { nodes: arr(d.canvas.nodes).filter(n => n && typeof n.id === 'string' && Number.isFinite(n.x) && Number.isFinite(n.y)), edges: arr(d.canvas.edges).filter(e => e && typeof e.from === 'string') }
  return out
}

function reducer(s, a) {
  const log = text => [{ id: uid(), who: s.settings.name || 'You', text, at: Date.now() }, ...s.activity].slice(0, 50)
  switch (a.type) {
    case 'addPapers': {
      const fresh = a.papers.filter(p => !s.papers.some(x => x.id === p.id))
      return { ...s, papers: [...fresh, ...s.papers], activity: fresh.length ? log(`added ${fresh.length} paper${fresh.length > 1 ? 's' : ''}`) : s.activity }
    }
    case 'updatePaper': return { ...s, papers: s.papers.map(p => p.id !== a.id ? p : { ...p, ...a.patch, ...(a.patch.status === 'done' && p.status !== 'done' ? { doneAt: Date.now() } : {}) }) }
    case 'alerts': return { ...s, alerts: { ...s.alerts, ...a.patch } }
    case 'deletePaper': return { ...s, papers: s.papers.filter(p => p.id !== a.id), highlights: s.highlights.filter(h => h.paperId !== a.id), collections: s.collections.map(c => ({ ...c, paperIds: c.paperIds.filter(id => id !== a.id) })) }
    case 'toggleStar': return { ...s, papers: s.papers.map(p => p.id === a.id ? { ...p, starred: !p.starred } : p) }
    case 'viewPaper': return { ...s, recent: [a.id, ...s.recent.filter(id => id !== a.id)].slice(0, 12) }
    case 'addCollection': return { ...s, collections: [...s.collections, { id: uid(), name: a.name, paperIds: [] }], activity: log(`created collection “${a.name}”`) }
    // Imported collections (e.g. from Zotero) merge into an existing collection with the same name.
    case 'upsertCollections': {
      let cs = [...s.collections]
      for (const c of a.collections) {
        const ex = cs.find(x => x.name === c.name)
        cs = ex ? cs.map(x => x === ex ? { ...x, paperIds: [...new Set([...x.paperIds, ...c.paperIds])] } : x) : [...cs, { id: uid(), name: c.name, paperIds: c.paperIds }]
      }
      return { ...s, collections: cs }
    }
    case 'deleteCollection': return { ...s, collections: s.collections.filter(c => c.id !== a.id) }
    case 'toggleInCollection': return { ...s, collections: s.collections.map(c => c.id !== a.collectionId ? c : { ...c, paperIds: c.paperIds.includes(a.paperId) ? c.paperIds.filter(x => x !== a.paperId) : [...c.paperIds, a.paperId] }) }
    case 'setNote': return { ...s, notes: { ...s.notes, [a.id]: a.text } }
    case 'setCanvas': return { ...s, canvas: a.canvas }
    case 'resetCanvas': return { ...s, canvas: defaultCanvas() }
    case 'addToCanvas': {
      const nodes = [...s.canvas.nodes], edges = [...s.canvas.edges]
      for (const n of a.nodes) if (!nodes.some(x => x.id === n.id)) nodes.push(n)
      for (const e of a.edges || []) if (!edges.some(x => x.from === e.from && x.to === e.to)) edges.push({ id: uid(), ...e })
      return { ...s, canvas: { nodes, edges } }
    }
    case 'saveHypothesis': return { ...s, hypotheses: [{ id: uid(), at: Date.now(), ...a.h }, ...s.hypotheses], activity: log('created a new hypothesis') }
    case 'deleteHypothesis': return { ...s, hypotheses: s.hypotheses.filter(h => h.id !== a.id) }
    case 'addHighlight': return { ...s, highlights: [{ id: uid(), createdAt: Date.now(), box: 0, due: Date.now(), tags: [], note: '', ...a.h }, ...s.highlights], activity: log(a.h.kind === 'term' ? `added “${a.h.term}” to the dictionary` : 'saved a highlight') }
    case 'updateHighlight': return { ...s, highlights: s.highlights.map(h => h.id === a.id ? { ...h, ...a.patch } : h) }
    case 'deleteHighlight': return { ...s, highlights: s.highlights.filter(h => h.id !== a.id) }
    case 'reviewHighlight': {
      // Leitner boxes: remembered → next box (1, 3, 7, 16, 35 days); forgot → back to box 0, due now.
      const DAYS = [1, 3, 7, 16, 35]
      const today = dayKey(), r = s.review || initial().review
      const streak = r.last === today ? r.streak : r.last === dayKey(Date.now() - 864e5) ? r.streak + 1 : 1
      return { ...s, review: { streak, last: today, log: { ...r.log, [today]: (r.log[today] || 0) + 1 } }, highlights: s.highlights.map(h => {
        if (h.id !== a.id) return h
        const box = a.remembered ? Math.min((h.box || 0) + 1, DAYS.length - 1) : 0
        return { ...h, box, due: Date.now() + (a.remembered ? DAYS[box] * 864e5 : 0), reviewedAt: Date.now() }
      }) }
    }
    case 'readPos': {
      // Only pages beyond the furthest one reached count as newly read.
      const p0 = s.papers.find(p => p.id === a.id), fresh = Math.max(0, a.page - (p0?.readMax || 0)), day = dayKey()
      const readLog = fresh ? { ...s.readLog, [day]: (s.readLog?.[day] || 0) + fresh } : s.readLog
      return { ...s, readLog, papers: s.papers.map(p => p.id !== a.id ? p : {
      ...p, readPos: { page: a.page, scale: a.scale }, readMax: Math.max(p.readMax || 0, a.page), pages: a.pages || p.pages, lastReadAt: Date.now(),
      status: !p.status || p.status === 'toread' ? 'reading' : p.status,
    }) }
    }
    case 'saveDraft': return a.draft.id && s.drafts.some(d => d.id === a.draft.id)
      ? { ...s, drafts: s.drafts.map(d => d.id === a.draft.id ? { ...d, ...a.draft, updatedAt: Date.now() } : d) }
      : { ...s, drafts: [{ ...a.draft, id: a.draft.id || uid(), updatedAt: Date.now() }, ...s.drafts], activity: log('started a writing draft') }
    case 'saveProject': return s.projects.some(p => p.id === a.project.id)
      ? { ...s, projects: s.projects.map(p => p.id === a.project.id ? { ...p, ...a.project, updatedAt: Date.now() } : p) }
      : { ...s, projects: [{ ...a.project, createdAt: Date.now(), updatedAt: Date.now() }, ...s.projects], activity: log(`started a Reproduce Lab project: ${a.project.title.slice(0, 60)}`) }
    case 'deleteProject': return { ...s, projects: s.projects.filter(p => p.id !== a.id) }
    case 'deleteDraft': return { ...s, drafts: s.drafts.filter(d => d.id !== a.id) }
    // Sync: replace shared collections with a merged copy from the server (already sanitized).
    case 'merge': return { ...s, ...a.doc }
    case 'chat': return { ...s, chat: [...s.chat, a.msg].slice(-60) }
    case 'clearChat': return { ...s, chat: [] }
    case 'invite': return { ...s, members: [...s.members, { id: uid(), name: a.name, role: a.role }], activity: log(`invited ${a.name}`) }
    case 'setRole': return { ...s, members: s.members.map(m => m.id === a.id ? { ...m, role: a.role } : m) }
    case 'removeMember': return { ...s, members: s.members.filter(m => m.id !== a.id) }
    case 'log': return { ...s, activity: log(a.text) }
    case 'settings': return { ...s, settings: { ...s.settings, ...a.patch } }
    case 'import': {
      // Imported files are untrusted: keep our own secrets and coerce fields to expected types.
      const { apiKey, openaiKey, zoteroKey, s2Key, ...settings } = a.state.settings || {}
      return { ...initial(), ...a.state, ...sanitizeDoc(a.state), settings: { ...initial().settings, ...settings, apiKey: s.settings.apiKey, openaiKey: s.settings.openaiKey, zoteroKey: s.settings.zoteroKey, s2Key: s.settings.s2Key } }
    }
    case 'reset': return initial()
    case 'loadSample': {
      const x = sample(), have = new Set(s.papers.map(p => p.id))
      const canvas = s.canvas.nodes.length ? s.canvas : x.canvas
      const collections = [...s.collections, ...x.collections.filter(c => !s.collections.some(y => y.name === c.name))]
      return { ...s, papers: [...s.papers, ...x.papers.filter(p => !have.has(p.id))], collections, canvas, recent: s.recent.length ? s.recent : x.recent, activity: log('loaded the sample library') }
    }
    case 'removeSample': {
      const gone = new Set(untouchedSample(s).map(p => p.id))
      const nodes = s.canvas.nodes.filter(n => !(n.paperId && gone.has(n.paperId)))
      const keep = new Set(nodes.map(n => n.id))
      return { ...s,
        papers: s.papers.filter(p => !gone.has(p.id)),
        collections: s.collections.map(c => ({ ...c, paperIds: c.paperIds.filter(id => !gone.has(id)) })).filter(c => c.paperIds.length || !['agents', 'memory', 'rag'].includes(c.id)),
        canvas: { nodes, edges: s.canvas.edges.filter(e => keep.has(e.from) && keep.has(e.to)) },
        recent: s.recent.filter(id => !gone.has(id)),
        members: s.members.filter(m => !DEMO_PEOPLE.has(m.name)).map(m => (m.you && m.name === 'Arjun' ? { ...m, name: s.settings.name === 'Arjun' ? '' : s.settings.name } : m)),
        activity: s.activity.filter(x => !DEMO_PEOPLE.has(x.who)),
        settings: s.settings.name === 'Arjun' ? { ...s.settings, name: '' } : s.settings,
      }
    }
    default: return s
  }
}

const Ctx = createContext(null)

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, null, () => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY))
      // Saved state may be from an older version or damaged: coerce it like any imported workspace.
      if (saved && typeof saved === 'object' && saved.papers) {
        const base = initial()
        const settings = saved.settings && typeof saved.settings === 'object' ? saved.settings : {}
        const keep = k => (Array.isArray(saved[k]) ? { [k]: saved[k] } : {})
        return { ...base, ...keep('recent'), ...(Array.isArray(saved.chat) ? { chat: saved.chat.filter(m => m && typeof m.text === 'string') } : {}), ...keep('members'), ...sanitizeDoc(saved), review: saved.review && typeof saved.review === 'object' ? { ...base.review, ...saved.review } : base.review, alerts: normAlerts(saved.alerts), readLog: saved.readLog && typeof saved.readLog === 'object' ? Object.fromEntries(Object.entries(saved.readLog).filter(([, n]) => Number.isFinite(n))) : {}, settings: { ...base.settings, ...settings, setupBusy: false } }
      }
    } catch {}
    return initial()
  })
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)) } catch (e) { console.warn('Workspace not saved — browser storage full?', e) }
  }, [state])
  useEffect(() => { document.documentElement.dataset.theme = state.settings.darkMode ? 'dark' : 'light' }, [state.settings.darkMode])
  const index = useMemo(() => buildIndex(state.papers), [state.papers])
  const value = useMemo(() => ({ state, dispatch, index }), [state, index])
  return <Ctx.Provider value={value}><SyncBridge state={state} dispatch={dispatch} />{children}</Ctx.Provider>
}

// Connects the store to the sync engine: starts it per workspace and pushes shared changes.
function SyncBridge({ state, dispatch }) {
  const ref = useRef(state)
  ref.current = state
  useSync()
  const ws = getAuth()?.workspace?.id
  useEffect(() => { startEngine(() => ref.current, doc => dispatch({ type: 'merge', doc: sanitizeDoc(doc) })) }, [ws])
  useEffect(() => { schedulePush() }, SHARED.map(k => state[k]))
  return null
}

export const useStore = () => useContext(Ctx)
export { uid }
