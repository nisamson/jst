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
      const [row] = await profile.execute(
        'SELECT provider_id, account_label, connected_at FROM simulated_sync_setup WHERE id = 1',
      )
      if (!row) return undefined
      if (
        row.provider_id !== 'dummy'
        || typeof row.account_label !== 'string'
        || typeof row.connected_at !== 'string'
      ) {
        throw new Error('The saved sync setup state is invalid.')
      }
      return {
        providerId: 'dummy',
        accountLabel: row.account_label,
        connectedAt: row.connected_at,
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
      await profile.saveSimulatedSyncState(state.accountLabel, state.connectedAt)
    } finally {
      await profile.dispose()
    }
  }

  async function removeState(profileId: string): Promise<void> {
    const profile = await dependencies.openProfile(profileId)
    try {
      if (profile.access.syncConnected) {
        await profile.execute('DELETE FROM simulated_sync_setup WHERE id = 1')
      }
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
