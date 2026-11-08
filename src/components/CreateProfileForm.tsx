import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Alert, Button, Group, Paper, Stack, TextInput, Title } from '@mantine/core'
import type { CreateProfileInput } from '../storage/profiles'

interface CreateProfileFormProps {
  onSubmit: (input: CreateProfileInput) => Promise<void>
  onCancel: () => void
}

export default function CreateProfileForm({ onSubmit, onCancel }: CreateProfileFormProps) {
  const [label, setLabel] = useState('')
  const [realName, setRealName] = useState('')
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (savingRef.current) return

    const normalizedLabel = label.trim()
    if (!normalizedLabel) {
      setError('Enter a profile label before creating the profile.')
      return
    }

    savingRef.current = true
    setSaving(true)
    setError(undefined)
    try {
      const normalizedRealName = realName.trim()
      await onSubmit({
        label: normalizedLabel,
        ...(normalizedRealName ? { realName: normalizedRealName } : {}),
      })
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'The profile could not be saved.'
      setError(`${message} Your entries are unchanged. Check local storage, then retry.`)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <Paper component="section" aria-labelledby="create-profile-heading" withBorder p="lg" radius="md">
      <form noValidate aria-busy={saving} onSubmit={(event) => void submit(event)}>
        <Stack gap="md">
          <Title id="create-profile-heading" order={3}>Create a local profile</Title>
          <TextInput
            label="Profile label"
            description="Choose a label to identify this profile. It does not need to be your real name."
            value={label}
            onChange={(event) => setLabel(event.currentTarget.value)}
            required
            autoComplete="off"
            disabled={saving}
          />
          <TextInput
            label="Real name (optional)"
            description="Stored once for this profile and shared across its claims."
            value={realName}
            onChange={(event) => setRealName(event.currentTarget.value)}
            autoComplete="name"
            disabled={saving}
          />
          {error && <Alert color="red" title="Profile could not be created">{error}</Alert>}
          <Group justify="flex-end">
            <Button type="button" variant="default" disabled={saving} onClick={onCancel}>Cancel</Button>
            <Button type="submit" loading={saving}>Create profile</Button>
          </Group>
        </Stack>
      </form>
    </Paper>
  )
}
