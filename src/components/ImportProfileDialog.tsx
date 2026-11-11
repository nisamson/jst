import { useState } from 'react'
import { Alert, Button, FileInput, Group, Modal, Stack, Text } from '@mantine/core'
import { IconUpload } from '@tabler/icons-react'
import type { Profile } from '../storage/profiles'

export default function ImportProfileDialog({ onImport, onOpenProfile, onClose }: {
  onImport: (bytes: Uint8Array<ArrayBuffer>) => Promise<Profile>
  onOpenProfile: (id: string) => void
  onClose: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [restored, setRestored] = useState<Profile>()

  async function restore() {
    if (!file || busy) return
    setBusy(true)
    setError(undefined)
    try {
      setRestored(await onImport(new Uint8Array(await file.arrayBuffer())))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The profile could not be restored.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal opened title="Restore profile from backup" onClose={onClose}
      closeOnEscape={!busy} closeOnClickOutside={!busy} withCloseButton={!busy}>
      <Stack gap="md">
        <Text>Choose a SQLite database exported by this app. Restore creates a separate profile labeled as a restored copy.
          Existing profiles are never replaced or merged.</Text>
        <Alert color="yellow" title="Local restore only">
          The file is read on this device, not uploaded. Sync setup is not restored.
          Attachments remain download-only. Large backups may require substantial memory; keep this tab open while restoring.
        </Alert>
        {!restored && <FileInput label="Exported profile database" placeholder="Choose a backup file"
          accept=".sqlite3,.sqlite,.db" value={file} disabled={busy} clearable
          onChange={(value) => { setFile(value); setError(undefined) }} />}
        {busy && <Text component="output">Validating and restoring the profile...</Text>}
        {error && <Alert color="red" title="Profile could not be restored">
          {error} Existing profiles were not changed. Choose another backup or retry.
        </Alert>}
        {restored && <Text component="output" style={{ overflowWrap: 'anywhere' }}>
          Restored as <strong>{restored.label}</strong>. Sync is not configured for this copy.
        </Text>}
        <Group justify="flex-end">
          <Button variant="default" disabled={busy} onClick={onClose}>{restored ? 'Close' : 'Cancel'}</Button>
          {restored
            ? <Button onClick={() => onOpenProfile(restored.id)}>Open restored profile</Button>
            : <Button leftSection={<IconUpload size={16} aria-hidden />} disabled={!file || busy} onClick={() => void restore()}>
              Restore profile
            </Button>}
        </Group>
      </Stack>
    </Modal>
  )
}
