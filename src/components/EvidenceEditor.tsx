import { useState } from 'react'
import { Alert, Button, Fieldset, Group, Paper, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { evidenceLimits, fileSizeLabel, validateEvidence } from '../storage/evidence-model'
import type { EvidenceDraft } from '../storage/evidence-model'

export default function EvidenceEditor({ value, onChange, disabled }: {
  value: EvidenceDraft
  onChange: (value: EvidenceDraft) => void
  disabled: boolean
}) {
  const [error, setError] = useState<string>()

  function addFiles(files: File[]) {
    if (disabled || files.length === 0) return
    try {
      const next: EvidenceDraft = { ...value, files: [...value.files, ...files.map((file) => ({
        id: crypto.randomUUID(), name: file.name, type: file.type, size: file.size, description: '', file,
      }))] }
      validateEvidence({ links: [], files: next.files })
      onChange(next)
      setError(undefined)
    } catch (failure) {
      setError(`${failure instanceof Error ? failure.message : 'These files could not be added.'} No files from this selection were added; your previous entries are unchanged.`)
    }
  }

  return (
    <Fieldset legend="Supporting evidence (optional)" disabled={disabled} onPaste={(event) => {
      const pictures = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/'))
      if (pictures.length > 0) {
        event.preventDefault()
        addFiles(pictures)
      }
    }}>
      <Stack gap="sm">
        <Text size="sm">Stored only in this browser profile, not synced or backed up. Changes apply when you save the activity.</Text>
        <Text size="sm">Up to 20 HTTP/HTTPS links and 10 files. Any file type; 10 MiB per file, 25 MiB total. Files are download-only, never previewed or opened automatically.</Text>
        {value.links.map((link, index) => (
          <Paper key={link.id} withBorder p="sm" radius="sm">
            <Stack gap="xs">
              <TextInput label={`Link ${index + 1} label (optional)`} maxLength={evidenceLimits.label}
                value={link.label} onChange={(event) => {
                  const label = event.currentTarget.value
                  onChange({ ...value, links: value.links.map((item) => item.id === link.id ? { ...item, label } : item) })
                }} />
              <TextInput label={`Link ${index + 1} URL`} maxLength={evidenceLimits.url} required
                value={link.url} onChange={(event) => {
                  const url = event.currentTarget.value
                  onChange({ ...value, links: value.links.map((item) => item.id === link.id ? { ...item, url } : item) })
                }} />
              <Button variant="subtle" color="red" size="compact-sm" aria-label={`Remove link ${index + 1}`}
                onClick={() => onChange({ ...value, links: value.links.filter((item) => item.id !== link.id) })}>Remove link</Button>
            </Stack>
          </Paper>
        ))}
        <Group>
          <Button variant="light" disabled={disabled || value.links.length >= evidenceLimits.links}
            onClick={() => onChange({ ...value, links: [...value.links, { id: crypto.randomUUID(), label: '', url: '' }] })}>Add link</Button>
        </Group>
        {value.files.map((file, index) => (
          <Paper key={file.id} withBorder p="sm" radius="sm" style={{ overflowWrap: 'anywhere' }}>
            <Stack gap="xs">
              <Text fw={500}>{file.name}</Text>
              <Text size="sm">{file.type || 'Type not provided'} - {fileSizeLabel(file.size)}</Text>
              <Textarea label={`File ${index + 1} description (optional)`} maxLength={evidenceLimits.description}
                autosize minRows={2} maxRows={4} value={file.description} onChange={(event) => {
                  const description = event.currentTarget.value
                  onChange({ ...value, files: value.files.map((item) => item.id === file.id ? { ...item, description } : item) })
                }} />
              <Button variant="subtle" color="red" size="compact-sm" aria-label={`Remove file ${file.name}`}
                onClick={() => onChange({ ...value, files: value.files.filter((item) => item.id !== file.id) })}>Remove file</Button>
            </Stack>
          </Paper>
        ))}
        <Fieldset legend="Add evidence files" p="md" radius="sm"
          aria-disabled={disabled} tabIndex={disabled ? -1 : 0} style={{ borderStyle: 'dashed' }}
          onDragOver={(event) => {
            event.preventDefault()
            event.dataTransfer.dropEffect = disabled ? 'none' : 'copy'
          }}
          onDrop={(event) => {
            event.preventDefault()
            addFiles(Array.from(event.dataTransfer.files))
          }}>
          <Stack gap="xs">
            <Text size="sm">Drop files here, or focus this area and paste a picture from your clipboard.</Text>
            <TextInput type="file" label="Choose files" multiple onChange={(event) => {
              addFiles(Array.from(event.currentTarget.files ?? []))
              event.currentTarget.value = ''
            }} />
          </Stack>
        </Fieldset>
        {error && <Alert color="red" title="Files could not be added">{error}</Alert>}
      </Stack>
    </Fieldset>
  )
}
