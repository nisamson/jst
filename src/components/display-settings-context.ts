import { createContext, useContext } from 'react'
import { developerToolsEnabled } from '../storage/developer-tools'

export const DisplaySettingsContext = createContext({
  advanced: developerToolsEnabled(),
  setAdvanced: (_value: boolean) => {},
})

export function useDisplaySettings() {
  return useContext(DisplaySettingsContext)
}
