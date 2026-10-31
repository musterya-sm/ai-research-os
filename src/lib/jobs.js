import { useEffect, useReducer } from 'react'
import { toast } from '../components/ui.jsx'

// Long-running work (Reproduce Lab builds, checks, fixes) lives here rather than in a component,
// so it keeps going and keeps its log when you switch screens.
const jobs = new Map() // key → { busy, log, problems, title }
const subs = new Set()
const emit = () => subs.forEach(f => f())

export function useJob(key) {
  const [, force] = useReducer(x => x + 1, 0)
  useEffect(() => { subs.add(force); return () => subs.delete(force) }, [])
  return jobs.get(key)
}

export const anyBusy = () => [...jobs.values()].some(j => j.busy)

// Runs fn(say, job) unless a job with this key is already running. Returns false if it was busy.
export function runJob(key, title, fn, { reset = false, done } = {}) {
  const prev = jobs.get(key)
  if (prev?.busy) { toast('Still working on this one. Wait for it to finish.'); return false }
  const job = { busy: true, log: reset || !prev ? [] : prev.log, problems: reset ? null : prev?.problems ?? null, title }
  jobs.set(key, job); emit()
  const say = t => { job.log = [...job.log, t]; emit() }
  Promise.resolve().then(() => fn(say, job)).catch(e => say(`Stopped: ${e.message}`)).finally(() => {
    job.busy = false; emit()
    // Tell the user if they've moved on to another screen.
    if (done && !location.hash.includes(key)) toast(done)
  })
  return true
}

export const setProblems = (key, problems) => { const j = jobs.get(key); if (j) { j.problems = problems; emit() } }

// Closing the tab would kill a running build: ask first.
window.addEventListener('beforeunload', e => { if (anyBusy()) { e.preventDefault(); e.returnValue = '' } })
