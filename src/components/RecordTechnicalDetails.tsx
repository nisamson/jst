import { useState } from 'react'
import { Box, Button, Group, Stack, Text } from '@mantine/core'
import { useDisplaySettings } from './display-settings-context'

export default function RecordTechnicalDetails({ recordId }: { recordId: string }) {
  const [message, setMessage] = useState('')
  const { advanced } = useDisplaySettings()
  async function copy() {
    try {
      await navigator.clipboard.writeText(recordId)
      setMessage('ID copied.')
    } catch {
      setMessage('Could not copy. Select the ID above to copy it manually.')
    }
  }
  if (!advanced) return null
  return (
    <Box component="details" key={recordId}>
      <Text component="summary" size="sm" c="dimmed" style={{ cursor: 'pointer' }}>Technical details</Text>
      <Stack gap="xs" mt="xs">
        <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere' }}>Record ID: {recordId}</Text>
        <Group gap="xs">
          <Button size="compact-xs" variant="subtle" onClick={() => void copy()}>Copy ID</Button>
          <Text component="output" size="xs">{message}</Text>
        </Group>
      </Stack>
    </Box>
  )
}
