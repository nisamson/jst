import { beforeEach, expect, it, vi } from 'vitest'
import type { SqlRow } from './protocol'
import { createSimulatedSyncStateRepository } from './simulated-sync-state'
import type { SimulatedSyncState } from './simulated-sync-state'

const firstProfile = '11111111-1111-4111-8111-111111111111'
const secondProfile = '22222222-2222-4222-8222-222222222222'
let states: Map<string, SimulatedSyncState>
let failInsert: boolean
let failRemove: boolean

function createHarness() {
  const dispose = vi.fn(async () => {})
  const execute = vi.fn(async (sql: string): Promise<SqlRow[]> => {
    if (sql.startsWith('SELECT provider_id')) {
      const state = states.get(activeProfile)
      return state
        ? [{ provider_id: state.providerId, account_label: state.accountLabel, connected_at: state.connectedAt }]
        : []
    }
    if (sql.startsWith('DELETE FROM simulated_sync_setup')) {
      if (failRemove) throw new Error('removal failed')
      states.delete(activeProfile)
      return []
    }
    throw new Error(`Unexpected SQL in test: ${sql}`)
  })
  let activeProfile = ''
  const saveSimulatedSyncState = vi.fn(async (accountLabel: string, connectedAt: string) => {
    if (failInsert) throw new Error('disk is full')
    states.set(activeProfile, { providerId: 'dummy', accountLabel, connectedAt })
  })
  const openProfile = vi.fn(async (profileId: string) => {
    activeProfile = profileId
    return {
      profile: { id: profileId, label: profileId, createdAt: '2026-01-01T00:00:00.000Z' },
      access: { mode: 'read-only' as const, persistence: 'denied' as const, syncConnected: states.has(profileId) },
      execute,
      saveSimulatedSyncState,
      dispose,
    }
  })
  return {
    repository: createSimulatedSyncStateRepository({ openProfile }),
    execute,
    saveSimulatedSyncState,
    dispose,
    openProfile,
  }
}

beforeEach(() => {
  states = new Map()
  failInsert = false
  failRemove = false
})

it('removes only the selected setup and preserves it when removal fails', async () => {
  const { repository, dispose } = createHarness()
  const state = { providerId: 'dummy' as const, accountLabel: 'Account', connectedAt: '2026-01-01' }
  await repository.saveState(firstProfile, state)
  await repository.saveState(secondProfile, state)
  failRemove = true
  await expect(repository.removeState(firstProfile)).rejects.toThrow('removal failed')
  expect(await repository.getState(firstProfile)).toEqual(state)
  failRemove = false
  await repository.removeState(firstProfile)
  expect(await repository.getState(firstProfile)).toBeUndefined()
  expect(await repository.getState(secondProfile)).toEqual(state)
  await repository.removeState(firstProfile)
  expect(dispose).toHaveBeenCalledTimes(8)
})

it('saves and reads setup state independently for each profile', async () => {
  const { repository } = createHarness()
  const firstState = {
    providerId: 'dummy' as const,
    accountLabel: 'Simulated account one',
    connectedAt: '2026-01-01T00:00:00.000Z',
  }
  expect(await repository.getState(firstProfile)).toBeUndefined()
  await repository.saveState(firstProfile, firstState)
  expect(await repository.getState(firstProfile)).toEqual(firstState)
  expect(await repository.getState(secondProfile)).toBeUndefined()

  const secondState = {
    providerId: 'dummy' as const,
    accountLabel: 'Simulated account two',
    connectedAt: '2026-02-01T00:00:00.000Z',
  }
  await repository.saveState(secondProfile, secondState)
  expect(await repository.getState(firstProfile)).toEqual(firstState)
  expect(await repository.getState(secondProfile)).toEqual(secondState)
})

it('reports failed writes and disposes the profile session', async () => {
  const { repository, saveSimulatedSyncState, dispose } = createHarness()
  failInsert = true

  await expect(repository.saveState(firstProfile, {
    providerId: 'dummy',
    accountLabel: 'Simulated account',
    connectedAt: '2026-01-01T00:00:00.000Z',
  })).rejects.toThrow('disk is full')
  expect(saveSimulatedSyncState).toHaveBeenCalledOnce()
  expect(dispose).toHaveBeenCalledOnce()
})

it('rejects invalid saved state', async () => {
  const { repository } = createHarness()
  await expect(repository.saveState(firstProfile, {
    providerId: 'dummy',
    accountLabel: ' ',
    connectedAt: '2026-01-01T00:00:00.000Z',
  })).rejects.toThrow('sync setup state is invalid')
})
