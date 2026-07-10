import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

// Dev-only: with ?daw=<port> in the URL, sync the sandbox with a local `beat daemon`'s .beat
// file (see src/state/dawBridge.ts). Dynamic import inside the DEV guard so production builds
// don't carry the bridge at all.
if (import.meta.env.DEV) {
  void import('./state/dawBridge').then(({ initDawBridge }) => initDawBridge())
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
