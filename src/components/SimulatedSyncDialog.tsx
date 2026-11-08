import { useEffect, useState } from 'react'
import { Alert, Button, Group, Loader, Modal, Paper, Stack, Text, Title } from '@mantine/core'
import { getSimulatedSyncState, saveSimulatedSyncState } from '../storage/simulated-sync-state'
import type { SimulatedSyncState } from '../storage/simulated-sync-state'
import { simulatedProvider } from '../sync/simulated-provider'
import type { SimulatedCloudProfile } from '../sync/simulated-provider'

interface SimulatedSyncDialogProps {
  profileId: string
  profileLabel: string
  onClose: () => void
}

export default function SimulatedSyncDialog({
  profileId,
  profileLabel,
  onClose,
}: SimulatedSyncDialogProps) {
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [cloudProfiles, setCloudProfiles] = useState<SimulatedCloudProfile[]>([])
  const [setupState, setSetupState] = useState<SimulatedSyncState>()
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [loadError, setLoadError] = useState<string>()
  const [setupError, setSetupError] = useState<string>()
  const [notice, setNotice] = useState<string>()

  useEffect(() => {
    let cancelled = false
    Promise.all([
      getSimulatedSyncState(profileId),
      simulatedProvider.listCloudProfiles(),
    ]).then(([savedState, profiles]) => {
      if (cancelled) return
      setSetupState(savedState)
      setCloudProfiles(profiles)
      setLoading(false)
    }).catch((failure: unknown) => {
      if (cancelled) return
      const message = failure instanceof Error ? failure.message : 'Simulated setup could not be loaded.'
      setLoadError(loadAttempt > 0 ? `${message} Retry or continue locally.` : message)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [profileId, loadAttempt])

  async function connect() {
    setConnecting(true)
    setSetupError(undefined)
    setNotice(undefined)
    try {
      const result = await simulatedProvider.connect()
      if (result.status === 'cancelled') {
        setNotice('Setup was cancelled. No connection state was saved.')
        return
      }
      const state: SimulatedSyncState = {
        providerId: 'dummy',
        accountLabel: result.accountLabel,
        connectedAt: new Date().toISOString(),
      }
      await saveSimulatedSyncState(profileId, state)
      setSetupState(state)
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'Simulated setup failed.'
      setSetupError(`${message} Your local profile is unchanged. Retry setup or continue locally.`)
    } finally {
      setConnecting(false)
    }
  }

  return (
    <Modal
      opened
      onClose={onClose}
      title="Simulated sync setup"
      centered
      closeOnEscape={!connecting}
      closeOnClickOutside={!connecting}
      withCloseButton={!connecting}
    >
      <Stack gap="md">
        <Text>
          Set up a simulated provider for <strong>{profileLabel}</strong>. This is a demo only:
          no authorization, data transfer, synchronization, or backup is performed.
        </Text>

        {loading && (
          <Group>
            <Loader size="sm" />
            <Text aria-live="polite">Loading simulated setup...</Text>
          </Group>
        )}

        {!loading && loadError && (
          <Alert color="red" title="Simulated setup is unavailable">
            <Stack gap="sm">
              <Text>{loadError}</Text>
              <Button
                variant="light"
                onClick={() => {
                  setLoading(true)
                  setLoadError(undefined)
                  setLoadAttempt((attempt) => attempt + 1)
                }}
              >
                Retry loading setup
              </Button>
            </Stack>
          </Alert>
        )}

        {!loading && !loadError && (
          <>
            <Paper withBorder p="md" radius="md">
              <Stack gap="xs">
                <Title order={3}>Simulated cloud profiles</Title>
                {cloudProfiles.length > 0
                  ? cloudProfiles.map((profile) => <Text key={profile.id}>{profile.label}</Text>)
                  : <Text c="dimmed">No simulated cloud profiles are available.</Text>}
                <Text c="dimmed" size="sm">
                  These examples are for display only. Listing them does not import, restore,
                  merge, or overwrite local profiles.
                </Text>
              </Stack>
            </Paper>

            {setupState
              ? (
                <Alert color="green" title="Simulated setup complete">
                  {setupState.accountLabel} is marked as connected for this local profile.
                  No data has been synced or backed up.
                </Alert>
              )
              : !setupError && (
                <Button loading={connecting} onClick={() => void connect()}>
                  Connect simulated provider
                </Button>
              )}
          </>
        )}

        {notice && <output>{notice}</output>}
        {!loading && !loadError && setupError && (
          <Alert color="red" title="Setup did not complete">
            <Stack gap="sm">
              <Text>{setupError}</Text>
              <Button variant="light" onClick={() => void connect()} loading={connecting}>
                Retry setup
              </Button>
            </Stack>
          </Alert>
        )}

        <Group justify="flex-end">
          <Button variant="default" disabled={connecting} onClick={onClose}>
            Continue locally
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
