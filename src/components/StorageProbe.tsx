import { useState } from 'react'
import { Alert, Button, Code, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { clearDiagnosticRecord, readDiagnosticRecord, writeDiagnosticRecord } from '../storage/diagnostics'
import type { DiagnosticRecord } from '../storage/diagnostics'

function saveExpectedToken(token?: string) {
  const url = new URL(window.location.href)
  if (token) url.searchParams.set('probe', token)
  else url.searchParams.delete('probe')
  window.history.replaceState(null, '', url)
}

export default function StorageProbe() {
  const [expectedToken, setExpectedToken] = useState(
    () => new URLSearchParams(window.location.search).get('probe') ?? undefined,
  )
  const [record, setRecord] = useState<DiagnosticRecord>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [message, setMessage] = useState(expectedToken
    ? 'Read the saved record to check it against the token in this URL.'
    : 'No test has run yet.')

  async function run(action: 'write' | 'read' | 'clear') {
    setBusy(true)
    setError(undefined)
    setRecord(undefined)
    setMessage('Running the storage check...')
    try {
      if (action === 'clear') {
        await clearDiagnosticRecord()
        saveExpectedToken()
        setExpectedToken(undefined)
        setMessage('Diagnostic test data cleared. Profile data was not touched.')
      } else {
        const result = action === 'write'
          ? await writeDiagnosticRecord()
          : await readDiagnosticRecord(expectedToken)
        saveExpectedToken(result.token)
        setExpectedToken(result.token)
        setRecord(result)
        setMessage(action === 'write'
          ? 'Test record written and verified after closing and reopening the database.'
          : expectedToken
            ? 'Saved test record matches the expected token.'
            : 'Saved test record read. Reload and read it again to verify persistence.')
      }
    } catch (failure) {
      setMessage('Storage check failed. No successful result is being reported.')
      setError(failure instanceof Error ? failure.message : 'The diagnostic check failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Stack component="section" aria-labelledby="probe-heading" aria-busy={busy} gap="md">
      <Title id="probe-heading" order={2}>Persistence check</Title>
      <Text>Write a synthetic record, reload this page, then read the saved record to compare its token. Keep the same URL and browser.</Text>
      <Group gap="sm" wrap="wrap">
        <Button type="button" disabled={busy} onClick={() => void run('write')}>Write and reopen test record</Button>
        <Button type="button" variant="light" disabled={busy} onClick={() => void run('read')}>Read saved test record</Button>
        <Button type="button" variant="default" disabled={busy || !expectedToken} onClick={() => window.location.reload()}>Reload page</Button>
        <Button type="button" color="red" variant="light" disabled={busy || !expectedToken} onClick={() => void run('clear')}>Clear diagnostic test data</Button>
      </Group>
      <Text component="output" aria-label="Diagnostic result">{message}</Text>
      {error && (
        <Alert color="red" title={error}>
          Try writing a test record, check available storage, and close other diagnostics tabs before retrying.
        </Alert>
      )}
      {record && (
        <SimpleGrid component="dl" cols={{ base: 1, sm: 2 }} spacing="xs">
          <Text component="dt" fw={600}>Record token</Text>
          <Text component="dd" m={0} style={{ overflowWrap: 'anywhere' }}><Code>{record.token}</Code></Text>
          <Text component="dt" fw={600}>Written at</Text>
          <Text component="dd" m={0}><time dateTime={record.writtenAt}>{record.writtenAt}</time></Text>
          <Text component="dt" fw={600}>SQLite version</Text>
          <Text component="dd" m={0}>{record.sqliteVersion}</Text>
        </SimpleGrid>
      )}
    </Stack>
  )
}
