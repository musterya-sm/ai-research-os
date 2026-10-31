import { useEffect, useState } from 'react'
import { Home, HelpCircle, NotebookPen, PenLine, LayoutDashboard, Library, Network, Search, TableProperties, Radar, Lightbulb, Swords, History, Bot, Share2, Workflow, Boxes, Rss, FlaskConical, BookMarked, PanelLeftOpen, PanelLeftClose, UserRound, Settings as Cog } from 'lucide-react'
import { nav, toast } from './components/ui.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import Shared from './views/Shared.jsx'
import Save from './views/Save.jsx'
import Reading from './views/Reading.jsx'
import Account, { Avatar } from './views/Account.jsx'
import PublicProfile from './views/PublicProfile.jsx'
import { useSync, getAuth, serverInfo } from './lib/sync.js'
import { KeySetupModal } from './components/KeySetup.jsx'
import { useCheckAlerts } from './components/Alerts.jsx'
import { due } from './lib/alerts.js'
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
import Lab from './views/Lab.jsx'
import Join from './views/Join.jsx'
import Tour, { startTour } from './components/Tour.jsx'
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
  ['lab', 'Reproduce Lab', FlaskConical, Lab],
  ['reading', 'Reading Queue', BookMarked, Reading],
  ['settings', 'Settings', Cog, Settings],
]

// Screen numbers follow the mockup (04 is Paper View, reached from the library); 17+ are additions.
// Rail section headings, keyed by the index of the first route in each group.
const GROUPS = { 0: 'Workspace', 3: 'Analyse', 9: 'AI & team', 14: 'Notes & build', 18: 'Settings' }
const NUMS = { dashboard: 1, library: 2, canvas: 3, search: 5, survey: 6, gaps: 7, hypotheses: 8, contradictions: 9, timeline: 10, copilot: 11, export: 12, workflows: 13, clusters: 14, feed: 15, notes: 17, write: 18, lab: 19, reading: 20, settings: 16 }

const parse = () => (window.location.hash.replace(/^#\/?/, '').replace(/\?.*$/, '') || 'home').split('/')

export default function App() {
  const [route, setRoute] = useState(parse)
  useEffect(() => {
    const on = () => { setRoute(parse()); document.querySelector('main')?.scrollTo(0, 0) }
    window.addEventListener('hashchange', on)
    const key = e => { if (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); nav('/search') } }
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('hashchange', on); window.removeEventListener('keydown', key) }
  }, [])

  const { state, dispatch } = useStore()
  useEffect(() => {
    const tick = () => checkReminder(state.settings, state.highlights)
    tick()
    const t = setInterval(tick, 60000)
    return () => clearInterval(t)
  }, [state.settings.reminder, state.settings.reminderTime, state.highlights])

  // Topic alerts: check arXiv once a day, shortly after the app opens (and right after following something new).
  const { check } = useCheckAlerts()
  const al = state.alerts
  useEffect(() => {
    const tick = () => due(al) && check().then(n => {
      if (!n) return
      toast(`${n} new paper${n > 1 ? 's' : ''} on topics you follow`)
      if (state.settings.notifyApp && window.Notification?.permission === 'granted') new Notification('AI Research OS', { body: `${n} new paper${n > 1 ? 's' : ''} on topics you follow`, icon: '/icon-192.png' })
    }).catch(() => {})
    const first = setTimeout(tick, 2500), every = setInterval(tick, 36e5)
    return () => { clearTimeout(first); clearInterval(every) }
  }, [al.topics.join('|'), al.authors.join('|'), al.lastRun])

  // Whether this server offers the free daily AI allowance (needs FREE_AI_KEY on the server).
  useEffect(() => { serverInfo().then(h => dispatch({ type: 'settings', patch: { freeAI: h.freeAI || null } }), () => {}) }, [])

  useSync()
  const me = getAuth()?.user
  const wide = state.settings.railWide !== false // expanded unless the user collapsed it
  const [name, arg, sub] = route
  const View = name === 'home' ? Landing : name === 'paper' ? PaperView : name === 'join' ? Join : name === 'account' || name === 'reset' ? Account : name === 'u' ? PublicProfile : ROUTES.find(r => r[0] === name)?.[3] || Dashboard

  // Share links open as a standalone read-only page, without the rail or the tour.
  if (name === 's') return <ErrorBoundary><Shared data={arg} /></ErrorBoundary>
  if (name === 'save') return <ErrorBoundary><Save /></ErrorBoundary>

  return (
    <div className={`app ${wide ? 'wide' : ''}`}>
      {/* On phones the rail is a scrolling bottom bar: the right edge fades until the end is reached. */}
      <nav className="rail" aria-label="Main" onScroll={e => { const r = e.currentTarget; r.classList.toggle('end', r.scrollLeft + r.clientWidth >= r.scrollWidth - 4) }}>
        <div className="rail-top">
          <div className="logo" onClick={() => nav('/')}>RO{wide && <span className="lbl"> Research OS</span>}</div>
          <button className="rail-toggle" title={wide ? 'Collapse sidebar' : 'Expand sidebar'} aria-label={wide ? 'Collapse sidebar' : 'Expand sidebar'} aria-expanded={wide} onClick={() => dispatch({ type: 'settings', patch: { railWide: !wide } })}>{wide ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}</button>
        </div>
        <button className={name === 'home' ? 'on' : ''} onClick={() => nav('/')}><Home size={19} /><span className="lbl">Home</span><span className="tip">Home</span></button>
        <div className="sep" />
        {ROUTES.map(([key, label, Icon], i) => (
          <span key={key} style={{ display: 'contents' }}>
            {GROUPS[i] && (wide ? <div className="rail-group">{GROUPS[i]}</div> : <div className="sep" />)}
            <button className={name === key || (key === 'library' && name === 'paper') ? 'on' : ''} onClick={() => nav(`/${key}`)} aria-label={label}>
              <Icon size={19} /><span className="lbl"><em>{String(NUMS[key]).padStart(2, '0')}</em>{label}</span><span className="tip">{String(NUMS[key]).padStart(2, "0")} · {label}</span>
            </button>
          </span>
        ))}
        <button data-tour="help" onClick={() => startTour()} aria-label="Take the tour"><HelpCircle size={19} /><span className="lbl">Take the tour</span><span className="tip">Take the tour</span></button>
        <button data-tour="account" className={`rail-me ${name === 'account' ? 'on' : ''}`} onClick={() => nav('/account')} aria-label={me ? `Account: @${me.username}` : 'Sign in'}>
          {me ? <Avatar user={me} size={26} /> : <UserRound size={19} />}<span className="lbl">{me ? <>{me.name}<em style={{ marginLeft: 6 }}>@{me.username}</em></> : 'Sign in / Create account'}</span><span className="tip">{me ? `@${me.username}` : 'Sign in'}</span>
        </button>
      </nav>
      <div className="sync-float"><SyncBadge /></div>
      <Tour />
      <KeySetupModal />
      <main><ErrorBoundary key={[name, arg, sub].join('/')}><View arg={arg} sub={sub} /></ErrorBoundary></main>
    </div>
  )
}
