import { useState } from 'react'
import { Alert, Button, Group, Paper, Stack, Text, Title } from '@mantine/core'

export default function DeveloperClaimsTools({
  readOnly,
  onChange,
}: {
  readOnly: boolean
  onChange: (action: 'add' | 'remove') => Promise<void>
}) {
  const [pending, setPending] = useState<'add' | 'remove'>()
  const [error, setError] = useState<string>()
  const [message, setMessage] = useState('')

  async function change(action: 'add' | 'remove') {
    if (pending || readOnly) return
    setPending(action)
    setError(undefined)
    setMessage('')
    try {
      await onChange(action)
      setMessage(action === 'add' ? 'Dummy claims are ready.' : 'Dummy claims removed. Other claims were left unchanged.')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Dummy claims could not be changed.')
    } finally {
      setPending(undefined)
    }
  }

  return (
    <Paper component="section" aria-labelledby="developer-claims-heading" withBorder p="md" radius="md">
      <Stack gap="sm">
        <Title id="developer-claims-heading" order={2}>Developer claim tools</Title>
        <Text size="sm">
          Add four persistent dummy records to this profile, including duplicate identifiers,
          missing start dates, and a long identifier. Adding again does not duplicate them.
          Three claims include example activities of all three kinds, across several weeks
          with empty gaps; the long-name claim starts empty. Existing fixture edits are preserved.
          Remove deletes these tool-owned claims and all their activities, without confirmation,
          including activities you added to those claims. Other claims are left unchanged.
        </Text>
        {readOnly && (
          <Text size="sm" c="dimmed">
            This profile is read-only. To test writes, return to profiles and connect the simulated
            provider, or use a profile with persistent storage granted.
          </Text>
        )}
        <Group>
          <Button variant="light" disabled={readOnly || Boolean(pending)} loading={pending === 'add'} onClick={() => void change('add')}>
            Add dummy claims
          </Button>
          <Button color="red" variant="light" disabled={readOnly || Boolean(pending)} loading={pending === 'remove'} onClick={() => void change('remove')}>
            Remove dummy claims
          </Button>
        </Group>
        <Text component="output" size="sm">{message}</Text>
        {error && <Alert color="red" title="Dummy claims could not be changed">{error} Retry using the controls above.</Alert>}
      </Stack>
    </Paper>
  )
}
