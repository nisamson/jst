import { useCallback, useEffect, useState } from 'react'
import { ActionIcon, Alert, Anchor, Badge, Button, Container, Group, Loader, Paper, SimpleGrid, Stack, Text, Title, Tooltip } from '@mantine/core'
import { IconCloudCheck, IconCloudOff, IconDownload, IconFolderOpen, IconTrash } from '@tabler/icons-react'
import CreateProfileForm from '../components/CreateProfileForm'
import ConfirmDeletionDialog from '../components/ConfirmDeletionDialog'
import SimulatedSyncDialog from '../components/SimulatedSyncDialog'
import ExportProfileDialog from '../components/ExportProfileDialog'
import ImportProfileDialog from '../components/ImportProfileDialog'
import { useRequestStoragePersistence } from '../components/storage-persistence-context'
import type { Profile, ProfileListing } from '../storage/profiles'
import type { CreateProfileInput } from '../storage/profiles'
import { createProfile, deleteProfile, importProfile, listProfiles } from '../storage/profiles'
import AdvancedDetails from '../components/AdvancedDetails'

type DiscoveryState =
  | { state: 'loading' }
  | { state: 'loaded'; listing: ProfileListing }
  | { state: 'error'; message: string }

interface SetupFlow {
  profile: Profile
  continueToClaims: boolean
}

export default function ProfileLandingPage({ onOpenProfile }: { onOpenProfile: (id: string) => void }) {
  const [attempt, setAttempt] = useState(0)
  return (
    <ProfileDiscovery
      key={attempt}
      onOpenProfile={onOpenProfile}
      onRetry={() => setAttempt((value) => value + 1)}
    />
  )
}

function ProfileDiscovery({
  onOpenProfile,
  onRetry,
}: {
  onOpenProfile: (id: string) => void
  onRetry: () => void
}) {
  const [discovery, setDiscovery] = useState<DiscoveryState>({ state: 'loading' })
  const [creatingProfile, setCreatingProfile] = useState(false)
  const [setupFlow, setSetupFlow] = useState<SetupFlow>()
  const [profileToDelete, setProfileToDelete] = useState<Profile>()
  const [profileToExport, setProfileToExport] = useState<Profile>()
  const [importingProfile, setImportingProfile] = useState(false)
  const requestStoragePersistence = useRequestStoragePersistence()

  useEffect(() => {
    let cancelled = false
    listProfiles().then((listing) => {
      if (!cancelled) setDiscovery({ state: 'loaded', listing })
    }).catch((error: unknown) => {
      if (!cancelled) {
        setDiscovery({
          state: 'error',
          message: error instanceof Error ? error.message : 'Local profiles could not be loaded.',
        })
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function saveProfile(input: CreateProfileInput) {
    await requestStoragePersistence()
    const profile = await createProfile(input)
    addProfile(profile)
    setCreatingProfile(false)
    setSetupFlow({ profile, continueToClaims: true })
  }

  function addProfile(profile: Profile) {
    setDiscovery((current) => {
      if (current.state !== 'loaded') return current
      return {
        state: 'loaded',
        listing: {
          ...current.listing,
          syncStatuses: { ...current.listing.syncStatuses, [profile.id]: { state: 'unconfigured' } },
          profiles: [...current.listing.profiles, profile]
            .toSorted((left, right) => left.label.localeCompare(right.label)),
        },
      }
    })
  }

  async function restoreProfile(bytes: Uint8Array<ArrayBuffer>) {
    await requestStoragePersistence()
    const profile = await importProfile(bytes)
    addProfile(profile)
    return profile
  }

  function finishSetupFlow() {
    if (!setupFlow) return
    setSetupFlow(undefined)
    if (setupFlow.continueToClaims) onOpenProfile(setupFlow.profile.id)
  }

  async function removeProfile(profile: Profile) {
    await deleteProfile(profile.id)
    setDiscovery((current) => current.state === 'loaded'
      ? {
        state: 'loaded',
        listing: {
          ...current.listing,
          profiles: current.listing.profiles.filter((item) => item.id !== profile.id),
        },
      }
      : current)
    setProfileToDelete(undefined)
  }

  const updateSyncStatus = useCallback((profileId: string, configured: boolean) => {
    setDiscovery((current) => current.state === 'loaded'
      ? {
        state: 'loaded',
        listing: {
          ...current.listing,
          syncStatuses: {
            ...current.listing.syncStatuses,
            [profileId]: { state: configured ? 'configured' : 'unconfigured' },
          },
        },
      }
      : current)
  }, [])

  const listing = discovery.state === 'loaded' ? discovery.listing : undefined
  const hasDiscoveryErrors = Boolean(listing && listing.errors.length > 0)

  return (
    <Container component="main" size="var(--app-content-width)" py="xl">
      <Stack gap="xl">
        <Stack gap="xs">
          <Title order={1}>Your profiles</Title>
          <Text c="dimmed">
            Choose a local profile to continue. Each profile is stored separately in this browser.
          </Text>
        </Stack>

        <Stack component="section" aria-labelledby="profile-list-heading" gap="md">
          <Group justify="space-between" align="flex-start">
            <Stack gap={4}>
              <Title id="profile-list-heading" order={2}>Local profiles</Title>
              <Text c="dimmed" size="sm">Your profiles stay on this device and in this browser.</Text>
            </Stack>
            <Group gap="xs">
              <Button variant="light" onClick={onRetry}>Retry profile discovery</Button>
              <Button variant="light" disabled={!listing} onClick={() => setImportingProfile(true)}>
                Restore from backup
              </Button>
              <Button
                variant="filled"
                aria-expanded={creatingProfile}
                aria-controls={creatingProfile ? 'create-profile-heading' : undefined}
                disabled={!listing}
                onClick={() => setCreatingProfile(true)}
              >
                Create profile
              </Button>
            </Group>
          </Group>

          {discovery.state === 'loading' && (
            <Group>
              <Loader size="sm" />
              <Text aria-live="polite">Loading local profiles...</Text>
            </Group>
          )}
          {discovery.state === 'error' && (
            <Alert color="red" title="Local profiles could not be loaded">
              <Text>{discovery.message}</Text>
              <Text mt="xs">Retry discovery. Your existing profile data has not been changed.</Text>
            </Alert>
          )}
          {hasDiscoveryErrors && (
            <Alert color="red" title="Some local profile files could not be read">
              <Text>They are not available to open; other profiles remain unchanged.</Text>
              <Stack component="ul" gap={4} mt="xs" pl="md">
                {listing?.errors.map((error) => (
                  <Text component="li" key={error.id} style={{ overflowWrap: 'anywhere' }}>
                    Profile<AdvancedDetails> {error.id}</AdvancedDetails>: {error.message}
                  </Text>
                ))}
              </Stack>
            </Alert>
          )}
          {listing && listing.profiles.length > 0 && (
            <SimpleGrid component="ul" cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm" p={0} style={{ listStyle: 'none' }}>
              {listing.profiles.map((profile) => {
                const syncStatus = listing.syncStatuses[profile.id]
                return (
                <Paper component="li" key={profile.id} withBorder p="md" radius="md">
                  <Group justify="space-between" wrap="nowrap" align="center">
                    <Stack gap={2} miw={0}>
                      <Text fw={600} style={{ overflowWrap: 'anywhere' }}>{profile.label}</Text>
                      {profile.realName && <Text c="dimmed" size="sm" style={{ overflowWrap: 'anywhere' }}>{profile.realName}</Text>}
                    </Stack>
                    <Group gap="xs" wrap="nowrap">
                      <Tooltip label="Open profile" events={{ hover: true, focus: true, touch: true }}>
                        <ActionIcon size="lg" variant="light" aria-label={`${profile.label} profile`}
                          onClick={() => onOpenProfile(profile.id)}>
                          <IconFolderOpen size={20} aria-hidden />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label={syncStatus?.state === 'configured'
                        ? 'Sync setup saved. No data has been synced or backed up.'
                        : syncStatus?.state === 'unconfigured'
                          ? 'No sync setup. Open sync setup.'
                          : 'Sync setup status unavailable. Open sync setup.'}
                        events={{ hover: true, focus: true, touch: true }}>
                        <ActionIcon size="lg" color={syncStatus?.state === 'configured' ? 'slate' : 'yellow'}
                          variant="light" aria-label={`Set up sync for ${profile.label} — ${syncStatus?.state === 'configured'
                            ? 'setup saved'
                            : syncStatus?.state === 'unconfigured'
                              ? 'not configured'
                              : 'status unavailable'}`}
                          onClick={() => setSetupFlow({ profile, continueToClaims: false })}>
                          {syncStatus?.state === 'configured'
                            ? <IconCloudCheck size={20} aria-hidden />
                            : <IconCloudOff size={20} aria-hidden />}
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Export profile database" events={{ hover: true, focus: true, touch: true }}>
                        <ActionIcon size="lg" variant="light" aria-label={`Export database for ${profile.label}`}
                          onClick={() => setProfileToExport(profile)}>
                          <IconDownload size={20} aria-hidden />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Delete profile" events={{ hover: true, focus: true, touch: true }}>
                        <ActionIcon size="lg" color="red" variant="light" aria-label={`Delete ${profile.label}`}
                          onClick={() => setProfileToDelete(profile)}>
                          <IconTrash size={20} aria-hidden />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Group>
                  {syncStatus?.state === 'error' && (
                    <Text role="alert" c="red" size="sm" mt="sm">
                      Sync setup status could not be loaded: {syncStatus.message}
                    </Text>
                  )}
                </Paper>
                )
              })}
            </SimpleGrid>
          )}

          {listing && listing.profiles.length === 0 && !hasDiscoveryErrors && (
            <Paper withBorder p="lg" radius="md">
              <Stack gap="xs">
                <Title order={3}>No local profiles yet</Title>
                <Text c="dimmed">
                  Create a profile to keep your job-search records organized. You can optionally
                  add your real name; no Social Security number is requested or stored.
                </Text>
              </Stack>
            </Paper>
          )}

          {creatingProfile && (
            <CreateProfileForm
              onSubmit={saveProfile}
              onCancel={() => setCreatingProfile(false)}
            />
          )}

        </Stack>

        <Group justify="space-between" align="center" pt="md" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
          <AdvancedDetails><Anchor href="/diagnostics/storage">Storage diagnostics</Anchor></AdvancedDetails>
          <Group gap="xs">
            <Badge color="gray" variant="light">Local only</Badge>
            <Text c="dimmed" size="sm">Local-only storage is not a backup.</Text>
          </Group>
        </Group>
      </Stack>
      {setupFlow && (
        <SimulatedSyncDialog
          key={setupFlow.profile.id}
          profileId={setupFlow.profile.id}
          profileLabel={setupFlow.profile.label}
          onSetupChanged={updateSyncStatus}
          onClose={setupFlow.continueToClaims ? finishSetupFlow : () => setSetupFlow(undefined)}
          onContinueLocally={setupFlow.continueToClaims ? finishSetupFlow : undefined}
          onSetupComplete={setupFlow.continueToClaims ? finishSetupFlow : undefined}
        />
      )}
      {profileToDelete && (
        <ConfirmDeletionDialog
          itemType="profile"
          name={profileToDelete.label}
          onClose={() => setProfileToDelete(undefined)}
          onConfirm={() => removeProfile(profileToDelete)}
        />
      )}
      {profileToExport && <ExportProfileDialog profile={profileToExport} onClose={() => setProfileToExport(undefined)} />}
      {importingProfile && <ImportProfileDialog onImport={restoreProfile} onOpenProfile={onOpenProfile}
        onClose={() => setImportingProfile(false)} />}
    </Container>
  )
}
