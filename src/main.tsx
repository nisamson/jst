import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import '@mantine/core/styles.css'
import './index.css'
import App from './App.tsx'
import PwaStatus from './components/PwaStatus'
import StorageDiagnosticsPage from './pages/StorageDiagnosticsPage'
import DisclaimerFooter from './components/DisclaimerFooter'
import DisclaimerDialog from './components/DisclaimerDialog'
import AppHeader from './components/AppHeader'
import DisplaySettingsProvider from './components/DisplaySettingsProvider'
import LegalDocumentPage from './components/LegalDocumentPage'
import eula from './content/eula.md?raw'
import privacyPolicy from './content/privacy-policy.md?raw'

const pathname = window.location.pathname

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider defaultColorScheme="auto" theme={{
      primaryColor: 'slate',
      colors: {
        slate: ['#edf3f8', '#dce7ef', '#bdcfdf', '#9bb6cc', '#789cb9', '#547e9f', '#365a7a', '#2d4d69', '#243e56', '#1b3043'],
      },
      primaryShade: { light: 6, dark: 4 },
      autoContrast: true,
    }}>
      <DisplaySettingsProvider>
        <AppHeader />
        <DisclaimerDialog />
        <PwaStatus />
        <DisclaimerFooter position="top" />
        {pathname === '/diagnostics/storage' ? <StorageDiagnosticsPage />
          : pathname === '/eula' ? <LegalDocumentPage content={eula} />
            : pathname === '/privacy' ? <LegalDocumentPage content={privacyPolicy} />
              : <App />}
        <DisclaimerFooter position="bottom" />
      </DisplaySettingsProvider>
    </MantineProvider>
  </StrictMode>,
)
