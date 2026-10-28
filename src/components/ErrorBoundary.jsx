import { Component } from 'react'

// Keeps the shell alive if one view throws, and shows what broke.
export default class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (!this.state.error) return this.props.children
    return <div className="card"><h3>This view crashed</h3><pre className="small" style={{ whiteSpace: 'pre-wrap' }}>{String(this.state.error?.stack || this.state.error)}</pre><button className="btn" onClick={() => this.setState({ error: null })}>Retry</button></div>
  }
}
