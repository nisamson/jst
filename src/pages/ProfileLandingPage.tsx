import { useEffect, useState } from 'react'
import { Alert, Anchor, Badge, Button, Container, Group, Loader, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import CreateProfileForm from '../components/CreateProfileForm'
import SimulatedSyncDialog from '../components/SimulatedSyncDialog'
import { useRequestStoragePersistence } from '../components/storage-persistence-context'
import type { Profile, ProfileListing } from '../storage/profiles'
import type { CreateProfileInput } from '../storage/profiles'
import { createProfile, listProfiles } from '../storage/profiles'

type DiscoveryState =
  | { state: 'loading' }
  | { state: 'loaded'; listing: ProfileListing }
  | { state: 'error'; message: string }

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
  const [setupProfile, setSetupProfile] = useState<Profile>()
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
    setDiscovery((current) => {
      if (current.state !== 'loaded') return current
      return {
        state: 'loaded',
        listing: {
          ...current.listing,
          profiles: [...current.listing.profiles, profile]
            .toSorted((left, right) => left.label.localeCompare(right.label)),
        },
      }
    })
    setCreatingProfile(false)
  }

  const listing = discovery.state === 'loaded' ? discovery.listing : undefined
  const hasDiscoveryErrors = Boolean(listing && listing.errors.length > 0)

  return (
    <Container component="main" size="var(--app-content-width)" py="xl">
      <Stack gap="xl">
        <Stack gap="xs">
          <Text c="violet.6" fw={700} size="sm" tt="uppercase" lts={1.3}>
            Local-first job search tracker
          </Text>
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
                    Profile {error.id}: {error.message}
                  </Text>
                ))}
              </Stack>
            </Alert>
          )}

          {listing && listing.profiles.length > 0 && (
            <SimpleGrid component="ul" cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm" p={0} style={{ listStyle: 'none' }}>
              {listing.profiles.map((profile) => (
                <Paper component="li" key={profile.id} withBorder p="md" radius="md">
                  <Group justify="space-between" wrap="nowrap">
                    <Stack gap={2}>
                      <Text fw={600}>{profile.label}</Text>
                      {profile.realName && <Text c="dimmed" size="sm">{profile.realName}</Text>}
                    </Stack>
                    <Group gap="xs">
                      <Button
                        variant="light"
                        aria-label={`${profile.label} profile`}
                        onClick={() => onOpenProfile(profile.id)}
                      >
                        Open profile
                      </Button>
                      <Button
                        variant="default"
                        aria-label={`Set up simulated sync for ${profile.label}`}
                        onClick={() => setSetupProfile(profile)}
                      >
                        Simulated sync
                      </Button>
                    </Group>
                  </Group>
                </Paper>
              ))}
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
          <Anchor href="/diagnostics/storage">Storage diagnostics</Anchor>
          <Group gap="xs">
            <Badge color="gray" variant="light">Local only</Badge>
            <Text c="dimmed" size="sm">Local storage is not a backup.</Text>
          </Group>
        </Group>
      </Stack>
      {setupProfile && (
        <SimulatedSyncDialog
          key={setupProfile.id}
          profileId={setupProfile.id}
          profileLabel={setupProfile.label}
          onClose={() => setSetupProfile(undefined)}
        />
      )}
    </Container>
  )
}
