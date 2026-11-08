import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Alert, Button, Container, Paper, Stack, Text } from '@mantine/core'
import { initializeStorage } from '../storage/local-storage'
import type { StorageSession } from '../storage/local-storage'
import type { Persistence } from '../storage/environment'
import { requestPersistence } from '../storage/environment'
import { StoragePersistenceContext } from './storage-persistence-context'

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
  const mounted = useRef(false)

  useEffect(() => {
    let cancelled = false
    let session: StorageSession | undefined
    mounted.current = true
    initializeStorage().then((result) => {
      if (cancelled) {
        void result.dispose().catch(() => {})
        return
      }
      session = result
      setStatus({ state: 'ready' })
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
      mounted.current = false
      void session?.dispose().catch(() => {})
    }
  }, [])

  const requestPersistenceForProfileCreation = useCallback(async () => {
    const persistence = await requestPersistence()
    if (mounted.current) {
      setStatus((current) => current.state === 'ready' ? { state: 'ready', persistence } : current)
    }
    return persistence
  }, [])

  return (
    <Container size="var(--app-content-width)" px={{ base: 'md', sm: 0 }} py="md">
      {status.state === 'ready' ? (
        <StoragePersistenceContext.Provider value={requestPersistenceForProfileCreation}>
          <Paper component="section" aria-label="Local storage" withBorder p="md" radius="md">
            <Stack gap="sm">
              <Text component="output">Local SQLite storage is ready.</Text>
              {status.persistence && status.persistence !== 'granted' && (
                <Alert color="yellow" role="note" title="Persistent storage is not confirmed">
                  {status.persistence === 'denied'
                    ? 'Persistent storage was not granted.'
                    : status.persistence === 'unavailable'
                      ? 'Persistent storage permission is not supported by this browser.'
                      : status.persistence === 'unknown'
                        ? 'Persistent storage status could not be determined.'
                        : 'Persistent storage permission could not be checked or requested.'}{' '}
                  You can still create and read profiles. Profiles without verified persistence or simulated
                  sync are read-only, and the browser may automatically clear local records.
                </Alert>
              )}
              <Text c="dimmed" size="sm">
                Local records can still be lost or cleared, even with persistent storage permission. This is not a backup.
              </Text>
            </Stack>
          </Paper>
          {children}
        </StoragePersistenceContext.Provider>
      ) : (
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
          </Stack>
        </Paper>
      )}
    </Container>
  )
}
