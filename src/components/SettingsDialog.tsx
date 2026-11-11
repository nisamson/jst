import { Modal, Select, Stack, Switch, Text, useMantineColorScheme } from '@mantine/core'
import { useDisplaySettings } from './display-settings-context'

export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { colorScheme, setColorScheme } = useMantineColorScheme()
  const { advanced, setAdvanced } = useDisplaySettings()
  return (
    <Modal opened title="Settings" onClose={onClose} closeButtonProps={{ 'aria-label': 'Close' }} centered>
      <Stack gap="lg">
        <Select label="Theme" allowDeselect={false} value={colorScheme}
          data={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'auto', label: 'System' }]}
          onChange={(value) => {
            if (value === 'light' || value === 'dark' || value === 'auto') setColorScheme(value)
          }} />
        <Switch label="Advanced display" checked={advanced} onChange={(event) => setAdvanced(event.currentTarget.checked)}
          description="Show technical storage status, record IDs and timestamps, diagnostics, and developer tools where available. Safety warnings stay visible." />
        <Text size="sm" c="dimmed">
          Settings apply only to this browser and are not synced. If browser storage is unavailable, changes may not survive a reload.
        </Text>
      </Stack>
    </Modal>
  )
}
