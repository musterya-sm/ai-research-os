import { Component } from 'react'

// Last line of defence: a render error would otherwise unmount the whole app and leave a blank page.
export default class Crash extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error(error, info?.componentStack) }

  backup = () => {
    const raw = localStorage.getItem('ai-research-os/v1') || '{}'
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([raw], { type: 'application/json' })), download: 'research-os-backup.json' })
    a.click()
  }

  reset = () => {
    if (!confirm('Clear the data saved in this browser and start fresh? Download a backup first if you need it.')) return
    localStorage.removeItem('ai-research-os/v1')
    location.hash = ''
    location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ maxWidth: 640, margin: '10vh auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <h2>Something broke while loading this page</h2>
        <pre style={{ whiteSpace: 'pre-wrap', background: '#eee', padding: 12, fontSize: 12 }}>{String(this.state.error?.message || this.state.error)}</pre>
        <p style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => { location.hash = ''; location.reload() }}>Go home</button>
          <button onClick={this.backup}>Download backup</button>
          <button onClick={this.reset}>Reset saved data</button>
        </p>
      </div>
    )
  }
}
