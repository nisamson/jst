import { openProfile } from './profiles'
import type { ProfileSession } from './profiles'

export interface SimulatedSyncState {
  providerId: 'dummy'
  accountLabel: string
  connectedAt: string
}

interface SimulatedSyncStateDependencies {
  openProfile: (id: string) => Promise<ProfileSession>
}

const defaultDependencies: SimulatedSyncStateDependencies = { openProfile }

export function createSimulatedSyncStateRepository(
  dependencies: SimulatedSyncStateDependencies = defaultDependencies,
) {
  async function getState(profileId: string): Promise<SimulatedSyncState | undefined> {
    const profile = await dependencies.openProfile(profileId)
    try {
      if (!profile.access.syncConnected) return undefined
      const connection = await profile.getStorageProviderConnection()
      if (!connection) return undefined
      if (connection.providerId !== 'dummy') throw new Error('This profile is connected to a different storage provider.')
      return {
        providerId: 'dummy',
        accountLabel: connection.accountLabel,
        connectedAt: connection.connectedAt,
      }
    } finally {
      await profile.dispose()
    }
  }

  async function saveState(profileId: string, state: SimulatedSyncState): Promise<void> {
    if (state.providerId !== 'dummy' || !state.accountLabel.trim() || !state.connectedAt.trim()) {
      throw new Error('The sync setup state is invalid.')
    }

    const profile = await dependencies.openProfile(profileId)
    try {
      await profile.connectStorageProvider(state)
    } finally {
      await profile.dispose()
    }
  }

  async function removeState(profileId: string): Promise<void> {
    const profile = await dependencies.openProfile(profileId)
    try {
      await profile.disconnectStorageProvider('dummy')
    } finally {
      await profile.dispose()
    }
  }

  return { getState, saveState, removeState }
}

const simulatedSyncStateRepository = createSimulatedSyncStateRepository()

export const getSimulatedSyncState = (profileId: string) => simulatedSyncStateRepository.getState(profileId)
export const saveSimulatedSyncState = (profileId: string, state: SimulatedSyncState) =>
  simulatedSyncStateRepository.saveState(profileId, state)
export const removeSimulatedSyncState = (profileId: string) =>
  simulatedSyncStateRepository.removeState(profileId)
