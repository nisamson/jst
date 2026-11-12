import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { initializeStorage } from './local-storage'
import type { StorageRequest, StorageResponse } from './protocol'

class TestWorker extends EventTarget {
  static instances: TestWorker[] = []
  replyError: string | undefined
  silent = false
  terminate = vi.fn()
  postMessage = vi.fn((request: StorageRequest) => {
    if (this.silent) return
    const response: StorageResponse = this.replyError
      ? { id: request.id, error: this.replyError }
      : { id: request.id, rows: request.type === 'import-profile' ? [{ label: 'Restored', real_name: null }] : [],
        ...(request.type === 'export-profile' ? { bytes: new Uint8Array([1, 2, 3]) } : {}) }
    queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: response })))
  })

  constructor() {
    super()
    TestWorker.instances.push(this)
  }
}

beforeEach(() => {
  TestWorker.instances = []
  vi.stubGlobal('isSecureContext', true)
  vi.stubGlobal('crossOriginIsolated', true)
  vi.stubGlobal('Worker', TestWorker)
  vi.stubGlobal('navigator', {
    storage: {
      getDirectory: vi.fn(),
      persisted: vi.fn().mockResolvedValue(false),
      persist: vi.fn().mockResolvedValue(false),
    },
  })
})

afterEach(() => {
  vi.useRealTimers()
})

it('blocks unsupported storage before starting a worker or requesting persistence', async () => {
  vi.stubGlobal('crossOriginIsolated', false)
  await expect(initializeStorage()).rejects.toThrow(/COOP and COEP/)
  expect(TestWorker.instances).toHaveLength(0)
  expect(navigator.storage.persist).not.toHaveBeenCalled()
})

it('uses explicit create options and gracefully closes before terminating', async () => {
  const session = await initializeStorage()
  const worker = TestWorker.instances[0]
  expect(navigator.storage.persist).not.toHaveBeenCalled()
  await session.openDatabase('/existing.sqlite3')
  await session.openDatabase('/new.sqlite3', { create: true })
  expect(worker.postMessage.mock.calls.map(([request]) => request)).toEqual([
    { id: 1, type: 'initialize' },
    { id: 2, type: 'open', filename: '/existing.sqlite3', create: false },
    { id: 3, type: 'open', filename: '/new.sqlite3', create: true },
  ])
  await session.dispose()
  expect(worker.postMessage).toHaveBeenLastCalledWith({ id: 4, type: 'close' }, [])
  expect(worker.terminate).toHaveBeenCalledOnce()
  await expect(session.execute('SELECT 1')).rejects.toThrow(/closing/)
  await session.dispose()
  expect(worker.terminate).toHaveBeenCalledOnce()
})

it('propagates SQL errors without terminating a usable session', async () => {
  const session = await initializeStorage()
  const worker = TestWorker.instances[0]
  worker.replyError = 'disk is full'
  await expect(session.execute('INSERT INTO records VALUES (?)', ['example'])).rejects.toThrow('disk is full')
  expect(worker.terminate).not.toHaveBeenCalled()
  worker.replyError = undefined
  await session.dispose()
})

it('returns exported bytes and cancels an in-flight export by terminating its worker', async () => {
  const controller = new AbortController()
  const session = await initializeStorage(controller.signal)
  const worker = TestWorker.instances[0]
  expect(await session.exportProfile('profile-id')).toEqual(new Uint8Array([1, 2, 3]))
  worker.silent = true
  const exported = session.exportProfile('profile-id')
  const rejection = expect(exported).rejects.toMatchObject({ name: 'AbortError' })
  controller.abort()
  await rejection
  expect(worker.terminate).toHaveBeenCalledOnce()
  await session.dispose()
})

it('transfers imported bytes to the worker and returns restored metadata', async () => {
  const session = await initializeStorage()
  const bytes = new Uint8Array([1, 2, 3])
  expect(await session.importProfile(bytes)).toEqual({ label: 'Restored', real_name: null })
  expect(TestWorker.instances[0].postMessage).toHaveBeenLastCalledWith(
    { id: 2, type: 'import-profile', bytes }, [bytes.buffer],
  )
  await session.dispose()
})

it('rejects pending work when the worker fails', async () => {
  const session = await initializeStorage()
  const worker = TestWorker.instances[0]
  worker.silent = true
  const query = session.execute('SELECT 1')
  const failure = expect(query).rejects.toThrow(/worker failed/)
  worker.dispatchEvent(new Event('error'))
  await failure
  expect(worker.terminate).toHaveBeenCalledOnce()
  await expect(session.execute('SELECT 2')).rejects.toThrow(/closed/)
  await session.dispose()
  expect(worker.terminate).toHaveBeenCalledOnce()
})

it('times out and terminates an unresponsive worker instead of hanging', async () => {
  const session = await initializeStorage()
  const worker = TestWorker.instances[0]
  worker.silent = true
  vi.useFakeTimers()
  const query = session.execute('SELECT 1')
  const failure = expect(query).rejects.toThrow(/timed out/)
  await vi.advanceTimersByTimeAsync(30_000)
  await failure
  expect(worker.terminate).toHaveBeenCalledOnce()
})
