import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getStorageLimitation, requestPersistence } from './environment'

beforeEach(() => {
  vi.stubGlobal('isSecureContext', true)
  vi.stubGlobal('crossOriginIsolated', true)
  vi.stubGlobal('Worker', vi.fn())
  vi.stubGlobal('navigator', {
    storage: {
      getDirectory: vi.fn(),
      persisted: vi.fn().mockResolvedValue(false),
      persist: vi.fn().mockResolvedValue(true),
    },
  })
})

describe('storage capabilities', () => {
  it.each([
    ['isSecureContext', false, /secure connection/],
    ['crossOriginIsolated', false, /COOP and COEP/],
    ['SharedArrayBuffer', undefined, /COOP and COEP/],
    ['Worker', undefined, /Web Workers/],
    ['WebAssembly', undefined, /WebAssembly/],
    ['navigator', { storage: {} }, /OPFS/],
  ])('blocks use when %s is unavailable', (name, value, message) => {
    vi.stubGlobal(name, value)
    expect(getStorageLimitation()).toMatch(message)
  })
})

describe('persistent storage permission', () => {
  it('requests permission when it is not already granted', async () => {
    expect(await requestPersistence()).toBe('granted')
    expect(navigator.storage.persist).toHaveBeenCalledOnce()
  })

  it('reuses an existing grant without requesting it again', async () => {
    vi.mocked(navigator.storage.persisted).mockResolvedValue(true)
    expect(await requestPersistence()).toBe('granted')
    expect(navigator.storage.persist).not.toHaveBeenCalled()
  })

  it('reports denial without blocking local storage', async () => {
    vi.mocked(navigator.storage.persist).mockResolvedValue(false)
    expect(await requestPersistence()).toBe('denied')
  })

  it('reports an unavailable permission API', async () => {
    vi.stubGlobal('navigator', { storage: { getDirectory: vi.fn() } })
    expect(await requestPersistence()).toBe('unavailable')
  })

  it('reports permission failures without claiming a grant', async () => {
    vi.mocked(navigator.storage.persist).mockRejectedValue(new Error('Permission failed'))
    expect(await requestPersistence()).toBe('error')
  })
})
