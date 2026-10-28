import { useState } from 'react'
import { Head, Toggle, toast } from '../components/ui.jsx'
import { useStore } from '../lib/store.jsx'
import { askClaude } from '../lib/ai.js'
import { listPdfIds, deletePdf } from '../lib/pdfstore.js'
import { workspaceJson, download } from '../lib/exporter.js'

const SECTIONS = ['Profile', 'Preferences', 'Notifications', 'Integrations', 'API Keys', 'Billing', 'Data & Privacy']

export default function Settings() {
  const { state, dispatch } = useStore()
  const s = state.settings
  const [sec, setSec] = useState('Preferences')
  const [testing, setTesting] = useState(false)
  const set = patch => dispatch({ type: 'settings', patch })
  const Row = ({ label, k, hint }) => <div className="row between" style={{ padding: '10px 0', borderBottom: '1.5px solid var(--soft)' }}><div><div>{label}</div>{hint && <div className="muted tiny">{hint}</div>}</div><Toggle label={label} on={!!s[k]} onChange={v => set({ [k]: v })} /></div>
  async function test() {
    setTesting(true)
    try { const r = await askClaude(s, { prompt: 'Reply with the single word: connected', maxTokens: 10 }); toast(r ? `Claude: ${r.trim()}` : 'Add a key first') } catch (e) { toast(e.message) } finally { setTesting(false) }
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
            <Row label="AI Summarization" k="autoSummarize" hint="Show TL;DR on every paper" />
            <Row label="Auto Cluster Concepts" k="autoCluster" />
            <Row label="Gap Detection Alerts" k="gapAlerts" />
            <Row label="Weekly Research Digest" k="weeklyDigest" />
            <Row label="Dark Mode" k="darkMode" />
            <div className="row between" style={{ padding: '10px 0' }}><span>Default view</span>
              <select className="input" style={{ width: 'auto' }} value={s.defaultView} onChange={e => set({ defaultView: e.target.value })}><option value="canvas">Graph Canvas</option><option value="library">Paper Library</option><option value="dashboard">Dashboard</option></select></div>
          </div>}
          {sec === 'Notifications' && <div style={{ maxWidth: 520 }}><Row label="Email notifications" k="notifyEmail" /><Row label="In-app notifications" k="notifyApp" /></div>}
          {(sec === 'Integrations' || sec === 'API Keys') && <div className="stack" style={{ maxWidth: 520 }}>
            <p className="small muted">Add an Anthropic API key to power Copilot, surveys, hypotheses, gap and contradiction analysis with Claude. Without a key the local engine is used. The key is stored only in this browser and sent directly to api.anthropic.com.</p>
            <label className="small">Anthropic API key<input className="input mono" type="password" placeholder="sk-ant-..." value={s.apiKey} onChange={e => set({ apiKey: e.target.value.trim() })} /></label>
            <label className="small">Model<select className="input" value={s.model} onChange={e => set({ model: e.target.value })}><option value="claude-sonnet-5-5">Claude Sonnet 5.5 (balanced)</option><option value="claude-opus-5-5">Claude Opus 5.5 (most capable)</option><option value="claude-haiku-5-5">Claude Haiku 5.5 (fastest)</option></select></label>
            <div className="row"><button className="btn violet" disabled={!s.apiKey || testing} onClick={test}>{testing ? <span className="spinner" /> : 'Test connection'}</button>{s.apiKey && <button className="btn" onClick={() => set({ apiKey: '' })}>Remove key</button>}</div>
            <div className="card flat small"><b>arXiv</b> — connected via local dev proxy (no key needed).</div>
          </div>}
          {sec === 'Billing' && <p>Local workspace — free. Claude usage is billed to your own Anthropic account.</p>}
          {sec === 'Data & Privacy' && <div className="stack" style={{ maxWidth: 520 }}>
            <Row label="Share anonymous analytics" k="shareAnalytics" hint="Nothing is sent anywhere; this app has no backend" />
            <p className="small">{state.papers.length} papers, {state.collections.length} collections, {Object.keys(state.notes).length} notes, {state.papers.filter(p => p.hasPdf).length} PDFs stored locally.</p>
            <div className="row"><button className="btn" onClick={async () => download('research-os-workspace.json', await workspaceJson(state, { includePdfs: true }), 'application/json')}>Export all data</button>
              <button className="btn" style={{ borderColor: 'var(--red)', color: 'var(--red)' }} onClick={() => confirm('Reset workspace to defaults? This deletes your papers, notes and canvas.') && (listPdfIds().then(ids => Promise.all(ids.map(deletePdf))).catch(() => {}), dispatch({ type: 'reset' }), toast('Workspace reset'))}>Reset workspace</button></div>
          </div>}
        </div>
      </div>
    </>
  )
}
