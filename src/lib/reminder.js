// Daily review reminder. Browsers can't wake a closed tab without a push server, so this fires while
// the app (or the installed PWA) is open: once per day, at or after the chosen time, if cards are due.
import { toast } from '../components/ui.jsx'

const KEY = 'ai-research-os/reminded'

export async function showReminder(due, test = false) {
  const body = due ? `${due} flashcard${due > 1 ? 's' : ''} due — keep your streak going.` : 'Nothing due right now. 🎉'
  toast(`🔔 ${body}`)
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  const opts = { body, icon: '/icon-192.png', tag: 'review', data: { url: '/#/notes/review' } }
  const reg = await navigator.serviceWorker?.getRegistration().catch(() => null)
  reg ? reg.showNotification('Time to review', opts) : new Notification(test ? 'Test reminder' : 'Time to review', opts)
}

export function checkReminder(settings, highlights) {
  if (!settings.reminder) return
  const now = new Date(), today = now.toLocaleDateString('en-CA')
  const [h, m] = (settings.reminderTime || '09:00').split(':').map(Number)
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return
  try { if (localStorage.getItem(KEY) === today) return; localStorage.setItem(KEY, today) } catch { return }
  const due = highlights.filter(x => (x.due || 0) <= Date.now()).length
  if (due) showReminder(due)
}
