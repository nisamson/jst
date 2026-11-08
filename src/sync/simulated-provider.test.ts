import { expect, it, vi } from 'vitest'
import { createSimulatedProvider } from './simulated-provider'

it('returns simulated cloud profiles without modifying local data', async () => {
  const profiles = [{ id: 'cloud-1', label: 'Simulated cloud profile 1' }]
  const listCloudProfiles = vi.fn(async () => profiles)
  const connect = vi.fn(async () => ({ status: 'connected' as const, accountLabel: 'Simulated account' }))
  const provider = createSimulatedProvider({ listCloudProfiles, connect })

  await expect(provider.listCloudProfiles()).resolves.toEqual(profiles)
  expect(listCloudProfiles).toHaveBeenCalledOnce()
  expect(connect).not.toHaveBeenCalled()
})

it('supports an empty simulated cloud listing', async () => {
  const provider = createSimulatedProvider({
    listCloudProfiles: async () => [],
    connect: async () => ({ status: 'cancelled' }),
  })

  await expect(provider.listCloudProfiles()).resolves.toEqual([])
})

it('preserves cancelled setup results and provider failures', async () => {
  const cancelledProvider = createSimulatedProvider({
    listCloudProfiles: async () => [],
    connect: async () => ({ status: 'cancelled' }),
  })
  await expect(cancelledProvider.connect()).resolves.toEqual({ status: 'cancelled' })

  const failedProvider = createSimulatedProvider({
    listCloudProfiles: async () => [],
    connect: async () => { throw new Error('Simulated setup failed.') },
  })
  await expect(failedProvider.connect()).rejects.toThrow('Simulated setup failed.')
})
