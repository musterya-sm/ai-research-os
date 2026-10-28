import { createContext, useContext, useEffect, useMemo, useReducer } from 'react'
import { SEED_PAPERS } from '../data/seed.js'
import { buildIndex } from './nlp.js'

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

const initial = () => ({
  papers: SEED_PAPERS,
  collections: [
    { id: 'agents', name: 'AI Agents', paperIds: SEED_PAPERS.filter(p => p.tags.includes('LLM Agents')).map(p => p.id) },
    { id: 'memory', name: 'Memory', paperIds: SEED_PAPERS.filter(p => p.tags.includes('Memory')).map(p => p.id) },
    { id: 'rag', name: 'RAG', paperIds: SEED_PAPERS.filter(p => p.tags.includes('RAG')).map(p => p.id) },
  ],
  notes: {},
  recent: ['2310.08560', '2201.11903', '2404.13501', '2304.03442'],
  canvas: defaultCanvas(),
  hypotheses: [],
  chat: [],
  members: [
    { id: 'me', name: 'Arjun', role: 'Owner', you: true },
    { id: uid(), name: 'Priya Sharma', role: 'Editor' },
    { id: uid(), name: 'Rahul Verma', role: 'Viewer' },
  ],
  activity: [
    { id: uid(), who: 'Priya', text: 'added 3 papers', at: Date.now() - 2 * 36e5 },
    { id: uid(), who: 'Rahul', text: 'commented on MemGPT paper', at: Date.now() - 5 * 36e5 },
    { id: uid(), who: 'Arjun', text: 'created a new hypothesis', at: Date.now() - 864e5 },
  ],
  settings: { name: 'Arjun', email: '', autoSummarize: true, autoCluster: true, gapAlerts: true, weeklyDigest: false, darkMode: false, defaultView: 'canvas', apiKey: '', model: 'claude-sonnet-5-5', notifyEmail: true, notifyApp: true, shareAnalytics: false },
})

function reducer(s, a) {
  const log = text => [{ id: uid(), who: s.settings.name || 'You', text, at: Date.now() }, ...s.activity].slice(0, 50)
  switch (a.type) {
    case 'addPapers': {
      const fresh = a.papers.filter(p => !s.papers.some(x => x.id === p.id))
      return { ...s, papers: [...fresh, ...s.papers], activity: fresh.length ? log(`added ${fresh.length} paper${fresh.length > 1 ? 's' : ''}`) : s.activity }
    }
    case 'updatePaper': return { ...s, papers: s.papers.map(p => p.id === a.id ? { ...p, ...a.patch } : p) }
    case 'deletePaper': return { ...s, papers: s.papers.filter(p => p.id !== a.id), collections: s.collections.map(c => ({ ...c, paperIds: c.paperIds.filter(id => id !== a.id) })) }
    case 'toggleStar': return { ...s, papers: s.papers.map(p => p.id === a.id ? { ...p, starred: !p.starred } : p) }
    case 'viewPaper': return { ...s, recent: [a.id, ...s.recent.filter(id => id !== a.id)].slice(0, 12) }
    case 'addCollection': return { ...s, collections: [...s.collections, { id: uid(), name: a.name, paperIds: [] }], activity: log(`created collection “${a.name}”`) }
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
    case 'chat': return { ...s, chat: [...s.chat, a.msg].slice(-60) }
    case 'clearChat': return { ...s, chat: [] }
    case 'invite': return { ...s, members: [...s.members, { id: uid(), name: a.name, role: a.role }], activity: log(`invited ${a.name}`) }
    case 'setRole': return { ...s, members: s.members.map(m => m.id === a.id ? { ...m, role: a.role } : m) }
    case 'removeMember': return { ...s, members: s.members.filter(m => m.id !== a.id) }
    case 'log': return { ...s, activity: log(a.text) }
    case 'settings': return { ...s, settings: { ...s.settings, ...a.patch } }
    case 'import': return { ...initial(), ...a.state }
    case 'reset': return initial()
    default: return s
  }
}

const Ctx = createContext(null)

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, null, () => {
    try { const saved = JSON.parse(localStorage.getItem(KEY)); if (saved?.papers) return { ...initial(), ...saved, settings: { ...initial().settings, ...saved.settings } } } catch {}
    return initial()
  })
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(state)) } catch {} }, [state])
  useEffect(() => { document.documentElement.dataset.theme = state.settings.darkMode ? 'dark' : 'light' }, [state.settings.darkMode])
  const index = useMemo(() => buildIndex(state.papers), [state.papers])
  const value = useMemo(() => ({ state, dispatch, index }), [state, index])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useStore = () => useContext(Ctx)
export { uid }
