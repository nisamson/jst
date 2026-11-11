import { useState } from 'react'
import type { ReactNode } from 'react'
import { developerToolsEnabled } from '../storage/developer-tools'
import { DisplaySettingsContext } from './display-settings-context'

export default function DisplaySettingsProvider({ children }: { children: ReactNode }) {
  const [advanced, setValue] = useState(() => {
    try {
      const saved = localStorage.getItem('jst-advanced-display')
      if (saved === 'true' || saved === 'false') return saved === 'true'
    } catch { /* Use the environment default when storage is unavailable. */ }
    return developerToolsEnabled()
  })

  function setAdvanced(value: boolean) {
    setValue(value)
    try {
      localStorage.setItem('jst-advanced-display', String(value))
    } catch { /* Settings still apply for this visit. */ }
  }

  return <DisplaySettingsContext.Provider value={{ advanced, setAdvanced }}>{children}</DisplaySettingsContext.Provider>
}
