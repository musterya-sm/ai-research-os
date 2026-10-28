import { useEffect, useState } from 'react'
import { Home, LayoutDashboard, Library, Network, Search, TableProperties, Radar, Lightbulb, Swords, History, Bot, Share2, Workflow, Boxes, Rss, Settings as Cog } from 'lucide-react'
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
  ['settings', 'Settings', Cog, Settings],
]

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

  const [name, arg] = route
  const View = name === 'home' ? Landing : name === 'paper' ? PaperView : ROUTES.find(r => r[0] === name)?.[3] || Dashboard

  return (
    <div className="app">
      <nav className="rail">
        <div className="logo" onClick={() => nav('/')}>RO</div>
        <button className={name === 'home' ? 'on' : ''} onClick={() => nav('/')}><Home size={19} /><span className="tip">Home</span></button>
        <div className="sep" />
        {ROUTES.map(([key, label, Icon], i) => (
          <span key={key} style={{ display: 'contents' }}>
            {(i === 3 || i === 9 || i === 14) && <div className="sep" />}
            <button className={name === key || (key === 'library' && name === 'paper') ? 'on' : ''} onClick={() => nav(`/${key}`)}>
              <Icon size={19} /><span className="tip">{String(i < 3 ? i + 1 : i + 2).padStart(2, "0")} · {label}</span>
            </button>
          </span>
        ))}
      </nav>
      <main><ErrorBoundary key={name + (arg || '')}><View arg={arg} /></ErrorBoundary></main>
    </div>
  )
}
