import { useEffect, useState } from 'react'
import { KeyRound, ExternalLink, Check, X, ShieldCheck } from 'lucide-react'
import { Modal, toast } from './ui.jsx'
import { useStore } from '../lib/store.jsx'
import { askClaude, hasAI, PROVIDERS } from '../lib/ai.js'

export const openKeySetup = () => window.dispatchEvent(new Event('key:open'))

const GAINS = [
  ['Copilot', 'written answers that cite the exact PDF page, instead of a list of matching passages'],
  ['Reproduce Lab', '“Build it for me” writes, reviews and fixes a full codebase; the mentor reads your progress'],
  ['Writing Studio', 'turns your highlights into real prose with citations'],
  ['Survey, gaps, hypotheses, contradictions', 'reasoned analysis instead of keyword statistics'],
  ['Reader', 'Explain and Define on any selection'],
]

const INFO = {
  anthropic: {
    name: 'Claude (Anthropic)', field: 'apiKey', prefix: 'sk-ant-api', pattern: /^sk-ant-api\d+-[\w-]{20,}$/, placeholder: 'sk-ant-api03-...',
    url: 'https://console.anthropic.com/settings/keys', console: 'Anthropic Console → API keys', billing: 'Billing',
    wrong: k => /^sk-ant-oat/.test(k) ? 'That is a Claude Code / subscription sign-in token, not an API key. Create an API key in the Anthropic Console (it starts with “sk-ant-api”).' : /^sk-(proj-)?[\w-]{20,}$/.test(k) && !k.startsWith('sk-ant') ? 'That looks like an OpenAI key. Switch to “OpenAI” above.' : 'That doesn\'t look like an Anthropic API key. It should start with “sk-ant-api”.',
    models: [['claude-sonnet-5-5', 'Claude Sonnet 5.5 (balanced)'], ['claude-opus-5-5', 'Claude Opus 5.5 (most capable)'], ['claude-haiku-5-5', 'Claude Haiku 5.5 (fastest, cheapest)']], modelField: 'model',
  },
  openai: {
    name: 'OpenAI', field: 'openaiKey', prefix: 'sk-', pattern: /^sk-(?!ant-)[\w-]{20,}$/, placeholder: 'sk-proj-...',
    url: 'https://platform.openai.com/api-keys', console: 'OpenAI Platform → API keys', billing: 'Settings → Billing',
    wrong: k => k.startsWith('sk-ant-') ? 'That is an Anthropic key. Switch to “Claude” above.' : 'That doesn\'t look like an OpenAI API key. It should start with “sk-” (usually “sk-proj-”).',
    models: [['gpt-4.1-mini', 'GPT-4.1 mini (fast, cheap)'], ['gpt-4.1', 'GPT-4.1'], ['gpt-4o', 'GPT-4o'], ['gpt-4o-mini', 'GPT-4o mini']], modelField: 'openaiModel',
  },
}

function explain(provider, msg) {
  if (/ 401|authentication|invalid[_ ]api[_ ]key|incorrect api key/i.test(msg)) return 'That key was rejected. Check you copied all of it, and that it hasn\'t been deleted.'
  if (/insufficient_quota|credit balance|billing| 402/i.test(msg)) return `The key works, but the account has no credit. Add some under ${INFO[provider].billing}.`
  if (/model_not_found|does not exist|not_found_error/i.test(msg)) return 'The key works, but this account can\'t use that model. Pick another model below.'
  if (/ 429|rate/i.test(msg)) return 'Too many requests right now. Wait a minute and try again.'
  // OpenAI omits CORS headers on error responses, so a bad key or empty account surfaces as a network error in browsers.
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return provider === 'openai'
    ? 'OpenAI refused the request. This usually means the key is wrong or revoked, or the account has no credit (OpenAI hides the exact reason from browsers). Check the key and Settings → Billing on platform.openai.com.'
    : 'Couldn\'t reach the API. Check your connection, or a browser extension that might be blocking it.'
  return msg
}

// Guided setup: pick a provider, why, where to get a key, paste, test. Mounted once in the app shell.
export function KeySetupModal() {
  const { state, dispatch } = useStore()
  const st = state.settings
  const [open, setOpen] = useState(false)
  const [provider, setProvider] = useState(st.provider || 'anthropic')
  const [key, setKey] = useState('')
  const [model, setModel] = useState('')
  const [status, setStatus] = useState(null) // null | 'testing' | 'ok' | error text
  const info = INFO[provider]
  const pick = p => { setProvider(p); setKey(st[INFO[p].field] || ''); setModel(st[INFO[p].modelField] || INFO[p].models[0][0]); setStatus(null) }
  useEffect(() => { const on = () => { setOpen(true); pick(st.provider || 'anthropic') }; window.addEventListener('key:open', on); return () => window.removeEventListener('key:open', on) }, [st])
  if (!open) return null
  const k = key.trim()
  const looksRight = info.pattern.test(k)

  async function save() {
    setStatus('testing')
    const patch = { provider, [info.field]: k, [info.modelField]: model }
    try {
      const r = await askClaude({ ...st, ...patch }, { prompt: 'Reply with the single word: connected', maxTokens: 16 })
      if (r == null) throw new Error('No reply')
      dispatch({ type: 'settings', patch })
      setStatus('ok'); toast(`${PROVIDERS[provider]} connected — AI features are on`)
    } catch (e) { setStatus(explain(provider, e.message)) }
  }

  return (
    <Modal title="Connect an AI model" onClose={() => setOpen(false)}>
      <div className="stack">
        <div className="seg" role="tablist">{Object.entries(INFO).map(([p, x]) => <button key={p} role="tab" aria-selected={provider === p} className={provider === p ? 'on' : ''} onClick={() => pick(p)}>{x.name}{st.provider === p && hasAI(st) ? ' ✓' : ''}</button>)}</div>
        {st[info.field] && status !== 'ok' && <div className="tag lime" style={{ alignSelf: 'flex-start' }}><Check size={12} /> A {PROVIDERS[provider]} key is saved{st.provider === provider ? ' and in use' : ''}. Paste a new one to replace it.</div>}
        <div>
          <div className="label">What you get</div>
          {GAINS.map(([g, v]) => <div key={g} className="small" style={{ padding: '3px 0' }}><b>{g}</b>: {v}</div>)}
          <p className="small muted" style={{ marginBottom: 0 }}>Without a key everything still works with the built-in local engine; it just searches and templates instead of writing.</p>
        </div>
        <div>
          <div className="label">Get {provider === 'openai' ? 'an' : 'a'} {PROVIDERS[provider]} key (about 2 minutes)</div>
          <ol className="small" style={{ paddingLeft: 18, margin: '6px 0' }}>
            <li>Open <a href={info.url} target="_blank" rel="noreferrer">{info.console} <ExternalLink size={11} /></a> and sign in.</li>
            <li>Create a new key named “Research OS” and copy it (it starts with <code>{info.prefix}</code>).</li>
            <li>Under <b>{info.billing}</b>, add a little credit. Usage is pay-as-you-go, and you can set a monthly limit there.</li>
            <li>Paste it below.</li>
          </ol>
          {provider === 'anthropic' && <p className="tiny muted" style={{ margin: 0 }}>A Claude.ai or Claude Code subscription does not include API access; API keys are billed separately.</p>}
          {provider === 'openai' && <p className="tiny muted" style={{ margin: 0 }}>A ChatGPT Plus subscription does not include API access; API keys are billed separately.</p>}
        </div>
        <label className="small">Your {PROVIDERS[provider]} API key
          <input className="input mono" type="password" autoFocus placeholder={info.placeholder} value={key} onChange={e => { setKey(e.target.value); setStatus(null) }} onKeyDown={e => e.key === 'Enter' && looksRight && save()} />
        </label>
        {k && !looksRight && <span className="small" style={{ color: 'var(--red)' }}>{info.wrong(k)}</span>}
        <label className="small">Model<select className="input" value={model} onChange={e => { setModel(e.target.value); setStatus(null) }}>{info.models.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        {status && status !== 'testing' && status !== 'ok' && <span className="small" style={{ color: 'var(--red)' }}>{status}</span>}
        {status === 'ok' && <span className="small"><Check size={13} /> Connected. AI screens now show a <b>{PROVIDERS[provider].toUpperCase()}</b> badge.</span>}
        <div className="row">
          <button className="btn violet" disabled={!looksRight || status === 'testing'} onClick={save}>{status === 'testing' ? <span className="spinner" /> : <KeyRound size={14} />} Test & use {PROVIDERS[provider]}</button>
          {status === 'ok' && <button className="btn" onClick={() => setOpen(false)}>Done</button>}
          {st[info.field] && <button className="btn ghost" onClick={() => { dispatch({ type: 'settings', patch: { [info.field]: '' } }); setKey(''); toast(`${PROVIDERS[provider]} key removed`) }}>Remove key</button>}
        </div>
        <p className="tiny muted" style={{ margin: 0 }}><ShieldCheck size={12} /> Keys are saved only in this browser. They go straight from your browser to {provider === 'openai' ? 'api.openai.com' : 'api.anthropic.com'}, never to this site's server, and are left out of exports, team sync and share links.</p>
      </div>
    </Modal>
  )
}

// One-line banner on AI-heavy screens while no key is set. Hidden for good once dismissed.
export function KeyNudge({ what }) {
  const { state, dispatch } = useStore()
  if (hasAI(state.settings) || state.settings.keyNudgeHidden) return null
  return (
    <div className="card flat row between" style={{ marginBottom: 14, background: 'var(--lime)', color: '#0d0d0d', padding: '10px 14px' }} data-tour="key-nudge">
      <span className="small"><KeyRound size={14} /> <b>Running on the local engine.</b> {what} Add your own Claude or OpenAI key to switch it on.</span>
      <span className="row" style={{ gap: 6 }}>
        <button className="btn sm dark" onClick={openKeySetup}>Add key · 2 min</button>
        <button className="star" title="Don't show again" aria-label="Dismiss" onClick={() => dispatch({ type: 'settings', patch: { keyNudgeHidden: true } })}><X size={14} /></button>
      </span>
    </div>
  )
}
