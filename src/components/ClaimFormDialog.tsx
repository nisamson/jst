import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Alert, Button, Group, Modal, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { normalizeClaimInput } from '../storage/claims'
import type { Claim, ClaimInput } from '../storage/claims'
import { IconEdit, IconPlus } from '@tabler/icons-react'

export default function ClaimFormDialog({
  claim,
  readOnly,
  onClose,
  onSave,
}: {
  claim?: Claim
  readOnly: boolean
  onClose: () => void
  onSave: (input: ClaimInput) => Promise<void>
}) {
  const [identifier, setIdentifier] = useState(claim?.identifier ?? '')
  const [claimStartDate, setClaimStartDate] = useState(claim?.claimStartDate ?? '')
  const [overview, setOverview] = useState(claim?.overview ?? '')
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const dateInputRef = useRef<HTMLInputElement>(null)
  const title = claim ? 'Edit claim' : 'Create claim'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (savingRef.current || readOnly) return
    try {
      if (dateInputRef.current && !dateInputRef.current.validity.valid) {
        throw new Error('Choose a complete, valid claim start date, or clear it.')
      }
      const input = normalizeClaimInput({ identifier, claimStartDate, overview })
      savingRef.current = true
      setSaving(true)
      setError(undefined)
      await onSave(input)
    } catch (failure) {
      setError(`${failure instanceof Error ? failure.message : 'The claim could not be saved.'} Your entries are unchanged. Retry when ready.`)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <Modal opened title={title} onClose={onClose} centered closeOnEscape={!saving} closeOnClickOutside={!saving} withCloseButton={!saving}>
      <form noValidate aria-busy={saving} onSubmit={(event) => void submit(event)}>
        <Stack gap="md">
          <Text size="sm">This is your own record label, not an ESD validation. Duplicate identifiers are allowed.</Text>
          <TextInput
            label="Claim identifier"
            value={identifier}
            onChange={(event) => setIdentifier(event.currentTarget.value)}
            required
            autoComplete="off"
            disabled={saving || readOnly}
          />
          <TextInput
            ref={dateInputRef}
            type="date"
            label="Claim start date (optional)"
            description="Choose a date or enter it using your browser's date format. Use Clear start date to leave it unset. This is separate from the record creation time."
            min="0001-01-01"
            max="9999-12-31"
            value={claimStartDate}
            onChange={(event) => setClaimStartDate(event.currentTarget.value)}
            autoComplete="off"
            disabled={saving || readOnly}
          />
          <Group>
            <Button
              type="button"
              variant="subtle"
              disabled={saving || readOnly}
              onClick={() => {
                if (dateInputRef.current) dateInputRef.current.value = ''
                setClaimStartDate('')
                dateInputRef.current?.focus()
              }}
            >
              Clear start date
            </Button>
          </Group>
          <Textarea
            label="Overview (optional)"
            description="Overall notes or description for this claim. Leave blank to remove them."
            value={overview}
            onChange={(event) => setOverview(event.currentTarget.value)}
            autosize
            minRows={3}
            maxRows={8}
            disabled={saving || readOnly}
          />
          {readOnly && <Alert color="yellow" title="Profile is read-only">Claim changes are blocked.</Alert>}
          {error && <Alert color="red" title="Claim could not be saved">{error}</Alert>}
          <Group justify="flex-end">
            <Button type="button" variant="default" disabled={saving} onClick={onClose}>Cancel</Button>
            <Button leftSection={claim ? <IconEdit size={16} aria-hidden /> : <IconPlus size={16} aria-hidden />} type="submit" disabled={readOnly || saving}
              loading={saving}>{claim ? 'Save changes' : 'Create claim'}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
