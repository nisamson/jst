import { useState } from 'react'
import { Alert, Anchor, Button, Fieldset, Group, Stack, Text } from '@mantine/core'
import { loadProfileEvidenceFile } from '../storage/evidence'
import { downloadFilename, fileSizeLabel } from '../storage/evidence-model'
import type { ActivityEvidence } from '../storage/evidence-model'

export default function EvidenceDetails({ evidence, profileId, claimId, activityId }: {
  evidence: ActivityEvidence
  profileId: string
  claimId: string
  activityId: string
}) {
  const [downloading, setDownloading] = useState<string>()
  const [error, setError] = useState<string>()

  async function download(id: string) {
    setDownloading(id)
    setError(undefined)
    try {
      const file = await loadProfileEvidenceFile(profileId, claimId, activityId, id)
      const url = URL.createObjectURL(new Blob([new Uint8Array(file.bytes)], { type: 'application/octet-stream' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = downloadFilename(file.name)
      document.body.append(anchor)
      try { anchor.click() } finally {
        anchor.remove()
        // Allow the browser to consume the URL before releasing its bytes.
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
    } catch (failure) {
      setError(`${failure instanceof Error ? failure.message : 'The file could not be downloaded.'} Use Download to retry.`)
    } finally { setDownloading(undefined) }
  }

  return (
    <Fieldset legend="Supporting evidence">
      <Stack gap="sm">
        <Text size="sm">Stored only in this browser profile, not synced or backed up. Links open in a new tab.</Text>
        {evidence.links.length === 0 && evidence.files.length === 0 && <Text size="sm">No links or files recorded.</Text>}
        {evidence.links.length > 0 && (
          <Stack component="ul" gap="xs" m={0} pl="md">
            {evidence.links.map((link) => <li key={link.id}>
              <Anchor href={link.url} target="_blank" rel="noopener noreferrer">{link.label || link.url}</Anchor>
              {link.label && <Text size="xs" c="dimmed">{link.url}</Text>}
            </li>)}
          </Stack>
        )}
        {evidence.files.length > 0 && <Text size="sm">Files download without preview. Only open downloaded files you trust; file names and declared types do not guarantee safety.</Text>}
        {evidence.files.map((file) => (
          <Stack key={file.id} gap={4}>
            <Group justify="space-between">
              <Text fw={500}>{file.name}</Text>
              <Button variant="light" size="compact-sm" aria-label={`Download ${file.name}`} disabled={downloading !== undefined}
                loading={downloading === file.id} onClick={() => void download(file.id)}>Download</Button>
            </Group>
            <Text size="sm">{file.type || 'Type not provided'} - {fileSizeLabel(file.size)}</Text>
            {file.description && <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{file.description}</Text>}
          </Stack>
        ))}
        {error && <Alert color="red" title="File could not be downloaded">{error}</Alert>}
      </Stack>
    </Fieldset>
  )
}
