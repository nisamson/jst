import { expect, it, vi } from 'vitest'
import { createInMemoryStorageProvider } from './in-memory-storage-provider'
import type { InMemoryStorageProviderHooks } from './in-memory-storage-provider'
import { StorageProviderError } from './storage-provider'
import type { StorageProviderAdapter } from './storage-provider'

async function collect(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

function makeUploadStream(...parts: number[][]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(new Uint8Array(part))
      controller.close()
    },
  })
}

async function ready(provider: StorageProviderAdapter) {
  expect(provider.getState().status).toBe('signed-out')
  await expect(provider.initialize()).rejects.toMatchObject({ code: 'authentication-required' })
  expect(await provider.connect()).toMatchObject({ status: 'connected' })
  expect(provider.getState().status).toBe('authenticated')
  expect((await provider.restoreSession()).status).toBe('authenticated')
  const location = await provider.initialize()
  expect(provider.getState()).toMatchObject({ status: 'ready', locationId: location.id })
  expect(await provider.initialize()).toEqual(location)
  return location
}

it('implements lifecycle states, idempotent initialization, and recoverable initialization failures', async () => {
  const initialize = vi.fn<NonNullable<InMemoryStorageProviderHooks['initialize']>>()
    .mockRejectedValueOnce(new StorageProviderError('offline', 'Temporarily offline'))
    .mockResolvedValue(undefined)
  const provider = createInMemoryStorageProvider({ hooks: { initialize } })
  await provider.connect()
  await expect(provider.initialize()).rejects.toMatchObject({ code: 'offline' })
  expect(provider.getState()).toMatchObject({ status: 'failed', accountLabel: 'Test account' })
  await provider.initialize()
  expect(provider.getState().status).toBe('ready')
  expect(initialize).toHaveBeenCalledTimes(2)
  await provider.disconnect()
  expect(provider.getState()).toEqual({ status: 'signed-out' })
  await expect(provider.refreshSession()).rejects.toMatchObject({ code: 'authentication-required' })
})

it('supports paginated binary round trips and explicit create/replace semantics', async () => {
  const provider = createInMemoryStorageProvider()
  const location = await ready(provider)
  const progress = vi.fn()
  const created = await provider.writeFile({
    name: 'first.bin', contentType: 'application/octet-stream', size: 3, body: makeUploadStream([0, 1], [128]),
    mode: 'create', onProgress: progress,
  })
  expect(created.file).toMatchObject({
    name: 'first.bin', size: 3, handle: { providerId: provider.id, locationId: location.id },
  })
  expect(progress).toHaveBeenLastCalledWith({ transferredBytes: 3, totalBytes: 3 })
  const second = await provider.writeFile({
    name: 'second.bin', contentType: 'application/octet-stream', size: 1, body: makeUploadStream([255]), mode: 'create',
  })
  const firstPage = await provider.listFiles({ pageSize: 1 })
  expect(firstPage.files.map((file) => file.name)).toEqual(['first.bin'])
  expect(firstPage.nextPageToken).toBe('1')
  expect((await provider.listFiles({ pageSize: 1, pageToken: firstPage.nextPageToken })).files[0].handle).toEqual(second.file.handle)
  expect(Array.from(await collect(await provider.readFile(created.file.handle)))).toEqual([0, 1, 128])

  await expect(provider.writeFile({
    name: 'first.bin', contentType: 'application/octet-stream', size: 0, body: makeUploadStream(), mode: 'create',
  })).rejects.toMatchObject({ code: 'conflict' })
  await expect(provider.writeFile({
    name: 'first.bin', contentType: 'application/octet-stream', size: 1, body: makeUploadStream([2]), mode: 'replace',
    expectedRevision: 'stale',
  })).rejects.toMatchObject({ code: 'conflict' })
  const replaced = await provider.writeFile({
    name: 'first.bin', contentType: 'application/octet-stream', size: 1, body: makeUploadStream([2]), mode: 'replace',
    expectedRevision: created.file.revision,
  })
  expect(replaced.file.revision).not.toBe(created.file.revision)
  expect(Array.from(await collect(await provider.readFile(replaced.file.handle)))).toEqual([2])
})

it('detects conditional-write races, preserves prior data on interrupted uploads, and deletes conditionally', async () => {
  const provider = createInMemoryStorageProvider()
  await ready(provider)
  const existing = await provider.writeFile({
    name: 'record.bin', contentType: 'application/octet-stream', size: 2, body: makeUploadStream([1, 2]), mode: 'create',
  })
  let release: (() => void) | undefined
  let changed: (() => void) | undefined
  const started = new Promise<void>((resolve) => { changed = resolve })
  const gate = new Promise<void>((resolve) => { release = resolve })
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(new Uint8Array([9]))
      changed?.()
      await gate
      controller.enqueue(new Uint8Array([9]))
      controller.close()
    },
  })
  const pendingWrite = provider.writeFile({
    name: 'record.bin', contentType: 'application/octet-stream', size: 2, body, mode: 'replace',
    expectedRevision: existing.file.revision,
  })
  await started
  const updated = await provider.writeFile({
    name: 'record.bin', contentType: 'application/octet-stream', size: 2, body: makeUploadStream([3, 4]), mode: 'replace',
    expectedRevision: existing.file.revision,
  })
  release?.()
  await expect(pendingWrite).rejects.toMatchObject({ code: 'conflict' })
  expect(Array.from(await collect(await provider.readFile(updated.file.handle)))).toEqual([3, 4])
  await expect(provider.deleteFile(updated.file.handle, { expectedRevision: existing.file.revision }))
    .rejects.toMatchObject({ code: 'conflict' })
  await provider.deleteFile(updated.file.handle, { expectedRevision: updated.file.revision })
  await expect(provider.readFile(updated.file.handle)).rejects.toMatchObject({ code: 'not-found' })
  await expect(provider.deleteFile(updated.file.handle)).rejects.toMatchObject({ code: 'not-found' })
})

it('normalizes cancellation, missing files, operation failures, and provider-scoped handles', async () => {
  const controller = new AbortController()
  let failList = true
  const provider = createInMemoryStorageProvider({
    hooks: { operation: async (operation) => {
      if (operation === 'list' && failList) {
        failList = false
        throw new Error('offline')
      }
    } },
  })
  await ready(provider)
  controller.abort()
  await expect(provider.listFiles({ signal: controller.signal })).rejects.toMatchObject({ code: 'cancelled' })
  await expect(provider.listFiles()).rejects.toMatchObject({ code: 'network', retryable: true })
  const file = await provider.writeFile({
    name: 'exists', contentType: 'application/octet-stream', size: 0, body: makeUploadStream(), mode: 'create',
  })
  const otherProvider = createInMemoryStorageProvider({ id: 'other-test' })
  await ready(otherProvider)
  await expect(otherProvider.readFile(file.file.handle)).rejects.toMatchObject({ code: 'not-found' })
})

it('keeps test-provider accounts and file namespaces isolated', async () => {
  const first = createInMemoryStorageProvider({ id: 'first-test', accountLabel: 'First account' })
  const second = createInMemoryStorageProvider({ id: 'second-test', accountLabel: 'Second account' })
  await ready(first)
  await ready(second)
  const file = await first.writeFile({
    name: 'private.bin', contentType: 'application/octet-stream', size: 1, body: makeUploadStream([1]), mode: 'create',
  })
  await expect(second.readFile(file.file.handle)).rejects.toMatchObject({ code: 'not-found' })
  expect(second.getState()).toMatchObject({ status: 'ready', accountLabel: 'Second account' })
})
