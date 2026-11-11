import { useEffect, useState } from 'react'
import { Alert, Button, Group, Loader, Modal, Paper, Stack, Text, Title, Tooltip } from '@mantine/core'
import { getSimulatedSyncState, removeSimulatedSyncState, saveSimulatedSyncState } from '../storage/simulated-sync-state'
import type { SimulatedSyncState } from '../storage/simulated-sync-state'
import { simulatedProvider } from '../sync/simulated-provider'
import type { SimulatedCloudProfile } from '../sync/simulated-provider'

const UNSYNCED_DATA_WARNING = 'Your data may be lost if this browser’s storage is cleared. Without syncing, there’s no cloud copy.'

interface SimulatedSyncDialogProps {
  profileId: string
  profileLabel: string
  onClose: () => void
  onContinueLocally?: () => void
  onSetupComplete?: () => void
  onSetupChanged?: (profileId: string, configured: boolean) => void
}

export default function SimulatedSyncDialog({
  profileId,
  profileLabel,
  onClose,
  onContinueLocally,
  onSetupComplete,
  onSetupChanged,
}: SimulatedSyncDialogProps) {
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [cloudProfiles, setCloudProfiles] = useState<SimulatedCloudProfile[]>([])
  const [setupState, setSetupState] = useState<SimulatedSyncState>()
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [confirmRemoving, setConfirmRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string>()
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
      onSetupChanged?.(profileId, Boolean(savedState))
      setCloudProfiles(profiles)
      setLoading(false)
    }).catch((failure: unknown) => {
      if (cancelled) return
      const message = failure instanceof Error ? failure.message : 'Sync setup could not be loaded.'
      setLoadError(loadAttempt > 0 ? `${message} Retry or continue locally.` : message)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [profileId, loadAttempt, onSetupChanged])

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
      onSetupChanged?.(profileId, true)
      if (setupState) setNotice('Setup completed again. No data has been synced or backed up.')
      onSetupComplete?.()
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'Sync setup failed.'
      setSetupError(`${message} Your local profile is unchanged. Retry setup or continue locally.`)
    } finally {
      setConnecting(false)
    }
  }

  async function removeSetup() {
    if (removing) return
    setRemoving(true)
    setRemoveError(undefined)
    try {
      await removeSimulatedSyncState(profileId)
      setSetupState(undefined)
      setSetupError(undefined)
      setConfirmRemoving(false)
      setNotice('Sync setup removed. Local profile data was not deleted.')
      onSetupChanged?.(profileId, false)
    } catch (failure) {
      setRemoveError(failure instanceof Error ? failure.message : 'Sync setup could not be removed.')
    } finally {
      setRemoving(false)
    }
  }

  return (
    <Modal
      opened
      onClose={onContinueLocally ?? onClose}
      title="Sync setup"
      centered
      closeOnEscape={!connecting && !removing}
      closeOnClickOutside={!connecting && !removing}
      withCloseButton={!connecting && !removing}
    >
      <Stack gap="md">
        <Text>
          Set up sync for <strong>{profileLabel}</strong> with <strong>Simulated storage</strong>.
          No data has been synced or backed up.
        </Text>

        {loading && (
          <Group>
            <Loader size="sm" />
            <Text aria-live="polite">Loading sync setup...</Text>
          </Group>
        )}

        {!loading && loadError && (
          <Alert color="red" title="Sync setup is unavailable">
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
                <Title order={3}>Available cloud profiles</Title>
                {cloudProfiles.length > 0
                  ? cloudProfiles.map((profile) => <Text key={profile.id}>{profile.label}</Text>)
                  : <Text c="dimmed">No cloud profiles are available.</Text>}
                <Text c="dimmed" size="sm">
                  These are example profiles. Listing them does not import, restore,
                  merge, or overwrite local profiles.
                </Text>
              </Stack>
            </Paper>

            {setupState && (
              <Alert color="green" title="Setup complete">
                Setup is saved for this local profile. No data has been synced or backed up.
              </Alert>
            )}
            {!setupError && (
              <Button loading={connecting} disabled={removing || confirmRemoving} onClick={() => void connect()}>
                {setupState ? 'Run setup again' : 'Connect provider'}
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

        {setupState ? (
          confirmRemoving ? (
            <Alert color="yellow" title="Remove sync setup?">
              <Stack gap="sm">
                <Text>
                  This removes the setup, not your local profile or records. Without persistent
                  storage permission, this profile may become read-only. No data has been backed up.
                </Text>
                {removeError && <Text role="alert" c="red">{removeError}</Text>}
                <Group>
                  <Button variant="default" disabled={removing} onClick={() => {
                    setConfirmRemoving(false)
                    setRemoveError(undefined)
                  }}>Cancel</Button>
                  <Button color="red" loading={removing} onClick={() => void removeSetup()}>Remove sync setup</Button>
                </Group>
              </Stack>
            </Alert>
          ) : (
            <Button color="red" variant="light" disabled={connecting} onClick={() => setConfirmRemoving(true)}>
              Remove sync setup
            </Button>
          )
        ) : <Stack gap="xs">
          <Alert color="yellow" title="Data loss risk" hiddenFrom="sm">
            {UNSYNCED_DATA_WARNING}
          </Alert>
          <Tooltip label={UNSYNCED_DATA_WARNING} multiline maw={280}>
            <Button
              color="yellow"
              variant="light"
              fullWidth
              leftSection={(
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M10.3 3.9 1.8 18.5A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-2.5L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                  <path d="M12 9v4m0 4h.01" />
                </svg>
              )}
              disabled={connecting}
              onClick={onContinueLocally ?? onClose}
            >
              Continue without syncing
            </Button>
          </Tooltip>
        </Stack>}
      </Stack>
    </Modal>
  )
}
