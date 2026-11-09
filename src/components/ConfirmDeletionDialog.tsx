import { useState } from 'react'
import { Alert, Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core'

interface ConfirmDeletionDialogProps {
  itemType: 'profile' | 'claim'
  name: string
  recordId?: string
  onClose: () => void
  onConfirm: () => Promise<void>
}

export default function ConfirmDeletionDialog({
  itemType,
  name,
  recordId,
  onClose,
  onConfirm,
}: ConfirmDeletionDialogProps) {
  const [enteredName, setEnteredName] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string>()

  async function confirm() {
    if (enteredName !== name || deleting) return
    setDeleting(true)
    setError(undefined)
    try {
      await onConfirm()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : `The ${itemType} could not be deleted.`)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Modal
      opened
      onClose={onClose}
      title={`Delete ${itemType}?`}
      centered
      closeOnEscape={!deleting}
      closeOnClickOutside={!deleting}
      withCloseButton={!deleting}
    >
      <Stack gap="md">
        <Text>
          This permanently deletes {itemType === 'profile' ? 'the profile, all its claims, and all their activities' : 'this claim and all its associated activities'}.
          Type <strong>{name}</strong> to confirm.
        </Text>
        {recordId && <Text size="sm" style={{ overflowWrap: 'anywhere' }}>Record ID: {recordId}</Text>}
        <TextInput
          label={`Type ${itemType} name to confirm`}
          value={enteredName}
          onChange={(event) => setEnteredName(event.currentTarget.value)}
          autoComplete="off"
          disabled={deleting}
        />
        {error && <Alert color="red" title={`The ${itemType} could not be deleted`}>{error}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" disabled={deleting} onClick={onClose}>Cancel</Button>
          <Button
            color="red"
            disabled={enteredName !== name || deleting}
            loading={deleting}
            onClick={() => void confirm()}
          >
            Delete {itemType}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
