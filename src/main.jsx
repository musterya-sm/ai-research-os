import { createRoot } from 'react-dom/client'
import { StoreProvider } from './lib/store.jsx'
import App from './App.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(<StoreProvider><App /></StoreProvider>)

// Installable + offline in production builds (the dev server's HMR doesn't mix with a service worker).
if (import.meta.env.PROD && 'serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
