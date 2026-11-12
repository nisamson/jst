import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core'
import { IconDownload } from '@tabler/icons-react'
import { exportProfile } from '../storage/profiles'
import type { Profile } from '../storage/profiles'
import { profileExportFilename } from '../storage/profile-export-filename'

type ExportState = 'idle' | 'exporting' | 'cancelling' | 'cancelled' | 'requested' | 'error'

export default function ExportProfileDialog({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const [state, setState] = useState<ExportState>('idle')
  const [error, setError] = useState<string>()
  const controller = useRef<AbortController>(null)
  const busy = state === 'exporting' || state === 'cancelling'

  useEffect(() => () => controller.current?.abort(), [])

  async function download() {
    if (controller.current) return
    const operation = new AbortController()
    controller.current = operation
    setError(undefined)
    setState('exporting')
    try {
      const bytes = await exportProfile(profile.id, operation.signal)
      operation.signal.throwIfAborted()
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.sqlite3' }))
      let anchor: HTMLAnchorElement | undefined
      try {
        anchor = document.createElement('a')
        anchor.href = url
        anchor.download = profileExportFilename(profile.label)
        document.body.append(anchor)
        anchor.click()
      } finally {
        anchor?.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
      setState('requested')
    } catch (failure) {
      if (operation.signal.aborted) setState('cancelled')
      else {
        setError(failure instanceof Error ? failure.message : 'The database could not be exported.')
        setState('error')
      }
    } finally {
      controller.current = null
    }
  }

  return (
    <Modal opened title="Export profile database" onClose={onClose} closeOnEscape={!busy} closeOnClickOutside={!busy} withCloseButton={!busy}>
      <Stack gap="md">
        <Text style={{ overflowWrap: 'anywhere' }}>Export a local SQLite copy of <strong>{profile.label}</strong>, including its claims, activities, links, and attachments.</Text>
        <Alert color="yellow" title="Protect your exported file">
          This file contains personal records and attachments and is not encrypted. Store and share it carefully.
          Connection setup is excluded. Use Restore from backup on the profiles page to restore a separate copy.
        </Alert>
        {busy && <Text component="output">{state === 'cancelling' ? 'Cancelling export...' : 'Preparing the database export...'}</Text>}
        {state === 'cancelled' && <Text component="output">Export cancelled. No download was started.</Text>}
        {state === 'requested' && <Text component="output">Your browser was asked to download the database. Check your downloads.</Text>}
        {state === 'error' && <Alert color="red" title="Profile could not be exported">{error} Your local profile was not changed. Retry when ready.</Alert>}
        <Group justify="flex-end">
          <Button variant="default" disabled={state === 'cancelling'} onClick={() => {
            if (controller.current) {
              setState('cancelling')
              controller.current.abort()
            } else onClose()
          }}>{busy ? 'Cancel export' : 'Close'}</Button>
          <Button leftSection={<IconDownload size={16} aria-hidden />} disabled={busy} onClick={() => void download()}>
            Download database
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
