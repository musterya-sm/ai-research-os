import { useState } from 'react'
import { Head, Toggle, toast } from '../components/ui.jsx'
import { useStore, samplePapers } from '../lib/store.jsx'
import { removeSample } from '../components/Welcome.jsx'
import { askClaude, hasAI, aiName, PROVIDERS } from '../lib/ai.js'
import { listPdfIds, deletePdf } from '../lib/pdfstore.js'
import { workspaceJson, download } from '../lib/exporter.js'
import SyncPanel from '../components/SyncPanel.jsx'
import { showReminder } from '../lib/reminder.js'
import { startTour, startGuide, CHAPTERS } from '../components/Tour.jsx'

const SECTIONS = ['Profile', 'Account & Sync', 'Preferences', 'Notifications', 'Integrations', 'API Keys', 'Billing', 'Data & Privacy']

export default function Settings({ arg }) {
  const { state, dispatch } = useStore()
  const s = state.settings
  const [sec, setSec] = useState(arg === 'sync' ? 'Account & Sync' : 'Preferences')
  const [testing, setTesting] = useState(false)
  const set = patch => dispatch({ type: 'settings', patch })
  const Row = ({ label, k, hint }) => <div className="row between" style={{ padding: '10px 0', borderBottom: '1.5px solid var(--soft)' }}><div><div>{label}</div>{hint && <div className="muted tiny">{hint}</div>}</div><Toggle label={label} on={!!s[k]} onChange={v => set({ [k]: v })} /></div>
  async function test() {
    setTesting(true)
    try { const r = await askClaude(s, { prompt: 'Reply with the single word: connected', maxTokens: 10 }); toast(r ? `${PROVIDERS[s.provider] || 'AI'}: ${r.trim()}` : 'Add a key first') } catch (e) { toast(e.message) } finally { setTesting(false) }
  }

  return (
    <>
      <Head n={16} title="Settings & Preferences" sub="Customize your research OS" violet />
      <div className="grid side">
        <div className="card" style={{ padding: 10, alignSelf: 'start' }}><div className="nav-list">{SECTIONS.map(x => <button key={x} className={sec === x ? 'on' : ''} onClick={() => setSec(x)}>{x}</button>)}</div></div>
        <div className="card">
          <h3>{sec}</h3>
          {sec === 'Profile' && <div className="stack" style={{ maxWidth: 420 }}>
            <label className="small">Display name<input className="input" value={s.name} onChange={e => set({ name: e.target.value })} /></label>
            <label className="small">Email<input className="input" value={s.email} onChange={e => set({ email: e.target.value })} /></label>
          </div>}
          {sec === 'Preferences' && <div style={{ maxWidth: 520 }}>
            <div className="card flat" style={{ marginBottom: 10 }}>
              <div className="row between"><div><b>Product tour</b><div className="muted tiny">{s.tourDone ? 'Completed or skipped — take it again any time.' : 'Not finished yet.'}</div></div><span className="row"><button className="btn" onClick={() => startGuide('start')}>How to add papers</button><button className="btn violet" onClick={() => startTour()}>Start tour</button></span></div>
              <div className="row wrap" style={{ marginTop: 8, gap: 4 }}><span className="muted tiny">Jump to:</span>{CHAPTERS.map(c => <button key={c} className="btn sm" onClick={() => startTour(c)}>{c}</button>)}</div>
            </div>
            <Row label="AI Summarization" k="autoSummarize" hint="Show TL;DR on every paper" />
            <Row label="Auto Cluster Concepts" k="autoCluster" />
            <Row label="Gap Detection Alerts" k="gapAlerts" />
            <Row label="Weekly Research Digest" k="weeklyDigest" />
            <Row label="Dark Mode" k="darkMode" />
            <div className="row between" style={{ padding: '10px 0' }}><span>Default view</span>
              <select className="input" style={{ width: 'auto' }} value={s.defaultView} onChange={e => set({ defaultView: e.target.value })}><option value="canvas">Graph Canvas</option><option value="library">Paper Library</option><option value="dashboard">Dashboard</option></select></div>
          </div>}
          {sec === 'Account & Sync' && <SyncPanel />}
          {sec === 'Notifications' && <div style={{ maxWidth: 520 }}>
            <Row label="Daily review reminder" k="reminder" hint="Nudges you when flashcards are due (while the app or installed PWA is open)" />
            {s.reminder && <div className="row between" style={{ padding: '10px 0', borderBottom: '1.5px solid var(--soft)' }}><span>Remind me at</span><input className="input" type="time" style={{ width: 'auto' }} value={s.reminderTime} onChange={e => set({ reminderTime: e.target.value })} /></div>}
            <div className="row" style={{ padding: '10px 0' }}>
              {'Notification' in window && Notification.permission !== 'granted' && <button className="btn sm" onClick={() => Notification.requestPermission().then(p => toast(p === 'granted' ? 'Browser notifications on' : 'Notifications blocked in browser settings'))}>Enable browser notifications</button>}
              <button className="btn sm" onClick={() => showReminder(state.highlights.filter(h => (h.due || 0) <= Date.now()).length, true)}>Send test reminder</button>
            </div>
            <Row label="In-app notifications" k="notifyApp" />
          </div>}
          {(sec === 'Integrations' || sec === 'API Keys') && <div className="stack" style={{ maxWidth: 520 }}>
            <div className="card flat small">{hasAI(s) ? <>AI is on: <b>{aiName(s)}</b>. {s.apiKey && s.openaiKey ? 'Both keys are saved; switch below.' : ''}</> : <>No AI key yet. The built-in local engine is in use.</>}</div>
            <button className="btn violet" style={{ alignSelf: 'flex-start' }} onClick={() => window.dispatchEvent(new Event('key:open'))}>{hasAI(s) ? 'Change key or provider (guided)' : 'Connect Claude or OpenAI · step by step'}</button>
            {s.apiKey && s.openaiKey && <label className="small">Use<select className="input" value={s.provider} onChange={e => set({ provider: e.target.value })}>{Object.entries(PROVIDERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>}
            <p className="small muted">Bring your own Anthropic (Claude) or OpenAI API key to power Copilot, surveys, hypotheses, gap and contradiction analysis, writing and the Reproduce Lab. Without a key the local engine is used. Keys are stored only in this browser and sent directly to the provider.</p>
            <div className="row"><button className="btn" disabled={!hasAI(s) || testing} onClick={test}>{testing ? <span className="spinner" /> : 'Test connection'}</button></div>
            <label className="small">Semantic Scholar API key (optional — avoids shared rate limits for the citation graph)<input className="input mono" type="password" placeholder="free at semanticscholar.org/product/api" value={s.s2Key} onChange={e => set({ s2Key: e.target.value.trim() })} /></label>
            <div className="card flat small"><b>arXiv</b> and <b>Semantic Scholar</b> — reached via the app's proxy (dev server or <code>npm run server</code>). <b>Zotero</b> — connect from Import → Zotero.</div>
          </div>}
          {sec === 'Billing' && <p>Local workspace — free. Claude usage is billed to your own Anthropic account.</p>}
          {sec === 'Data & Privacy' && <div className="stack" style={{ maxWidth: 520 }}>
            <div className="row wrap"><button className="btn" onClick={() => { dispatch({ type: 'loadSample' }); toast('Sample library loaded') }}>Load sample library</button><button className="btn" disabled={!samplePapers(state).length} onClick={() => removeSample(state, dispatch)}>Remove sample library ({samplePapers(state).length})</button></div>
            <Row label="Share anonymous analytics" k="shareAnalytics" hint="No analytics are collected; data only leaves this browser if you turn on sync" />
            <p className="small">{state.papers.length} papers, {state.collections.length} collections, {Object.keys(state.notes).length} notes, {state.papers.filter(p => p.hasPdf).length} PDFs stored locally.</p>
            <div className="row"><button className="btn" onClick={async () => download('research-os-workspace.json', await workspaceJson(state, { includePdfs: true }), 'application/json')}>Export all data</button>
              <button className="btn" style={{ borderColor: 'var(--red)', color: 'var(--red)' }} onClick={() => confirm('Reset workspace to defaults? This deletes your papers, notes and canvas.') && (listPdfIds().then(ids => Promise.all(ids.map(deletePdf))).catch(() => {}), dispatch({ type: 'reset' }), toast('Workspace reset'))}>Reset workspace</button></div>
          </div>}
        </div>
      </div>
    </>
  )
}
