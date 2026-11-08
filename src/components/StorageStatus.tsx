import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Alert, Button, Container, Paper, Stack, Text } from '@mantine/core'
import { initializeStorage } from '../storage/local-storage'
import type { StorageSession } from '../storage/local-storage'
import type { Persistence } from '../storage/environment'
import { requestPersistence } from '../storage/environment'

type Status =
  | { state: 'checking' }
  | { state: 'ready'; persistence?: Persistence }
  | { state: 'blocked'; message: string }

export default function StorageStatus({ children }: { children?: ReactNode }) {
  const [attempt, setAttempt] = useState(0)
  return <StorageCheck key={attempt} onRetry={() => setAttempt((value) => value + 1)}>{children}</StorageCheck>
}

function StorageCheck({ onRetry, children }: { onRetry: () => void; children?: ReactNode }) {
  const [status, setStatus] = useState<Status>({ state: 'checking' })

  useEffect(() => {
    let cancelled = false
    let session: StorageSession | undefined
    initializeStorage().then((result) => {
      if (cancelled) {
        void result.dispose().catch(() => {})
        return
      }
      session = result
      setStatus({ state: 'ready' })
      void requestPersistence().then((persistence) => {
        if (!cancelled) setStatus({ state: 'ready', persistence })
      })
    }).catch((error: unknown) => {
      if (!cancelled) {
        setStatus({
          state: 'blocked',
          message: error instanceof Error ? error.message : 'Local storage setup failed.',
        })
      }
    })
    return () => {
      cancelled = true
      void session?.dispose().catch(() => {})
    }
  }, [])

  return (
    <Container size="md" py="md">
      <Paper component="section" aria-label="Local storage" withBorder p="md" radius="md">
        <Stack gap="sm">
          {status.state === 'checking' && <Text component="output">Checking local storage...</Text>}
          {status.state === 'blocked' && (
            <>
              <Alert color="red" title="Local storage is unavailable.">
                <Text>{status.message}</Text>
                <Text mt="xs">Storage-dependent features are blocked. No fallback storage will be used.</Text>
              </Alert>
              <Button variant="light" onClick={onRetry}>Retry storage setup</Button>
            </>
          )}
          {status.state === 'ready' && (
            <>
              <Text component="output">Local SQLite storage is ready.</Text>
              {status.persistence !== 'granted' && (
                <Alert color="yellow" role="note" title="Persistent storage is not confirmed">
                  {status.persistence === undefined
                    ? 'Persistent storage permission is pending. You can continue while the browser waits for your choice.'
                    : status.persistence === 'denied'
                    ? 'Persistent storage was not granted.'
                    : status.persistence === 'unavailable'
                      ? 'Persistent storage permission is not supported by this browser.'
                      : 'Persistent storage permission could not be checked or requested.'}
                  {' '}The browser may automatically clear local records.
                </Alert>
              )}
              <Text c="dimmed" size="sm">
                Local records can still be lost or cleared, even with persistent storage permission. This is not a backup.
              </Text>
              {children}
            </>
          )}
        </Stack>
      </Paper>
    </Container>
  )
}
