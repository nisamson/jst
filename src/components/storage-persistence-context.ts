import { createContext, useContext } from 'react'
import type { Persistence } from '../storage/environment'

export type RequestStoragePersistence = () => Promise<Persistence>

export const StoragePersistenceContext = createContext<RequestStoragePersistence | undefined>(undefined)

export function useRequestStoragePersistence(): RequestStoragePersistence {
  const request = useContext(StoragePersistenceContext)
  if (!request) throw new Error('Persistent storage can only be requested inside the storage status boundary.')
  return request
}
