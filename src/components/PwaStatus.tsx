import { useEffect, useState } from 'react'
import { Alert, Button, Container, Stack, Text } from '@mantine/core'

export default function PwaStatus() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker>()
  const [offlineReady, setOfflineReady] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [updating, setUpdating] = useState(false)
  const [registrationError, setRegistrationError] = useState<string>()

  useEffect(() => {
    const updateConnection = () => setIsOnline(navigator.onLine)
    window.addEventListener('online', updateConnection)
    window.addEventListener('offline', updateConnection)
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) {
      return () => {
        window.removeEventListener('online', updateConnection)
        window.removeEventListener('offline', updateConnection)
      }
    }

    let registration: ServiceWorkerRegistration | undefined
    let cancelled = false
    const watchInstallingWorker = () => {
      const installing = registration?.installing
      if (!installing) return
      installing.addEventListener('statechange', () => {
        if (cancelled || installing.state !== 'installed') return
        if (navigator.serviceWorker.controller) setWaitingWorker(registration?.waiting ?? installing)
        else setOfflineReady(true)
      })
    }

    navigator.serviceWorker.register('/sw.js').then((result) => {
      if (cancelled) return
      registration = result
      if (result.waiting && navigator.serviceWorker.controller) setWaitingWorker(result.waiting)
      if (result.active && !navigator.serviceWorker.controller) setOfflineReady(true)
      result.addEventListener('updatefound', watchInstallingWorker)
      watchInstallingWorker()
    }).catch((error: unknown) => {
      if (!cancelled) {
        setRegistrationError(error instanceof Error ? error.message : 'The app could not enable offline support.')
      }
    })

    return () => {
      window.removeEventListener('online', updateConnection)
      window.removeEventListener('offline', updateConnection)
      registration?.removeEventListener('updatefound', watchInstallingWorker)
      cancelled = true
    }
  }, [])

  async function applyUpdate() {
    if (!waitingWorker) return
    setUpdating(true)
    setRegistrationError(undefined)
    const reloadWhenActivated = () => {
      if (waitingWorker.state !== 'activated') return
      waitingWorker.removeEventListener('statechange', reloadWhenActivated)
      window.location.reload()
    }
    waitingWorker.addEventListener('statechange', reloadWhenActivated)
    waitingWorker.postMessage({ type: 'SKIP_WAITING' }, [])
  }

  return (
    <Container component="section" aria-label="App availability" size="var(--app-content-width)" px={{ base: 'md', sm: 0 }} pt="md">
      <Stack gap="sm">
        {!isOnline && (
          <Alert color="yellow" title="You are offline">
            The cached app shell is available. Profile data is stored separately in browser storage and is not backed up.
          </Alert>
        )}
        {offlineReady && (
          <Alert color="green" title="Offline app ready" withCloseButton onClose={() => setOfflineReady(false)}>
            App assets are cached for future visits. This does not protect profile data from browser storage loss.
          </Alert>
        )}
        {waitingWorker && (
          <Alert color="blue" title="An app update is ready">
            <Text mb="sm">The new app version is cached and ready to load.</Text>
            <Button size="xs" loading={updating} onClick={() => void applyUpdate()}>
              Reload to update
            </Button>
          </Alert>
        )}
        {registrationError && (
          <Alert color="red" title="Offline support could not be enabled">
            {registrationError} Check your connection and reload to retry.
          </Alert>
        )}
      </Stack>
    </Container>
  )
}
