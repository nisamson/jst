import { useRef, useState } from 'react'
import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core'
import { activityTitle } from '../storage/activity-model'
import type { Activity } from '../storage/activity-model'
import RecordTechnicalDetails from './RecordTechnicalDetails'

export default function DeleteActivityDialog({ activity, selectionLabel, onConfirm, onClose }: {
  activity: Activity
  selectionLabel?: string
  onConfirm: () => Promise<void>
  onClose: () => void
}) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string>()
  const busy = useRef(false)
  async function confirm() {
    if (busy.current) return
    busy.current = true
    setDeleting(true)
    setError(undefined)
    try { await onConfirm() } catch (failure) {
      setError(`${failure instanceof Error ? failure.message : 'The activity could not be deleted.'} Retry or cancel; the record has not been removed from this view.`)
    } finally {
      busy.current = false
      setDeleting(false)
    }
  }
  return (
    <Modal opened title="Delete activity?" onClose={onClose} centered closeOnEscape={!deleting} closeOnClickOutside={!deleting} withCloseButton={!deleting}>
      <Stack>
        <Text style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{selectionLabel ?? activityTitle(activity)}</Text>
        <Text>Activity date: {activity.activity_date}</Text>
        <Text size="sm">Created: {new Date(activity.created_at).toLocaleString()}</Text>
        <RecordTechnicalDetails key={activity.id} recordId={activity.id} />
        <Text>This permanently deletes only this activity. Other activities and the claim are unchanged. There is no undo.</Text>
        {error && <Alert color="red" title="Activity could not be deleted">{error}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" disabled={deleting} onClick={onClose}>Cancel</Button>
          <Button color="red" disabled={deleting} loading={deleting} onClick={() => void confirm()}>Delete activity</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
