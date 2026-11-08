import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import '@mantine/core/styles.css'
import './index.css'
import App from './App.tsx'
import StorageDiagnosticsPage from './pages/StorageDiagnosticsPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider defaultColorScheme="auto" theme={{ primaryColor: 'violet' }}>
      {window.location.pathname === '/diagnostics/storage' ? <StorageDiagnosticsPage /> : <App />}
    </MantineProvider>
  </StrictMode>,
)
