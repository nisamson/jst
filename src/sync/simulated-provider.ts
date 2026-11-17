import { assertReady, StorageProviderError, throwIfAborted } from './storage-provider'
import type { StorageProviderAdapter, StorageProviderState } from './storage-provider'

export interface SimulatedCloudProfile {
  id: string
  label: string
}

export type SimulatedProviderResult =
  | { status: 'connected'; accountLabel: string }
  | { status: 'cancelled' }

interface SimulatedProviderDependencies {
  listCloudProfiles: () => Promise<SimulatedCloudProfile[]>
  connect: (signal?: AbortSignal) => Promise<SimulatedProviderResult>
}

const defaultDependencies: SimulatedProviderDependencies = {
  async listCloudProfiles() {
    return [
      { id: 'simulated-cloud-profile-1', label: 'Example profile 1' },
      { id: 'simulated-cloud-profile-2', label: 'Example profile 2' },
    ]
  },
  async connect() {
    return { status: 'connected', accountLabel: 'Simulated account' }
  },
}

export function createSimulatedProvider(
  dependencies: SimulatedProviderDependencies = defaultDependencies,
) : StorageProviderAdapter & { listCloudProfiles: () => Promise<SimulatedCloudProfile[]> } {
  let state: StorageProviderState = { status: 'signed-out' }
  const unsupported = () => {
    assertReady(state)
    throw new StorageProviderError('unsupported', 'Simulated storage does not transfer profile data.')
  }
  return {
    id: 'dummy',
    displayName: 'Simulated storage',
    simulated: true,
    capabilities: {
      sessionRestore: false,
      sessionRefresh: false,
      fileListing: false,
      fileReads: false,
      fileWrites: false,
      fileDeletes: false,
      conditionalWrites: false,
      resumableUploads: false,
      streamingReads: false,
      streamingWrites: false,
    },
    getState: () => state,
    listCloudProfiles: () => dependencies.listCloudProfiles(),
    async connect(signal) {
      throwIfAborted(signal)
      try {
        const result = await dependencies.connect(signal)
        throwIfAborted(signal)
        if (result.status === 'connected') state = { status: 'authenticated', accountLabel: result.accountLabel }
        return result
      } catch (error) {
        if (signal?.aborted) throw new StorageProviderError('cancelled', 'The simulated setup was cancelled.', { cause: error })
        const normalized = error instanceof StorageProviderError
          ? error
          : new StorageProviderError('network', error instanceof Error ? error.message : 'Simulated setup failed.', {
            cause: error,
            retryable: true,
          })
        state = { status: 'failed', error: normalized }
        throw normalized
      }
    },
    async restoreSession(signal) {
      throwIfAborted(signal)
      return state.status === 'ready'
        ? { status: 'authenticated', accountLabel: state.accountLabel }
        : state.status === 'authenticated' || state.status === 'failed' ? state : { status: 'signed-out' }
    },
    async refreshSession(signal) {
      throwIfAborted(signal)
      throw new StorageProviderError('unsupported', 'Simulated storage does not refresh authentication sessions.')
    },
    async initialize(signal) {
      throwIfAborted(signal)
      if (state.status === 'signed-out') throw new StorageProviderError('authentication-required', 'Connect to simulated storage first.')
      if (state.status === 'failed') throw state.error
      const location = { id: 'simulated-cloud-profile-1', displayName: 'Simulated profile' }
      state = { status: 'ready', accountLabel: state.accountLabel, locationId: location.id }
      return location
    },
    async disconnect(signal) {
      throwIfAborted(signal)
      state = { status: 'signed-out' }
    },
    async listFiles() { return unsupported() },
    async readFile() { return unsupported() },
    async writeFile() { return unsupported() },
    async deleteFile() { return unsupported() },
  }
}

export const simulatedProvider = createSimulatedProvider()
