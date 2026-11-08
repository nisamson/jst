import { beforeEach, expect, it, vi } from 'vitest'
import type { SqlRow } from './protocol'
import { createSimulatedSyncStateRepository } from './simulated-sync-state'
import type { SimulatedSyncState } from './simulated-sync-state'

const firstProfile = '11111111-1111-4111-8111-111111111111'
const secondProfile = '22222222-2222-4222-8222-222222222222'
let states: Map<string, SimulatedSyncState>
let nextState: SimulatedSyncState
let failInsert: boolean

function createHarness() {
  const dispose = vi.fn(async () => {})
  const execute = vi.fn(async (sql: string): Promise<SqlRow[]> => {
    if (sql === 'BEGIN IMMEDIATE' || sql === 'COMMIT' || sql === 'ROLLBACK') return []
    if (sql.startsWith('SELECT provider_id')) {
      const state = states.get(activeProfile)
      return state
        ? [{ provider_id: state.providerId, account_label: state.accountLabel, connected_at: state.connectedAt }]
        : []
    }
    if (sql.startsWith('INSERT INTO simulated_sync_setup')) {
      if (failInsert) throw new Error('disk is full')
      states.set(activeProfile, nextState)
      return []
    }
    throw new Error(`Unexpected SQL in test: ${sql}`)
  })
  let activeProfile = ''
  const openProfile = vi.fn(async (profileId: string) => {
    activeProfile = profileId
    return {
      profile: { id: profileId, label: profileId, createdAt: '2026-01-01T00:00:00.000Z' },
      execute,
      dispose,
    }
  })
  return { repository: createSimulatedSyncStateRepository({ openProfile }), execute, dispose, openProfile }
}

beforeEach(() => {
  states = new Map()
  nextState = {
    providerId: 'dummy',
    accountLabel: 'Simulated account one',
    connectedAt: '2026-01-01T00:00:00.000Z',
  }
  failInsert = false
})

it('saves and reads setup state independently for each profile', async () => {
  const { repository } = createHarness()
  const firstState = nextState
  expect(await repository.getState(firstProfile)).toBeUndefined()
  await repository.saveState(firstProfile, firstState)
  expect(await repository.getState(firstProfile)).toEqual(firstState)
  expect(await repository.getState(secondProfile)).toBeUndefined()

  const secondState = {
    providerId: 'dummy' as const,
    accountLabel: 'Simulated account two',
    connectedAt: '2026-02-01T00:00:00.000Z',
  }
  nextState = secondState
  await repository.saveState(secondProfile, secondState)
  expect(await repository.getState(firstProfile)).toEqual(firstState)
  expect(await repository.getState(secondProfile)).toEqual(secondState)
})

it('rolls back failed writes and disposes the profile session', async () => {
  const { repository, execute, dispose } = createHarness()
  failInsert = true

  await expect(repository.saveState(firstProfile, nextState)).rejects.toThrow('disk is full')
  expect(execute).toHaveBeenCalledWith('ROLLBACK')
  expect(dispose).toHaveBeenCalledOnce()
})

it('rejects invalid saved state', async () => {
  const { repository } = createHarness()
  await expect(repository.saveState(firstProfile, {
    providerId: 'dummy',
    accountLabel: ' ',
    connectedAt: '2026-01-01T00:00:00.000Z',
  })).rejects.toThrow('simulated setup state is invalid')
})
