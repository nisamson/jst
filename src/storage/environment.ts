export type Persistence = 'granted' | 'denied' | 'unavailable' | 'error'

export function getStorageLimitation(): string | undefined {
  if (!globalThis.isSecureContext) {
    return 'Local storage requires a secure connection (HTTPS or localhost).'
  }
  if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') {
    return 'This browser needs Web Workers and WebAssembly for local SQLite storage.'
  }
  if (!globalThis.crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') {
    return 'Local storage requires cross-origin isolation. The host must send the COOP and COEP headers.'
  }
  if (typeof navigator.storage?.getDirectory !== 'function') {
    return 'This browser does not support the required origin-private file system (OPFS).'
  }
}

export async function requestPersistence(): Promise<Persistence> {
  const storage = navigator.storage
  try {
    if (await storage?.persisted?.()) return 'granted'
    if (typeof storage?.persist !== 'function') return 'unavailable'
    return await storage.persist() ? 'granted' : 'denied'
  } catch {
    return 'error'
  }
}
