import type { ReactNode } from 'react'
import { useDisplaySettings } from './display-settings-context'

export default function AdvancedDetails({ children }: { children: ReactNode }) {
  return useDisplaySettings().advanced ? children : null
}
