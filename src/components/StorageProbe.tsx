import { useState } from 'react'
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
    <section className="storage-probe" aria-labelledby="probe-heading" aria-busy={busy}>
      <h2 id="probe-heading">Persistence check</h2>
      <p>Write a synthetic record, reload this page, then read the saved record to compare its token. Keep the same URL and browser.</p>
      <div className="probe-actions">
        <button type="button" disabled={busy} onClick={() => void run('write')}>Write and reopen test record</button>
        <button type="button" disabled={busy} onClick={() => void run('read')}>Read saved test record</button>
        <button type="button" disabled={busy || !expectedToken} onClick={() => window.location.reload()}>Reload page</button>
        <button type="button" disabled={busy || !expectedToken} onClick={() => void run('clear')}>Clear diagnostic test data</button>
      </div>
      <output aria-label="Diagnostic result">{message}</output>
      {error && (
        <div role="alert">
          <p>{error}</p>
          <p>Try writing a test record, check available storage, and close other diagnostics tabs before retrying.</p>
        </div>
      )}
      {record && (
        <dl>
          <dt>Record token</dt>
          <dd><code>{record.token}</code></dd>
          <dt>Written at</dt>
          <dd><time dateTime={record.writtenAt}>{record.writtenAt}</time></dd>
          <dt>SQLite version</dt>
          <dd>{record.sqliteVersion}</dd>
        </dl>
      )}
    </section>
  )
}
