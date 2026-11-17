import { openProfile } from './profiles'
import type { StorageProviderConnection } from '../sync/storage-provider'

export async function getProfileStorageProviderConnection(profileId: string): Promise<StorageProviderConnection | undefined> {
  const profile = await openProfile(profileId)
  try {
    return await profile.getStorageProviderConnection()
  } finally {
    await profile.dispose()
  }
}

export async function connectProfileStorageProvider(
  profileId: string,
  connection: StorageProviderConnection,
): Promise<StorageProviderConnection> {
  const profile = await openProfile(profileId)
  try {
    return await profile.connectStorageProvider(connection)
  } finally {
    await profile.dispose()
  }
}

export async function disconnectProfileStorageProvider(profileId: string, providerId?: string): Promise<void> {
  const profile = await openProfile(profileId)
  try {
    await profile.disconnectStorageProvider(providerId)
  } finally {
    await profile.dispose()
  }
}
