export interface SimulatedCloudProfile {
  id: string
  label: string
}

export type SimulatedProviderResult =
  | { status: 'connected'; accountLabel: string }
  | { status: 'cancelled' }

interface SimulatedProviderDependencies {
  listCloudProfiles: () => Promise<SimulatedCloudProfile[]>
  connect: () => Promise<SimulatedProviderResult>
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
) {
  return {
    listCloudProfiles: () => dependencies.listCloudProfiles(),
    connect: () => dependencies.connect(),
  }
}

export const simulatedProvider = createSimulatedProvider()
