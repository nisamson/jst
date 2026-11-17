import { expect, it, vi } from 'vitest'
import { createSimulatedProvider } from './simulated-provider'
import { StorageProviderError } from './storage-provider'
import type { StorageProviderAdapter } from './storage-provider'

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
  await expect(failedProvider.connect()).rejects.toMatchObject({ name: 'StorageProviderError', code: 'network' })
  expect(failedProvider.getState()).toMatchObject({ status: 'failed' })
})

it('implements the provider lifecycle while explicitly refusing file transfer', async () => {
  const provider: StorageProviderAdapter & { listCloudProfiles: () => Promise<{ id: string; label: string }[]> } =
    createSimulatedProvider()
  expect(provider.simulated).toBe(true)
  expect(provider.capabilities).toMatchObject({
    fileListing: false, fileReads: false, fileWrites: false, fileDeletes: false,
    conditionalWrites: false, resumableUploads: false,
  })
  await expect(provider.initialize()).rejects.toMatchObject({ code: 'authentication-required' })
  expect(await provider.connect()).toEqual({ status: 'connected', accountLabel: 'Simulated account' })
  const location = await provider.initialize()
  expect(provider.getState()).toMatchObject({ status: 'ready', locationId: location.id })
  await expect(provider.listFiles()).rejects.toBeInstanceOf(StorageProviderError)
  await expect(provider.listFiles()).rejects.toMatchObject({ code: 'unsupported' })
  await provider.disconnect()
  expect(provider.getState()).toEqual({ status: 'signed-out' })
  expect(await provider.listCloudProfiles()).toHaveLength(2)
})
