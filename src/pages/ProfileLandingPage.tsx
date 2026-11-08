import { useEffect, useRef, useState } from 'react'
import { Alert, Anchor, Badge, Button, Container, Group, Loader, Paper, Stack, Text, Title } from '@mantine/core'
import type { Profile, ProfileListing, ProfileSession } from '../storage/profiles'
import { listProfiles, openProfile } from '../storage/profiles'

type DiscoveryState =
  | { state: 'loading' }
  | { state: 'loaded'; listing: ProfileListing }
  | { state: 'error'; message: string }

export default function ProfileLandingPage() {
  const [attempt, setAttempt] = useState(0)
  return <ProfileDiscovery key={attempt} onRetry={() => setAttempt((value) => value + 1)} />
}

function ProfileDiscovery({ onRetry }: { onRetry: () => void }) {
  const [discovery, setDiscovery] = useState<DiscoveryState>({ state: 'loading' })
  const [selectedProfile, setSelectedProfile] = useState<Profile>()
  const [openingId, setOpeningId] = useState<string>()
  const [selectionError, setSelectionError] = useState<string>()
  const activeSession = useRef<ProfileSession | null>(null)
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true
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
      mounted.current = false
      const session = activeSession.current
      activeSession.current = null
      void session?.dispose().catch((error: unknown) => {
        console.error('Could not close the active profile storage session.', error)
      })
    }
  }, [])

  async function selectProfile(profile: Profile) {
    setOpeningId(profile.id)
    setSelectionError(undefined)

    try {
      const previousSession = activeSession.current
      if (previousSession) {
        await previousSession.dispose()
        if (activeSession.current === previousSession) activeSession.current = null
        if (mounted.current) setSelectedProfile(undefined)
      }

      const nextSession = await openProfile(profile.id)
      if (!mounted.current) {
        await nextSession.dispose()
        return
      }
      activeSession.current = nextSession
      setSelectedProfile(nextSession.profile)
    } catch (error) {
      if (mounted.current) {
        setSelectionError(error instanceof Error ? error.message : 'The selected profile could not be opened.')
      } else {
        console.error('Could not finish opening or close the selected profile.', error)
      }
    } finally {
      if (mounted.current) setOpeningId(undefined)
    }
  }

  const listing = discovery.state === 'loaded' ? discovery.listing : undefined
  const hasDiscoveryErrors = Boolean(listing && listing.errors.length > 0)

  return (
    <Container component="main" size="md" py="xl">
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
            <Button variant="light" onClick={onRetry}>Retry profile discovery</Button>
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
            <Stack component="ul" gap="sm" p={0} style={{ listStyle: 'none' }}>
              {listing.profiles.map((profile) => (
                <Paper component="li" key={profile.id} withBorder p="md" radius="md">
                  <Group justify="space-between" wrap="nowrap">
                    <Stack gap={2}>
                      <Text fw={600}>{profile.label}</Text>
                      {profile.realName && <Text c="dimmed" size="sm">{profile.realName}</Text>}
                    </Stack>
                    <Button
                      variant={selectedProfile?.id === profile.id ? 'filled' : 'light'}
                      aria-pressed={selectedProfile?.id === profile.id}
                      aria-label={`${profile.label} profile`}
                      disabled={Boolean(openingId)}
                      loading={openingId === profile.id}
                      onClick={() => void selectProfile(profile)}
                    >
                      {selectedProfile?.id === profile.id ? 'Selected' : 'Open profile'}
                    </Button>
                  </Group>
                </Paper>
              ))}
            </Stack>
          )}

          {listing && listing.profiles.length === 0 && !hasDiscoveryErrors && (
            <Paper withBorder p="lg" radius="md">
              <Stack gap="xs">
                <Title order={3}>No local profiles yet</Title>
                <Text c="dimmed">
                  Create a profile to keep your job-search records organized. Profile creation
                  will be available here in the next setup step.
                </Text>
              </Stack>
            </Paper>
          )}

          {selectedProfile && (
            <Paper withBorder p="md" radius="md">
              <Stack gap="xs">
                <Text component="output" fw={600} aria-live="polite">
                  {selectedProfile.label} is selected and open.
                </Text>
                <Text c="dimmed">The claims overview will be available in a later step.</Text>
              </Stack>
            </Paper>
          )}
          {openingId && (
            <Text aria-live="polite">
              Opening {listing?.profiles.find((profile) => profile.id === openingId)?.label ?? 'profile'}...
            </Text>
          )}
          {selectionError && (
            <Alert color="red" title="The selected profile could not be opened">
              <Text>{selectionError}</Text>
              <Text mt="xs">Retry by selecting the profile again. No profile data was changed.</Text>
            </Alert>
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
    </Container>
  )
}
