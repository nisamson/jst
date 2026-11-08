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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown storage error.'
}

export function createSimulatedSyncStateRepository(
  dependencies: SimulatedSyncStateDependencies = defaultDependencies,
) {
  async function getState(profileId: string): Promise<SimulatedSyncState | undefined> {
    const profile = await dependencies.openProfile(profileId)
    try {
      const [row] = await profile.execute(
        'SELECT provider_id, account_label, connected_at FROM simulated_sync_setup WHERE id = 1',
      )
      if (!row) return undefined
      if (
        row.provider_id !== 'dummy'
        || typeof row.account_label !== 'string'
        || typeof row.connected_at !== 'string'
      ) {
        throw new Error('The saved simulated setup state is invalid.')
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
      throw new Error('The simulated setup state is invalid.')
    }

    const profile = await dependencies.openProfile(profileId)
    let transactionOpen = false
    try {
      await profile.execute('BEGIN IMMEDIATE')
      transactionOpen = true
      await profile.execute(
        `INSERT INTO simulated_sync_setup (id, provider_id, account_label, connected_at)
         VALUES (1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           provider_id = excluded.provider_id,
           account_label = excluded.account_label,
           connected_at = excluded.connected_at`,
        [state.providerId, state.accountLabel, state.connectedAt],
      )
      await profile.execute('COMMIT')
      transactionOpen = false
    } catch (error) {
      if (transactionOpen) {
        try {
          await profile.execute('ROLLBACK')
        } catch (rollbackError) {
          throw new Error(
            `Saving simulated setup failed: ${getErrorMessage(error)} Rollback also failed: ${getErrorMessage(rollbackError)}`,
            { cause: rollbackError },
          )
        }
      }
      throw error
    } finally {
      await profile.dispose()
    }
  }

  return { getState, saveState }
}

const simulatedSyncStateRepository = createSimulatedSyncStateRepository()

export const getSimulatedSyncState = (profileId: string) => simulatedSyncStateRepository.getState(profileId)
export const saveSimulatedSyncState = (profileId: string, state: SimulatedSyncState) =>
  simulatedSyncStateRepository.saveState(profileId, state)
