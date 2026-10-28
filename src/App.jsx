import { useEffect, useState } from 'react'
import { Home, NotebookPen, PenLine, LayoutDashboard, Library, Network, Search, TableProperties, Radar, Lightbulb, Swords, History, Bot, Share2, Workflow, Boxes, Rss, Settings as Cog } from 'lucide-react'
import { nav } from './components/ui.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import Landing from './views/Landing.jsx'
import Dashboard from './views/Dashboard.jsx'
import PaperLibrary from './views/PaperLibrary.jsx'
import GraphCanvas from './views/GraphCanvas.jsx'
import PaperView from './views/PaperView.jsx'
import SemanticSearch from './views/SemanticSearch.jsx'
import LiteratureSurvey from './views/LiteratureSurvey.jsx'
import GapDetection from './views/GapDetection.jsx'
import Hypotheses from './views/Hypotheses.jsx'
import Contradictions from './views/Contradictions.jsx'
import Timeline from './views/Timeline.jsx'
import Copilot from './views/Copilot.jsx'
import ExportCollab from './views/ExportCollab.jsx'
import AgentWorkflows from './views/AgentWorkflows.jsx'
import ConceptClusters from './views/ConceptClusters.jsx'
import Feed from './views/Feed.jsx'
import Settings from './views/Settings.jsx'
import Notebook from './views/Notebook.jsx'
import Writing from './views/Writing.jsx'
import { useStore } from './lib/store.jsx'
import { checkReminder } from './lib/reminder.js'
import { SyncBadge } from './components/SyncPanel.jsx'

export const ROUTES = [
  ['dashboard', 'Dashboard', LayoutDashboard, Dashboard],
  ['library', 'Paper Library', Library, PaperLibrary],
  ['canvas', 'Graph Canvas', Network, GraphCanvas],
  ['search', 'Semantic Search', Search, SemanticSearch],
  ['survey', 'Literature Survey', TableProperties, LiteratureSurvey],
  ['gaps', 'Gap Detection', Radar, GapDetection],
  ['hypotheses', 'Hypothesis Generator', Lightbulb, Hypotheses],
  ['contradictions', 'Contradiction Detection', Swords, Contradictions],
  ['timeline', 'Timeline Evolution', History, Timeline],
  ['copilot', 'AI Research Copilot', Bot, Copilot],
  ['export', 'Export & Collaborate', Share2, ExportCollab],
  ['workflows', 'AI Agent Workflows', Workflow, AgentWorkflows],
  ['clusters', 'Concept Clusters', Boxes, ConceptClusters],
  ['feed', 'Recommendation Feed', Rss, Feed],
  ['notes', 'Knowledge Notebook', NotebookPen, Notebook],
  ['write', 'Writing Studio', PenLine, Writing],
  ['settings', 'Settings', Cog, Settings],
]

// Screen numbers follow the mockup (04 is Paper View, reached from the library); 17+ are additions.
const NUMS = { dashboard: 1, library: 2, canvas: 3, search: 5, survey: 6, gaps: 7, hypotheses: 8, contradictions: 9, timeline: 10, copilot: 11, export: 12, workflows: 13, clusters: 14, feed: 15, notes: 17, write: 18, settings: 16 }

const parse = () => (window.location.hash.replace(/^#\/?/, '') || 'home').split('/')

export default function App() {
  const [route, setRoute] = useState(parse)
  useEffect(() => {
    const on = () => { setRoute(parse()); document.querySelector('main')?.scrollTo(0, 0) }
    window.addEventListener('hashchange', on)
    const key = e => { if (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); nav('/search') } }
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('hashchange', on); window.removeEventListener('keydown', key) }
  }, [])

  const { state } = useStore()
  useEffect(() => {
    const tick = () => checkReminder(state.settings, state.highlights)
    tick()
    const t = setInterval(tick, 60000)
    return () => clearInterval(t)
  }, [state.settings.reminder, state.settings.reminderTime, state.highlights])

  const [name, arg, sub] = route
  const View = name === 'home' ? Landing : name === 'paper' ? PaperView : ROUTES.find(r => r[0] === name)?.[3] || Dashboard

  return (
    <div className="app">
      <nav className="rail">
        <div className="logo" onClick={() => nav('/')}>RO</div>
        <button className={name === 'home' ? 'on' : ''} onClick={() => nav('/')}><Home size={19} /><span className="tip">Home</span></button>
        <div className="sep" />
        {ROUTES.map(([key, label, Icon], i) => (
          <span key={key} style={{ display: 'contents' }}>
            {(i === 3 || i === 9 || i === 14 || i === 16) && <div className="sep" />}
            <button className={name === key || (key === 'library' && name === 'paper') ? 'on' : ''} onClick={() => nav(`/${key}`)}>
              <Icon size={19} /><span className="tip">{String(NUMS[key]).padStart(2, "0")} · {label}</span>
            </button>
          </span>
        ))}
      </nav>
      <div className="sync-float"><SyncBadge /></div>
      <main><ErrorBoundary key={[name, arg, sub].join('/')}><View arg={arg} sub={sub} /></ErrorBoundary></main>
    </div>
  )
}
