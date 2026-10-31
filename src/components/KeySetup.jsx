import { useEffect, useState } from 'react'
import { KeyRound, ExternalLink, Check, X, ShieldCheck } from 'lucide-react'
import { Modal, toast } from './ui.jsx'
import { useStore } from '../lib/store.jsx'
import { askClaude } from '../lib/ai.js'

export const openKeySetup = () => window.dispatchEvent(new Event('key:open'))

const GAINS = [
  ['Copilot', 'written answers that cite the exact PDF page, instead of a list of matching passages'],
  ['Reproduce Lab', '“Build it for me” writes, reviews and fixes a full codebase; the mentor reads your progress'],
  ['Writing Studio', 'turns your highlights into real prose with citations'],
  ['Survey, gaps, hypotheses, contradictions', 'reasoned analysis instead of keyword statistics'],
  ['Reader', 'Explain and Define on any selection'],
]

// Guided setup: why, where to get a key, paste, test. Mounted once in the app shell.
export function KeySetupModal() {
  const { state, dispatch } = useStore()
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState('')
  const [status, setStatus] = useState(null) // null | 'testing' | 'ok' | error text
  useEffect(() => { const on = () => { setOpen(true); setKey(state.settings.apiKey); setStatus(null) }; window.addEventListener('key:open', on); return () => window.removeEventListener('key:open', on) }, [state.settings.apiKey])
  if (!open) return null
  const looksRight = /^sk-ant-[\w-]{20,}$/.test(key.trim())

  async function save() {
    const k = key.trim()
    setStatus('testing')
    try {
      const r = await askClaude({ ...state.settings, apiKey: k }, { prompt: 'Reply with the single word: connected', maxTokens: 10 })
      if (!r) throw new Error('No reply')
      dispatch({ type: 'settings', patch: { apiKey: k } })
      setStatus('ok'); toast('Claude connected — AI features are on')
    } catch (e) {
      setStatus(/401|authentication|invalid x-api-key/i.test(e.message) ? 'That key was rejected. Check you copied all of it.' : /credit|billing|402/i.test(e.message) ? 'The key works, but the account has no credit yet. Add credit in the Anthropic Console → Billing.' : e.message)
    }
  }

  return (
    <Modal title="Use Claude in AI Research OS" onClose={() => setOpen(false)}>
      <div className="stack">
        {state.settings.apiKey && status !== 'ok' && <div className="tag lime" style={{ alignSelf: 'flex-start' }}><Check size={12} /> A key is already saved. Paste a new one to replace it.</div>}
        <div>
          <div className="label">What you get</div>
          {GAINS.map(([k, v]) => <div key={k} className="small" style={{ padding: '3px 0' }}><b>{k}</b>: {v}</div>)}
          <p className="small muted" style={{ marginBottom: 0 }}>Without a key everything still works with the built-in local engine; it just searches and templates instead of writing.</p>
        </div>
        <div>
          <div className="label">Get a key (about 2 minutes)</div>
          <ol className="small" style={{ paddingLeft: 18, margin: '6px 0' }}>
            <li>Open the <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">Anthropic Console → API keys <ExternalLink size={11} /></a> and sign in.</li>
            <li>Click <b>Create Key</b>, name it “Research OS”, copy it (it starts with <code>sk-ant-</code>).</li>
            <li>Under <b>Billing</b>, add a little credit. Usage is pay-as-you-go, and you can set a monthly limit there.</li>
            <li>Paste it below.</li>
          </ol>
        </div>
        <label className="small">Your Anthropic API key
          <input className="input mono" type="password" autoFocus placeholder="sk-ant-..." value={key} onChange={e => { setKey(e.target.value); setStatus(null) }} onKeyDown={e => e.key === 'Enter' && looksRight && save()} />
        </label>
        {key.trim() && !looksRight && <span className="small" style={{ color: 'var(--red)' }}>That doesn't look like an Anthropic key. It should start with “sk-ant-”.</span>}
        {status && status !== 'testing' && status !== 'ok' && <span className="small" style={{ color: 'var(--red)' }}>{status}</span>}
        {status === 'ok' && <span className="small"><Check size={13} /> Connected. Look for the <b>CLAUDE</b> badge on AI screens.</span>}
        <div className="row">
          <button className="btn violet" disabled={!looksRight || status === 'testing'} onClick={save}>{status === 'testing' ? <span className="spinner" /> : <KeyRound size={14} />} Test & save</button>
          {status === 'ok' && <button className="btn" onClick={() => setOpen(false)}>Done</button>}
        </div>
        <p className="tiny muted" style={{ margin: 0 }}><ShieldCheck size={12} /> The key is saved only in this browser. It goes straight from your browser to api.anthropic.com, never to this site's server, and it is left out of exports, team sync and share links.</p>
      </div>
    </Modal>
  )
}

// One-line banner on AI-heavy screens while no key is set. Hidden for good once dismissed.
export function KeyNudge({ what }) {
  const { state, dispatch } = useStore()
  if (state.settings.apiKey || state.settings.keyNudgeHidden) return null
  return (
    <div className="card flat row between" style={{ marginBottom: 14, background: 'var(--lime)', color: '#0d0d0d', padding: '10px 14px' }} data-tour="key-nudge">
      <span className="small"><KeyRound size={14} /> <b>Running on the local engine.</b> {what} Add your own Claude key to switch it on.</span>
      <span className="row" style={{ gap: 6 }}>
        <button className="btn sm dark" onClick={openKeySetup}>Add key · 2 min</button>
        <button className="star" title="Don't show again" aria-label="Dismiss" onClick={() => dispatch({ type: 'settings', patch: { keyNudgeHidden: true } })}><X size={14} /></button>
      </span>
    </div>
  )
}
