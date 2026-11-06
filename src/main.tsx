import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import StorageDiagnosticsPage from './pages/StorageDiagnosticsPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {window.location.pathname === '/diagnostics/storage' ? <StorageDiagnosticsPage /> : <App />}
  </StrictMode>,
)
