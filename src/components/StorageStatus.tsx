import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { initializeStorage } from '../storage/local-storage'
import type { StorageSession } from '../storage/local-storage'
import type { Persistence } from '../storage/environment'
import { requestPersistence } from '../storage/environment'
import './StorageStatus.css'

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
    <section className="storage-status" aria-label="Local storage">
      {status.state === 'checking' && <output>Checking local storage...</output>}
      {status.state === 'blocked' && (
        <>
          <p role="alert">Local storage is unavailable. {status.message}</p>
          <p>Storage-dependent features are blocked. No fallback storage will be used.</p>
          <button type="button" onClick={onRetry}>Retry storage setup</button>
        </>
      )}
      {status.state === 'ready' && (
        <>
          <output>Local SQLite storage is ready.</output>
          {status.persistence !== 'granted' && (
            <p role="note">
              {status.persistence === undefined
                ? 'Persistent storage permission is pending. You can continue while the browser waits for your choice.'
                : status.persistence === 'denied'
                ? 'Persistent storage was not granted.'
                : status.persistence === 'unavailable'
                  ? 'Persistent storage permission is not supported by this browser.'
                  : 'Persistent storage permission could not be checked or requested.'}
              {' '}The browser may automatically clear local records.
            </p>
          )}
          <p>Local records can still be lost or cleared, even with persistent storage permission. This is not a backup.</p>
          {children}
        </>
      )}
    </section>
  )
}
