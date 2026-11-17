import {
  assertReady,
  StorageProviderError,
  throwIfAborted,
} from './storage-provider'
import type {
  StorageFileHandle,
  StorageFileMetadata,
  StorageProviderAdapter,
  StorageProviderConnectResult,
  StorageProviderState,
  StorageProviderWriteRequest,
} from './storage-provider'

export interface InMemoryStorageProviderHooks {
  connect?: (signal?: AbortSignal) => Promise<StorageProviderConnectResult | void>
  initialize?: (signal?: AbortSignal) => Promise<void>
  operation?: (operation: 'list' | 'read' | 'write' | 'delete', signal?: AbortSignal) => Promise<void>
}

interface StoredFile {
  metadata: StorageFileMetadata
  bytes: Uint8Array
}

function failure(error: unknown): StorageProviderError {
  if (error instanceof StorageProviderError) return error
  return new StorageProviderError('network', error instanceof Error ? error.message : 'The provider operation failed.', {
    cause: error,
    retryable: true,
  })
}

function makeStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  const copy = bytes.slice()
  return new ReadableStream({
    start(controller) {
      controller.enqueue(copy)
      controller.close()
    },
  })
}

async function consume(stream: ReadableStream<Uint8Array>, size: number, signal?: AbortSignal,
  onProgress?: StorageProviderWriteRequest['onProgress']): Promise<Uint8Array> {
  const reader = stream.getReader()
  const parts: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      throwIfAborted(signal)
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > size) throw new StorageProviderError('invalid-input', 'The upload exceeded its declared size.')
      parts.push(value)
      onProgress?.({ transferredBytes: total, totalBytes: size })
    }
  } catch (error) {
    await reader.cancel(error).catch(() => {})
    throw error
  } finally {
    reader.releaseLock()
  }
  if (total !== size) throw new StorageProviderError('invalid-input', 'The upload did not match its declared size.')
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.byteLength
  }
  return bytes
}

export function createInMemoryStorageProvider(options: {
  id?: string
  displayName?: string
  accountLabel?: string
  hooks?: InMemoryStorageProviderHooks
} = {}): StorageProviderAdapter {
  const id = options.id ?? 'memory-test'
  const displayName = options.displayName ?? 'In-memory test storage'
  const accountLabel = options.accountLabel ?? 'Test account'
  const locationId = 'memory-location'
  const files = new Map<string, StoredFile>()
  let state: StorageProviderState = { status: 'signed-out' }
  let nextFileId = 0

  function requireFile(handle: StorageFileHandle): StoredFile {
    assertReady(state)
    if (handle.providerId !== id || handle.locationId !== locationId) {
      throw new StorageProviderError('not-found', 'The file does not exist in this storage location.')
    }
    const file = files.get(handle.id)
    if (!file) throw new StorageProviderError('not-found', 'The file does not exist.')
    return file
  }

  async function run(operation: 'list' | 'read' | 'write' | 'delete', signal?: AbortSignal) {
    throwIfAborted(signal)
    try {
      await options.hooks?.operation?.(operation, signal)
      throwIfAborted(signal)
    } catch (error) {
      throw failure(error)
    }
  }

  return {
    id,
    displayName,
    simulated: false,
    capabilities: {
      sessionRestore: true,
      sessionRefresh: true,
      fileListing: true,
      fileReads: true,
      fileWrites: true,
      fileDeletes: true,
      conditionalWrites: true,
      resumableUploads: false,
      streamingReads: true,
      streamingWrites: true,
    },
    getState: () => state,
    async connect(signal) {
      throwIfAborted(signal)
      try {
        const result = await options.hooks?.connect?.(signal)
        throwIfAborted(signal)
        if (result?.status === 'cancelled') return result
      } catch (error) {
        state = { status: 'failed', error: failure(error) }
        throw state.error
      }
      state = { status: 'authenticated', accountLabel }
      return { status: 'connected', accountLabel }
    },
    async restoreSession(signal) {
      throwIfAborted(signal)
      if (state.status === 'signed-out') return state
      if (state.status === 'failed') return state
      return { status: 'authenticated', accountLabel: state.accountLabel }
    },
    async refreshSession(signal) {
      throwIfAborted(signal)
      if (state.status === 'signed-out') throw new StorageProviderError('authentication-required', 'Connect to the storage provider first.')
      const currentAccount = state.accountLabel
      if (!currentAccount) throw state.status === 'failed' ? state.error : new StorageProviderError('authentication-required', 'Connect to the storage provider first.')
      state = { status: 'authenticated', accountLabel: currentAccount }
      return state
    },
    async initialize(signal) {
      throwIfAborted(signal)
      if (state.status === 'signed-out') throw new StorageProviderError('authentication-required', 'Connect to the storage provider first.')
      const currentAccount = state.accountLabel
      if (!currentAccount) throw state.status === 'failed' ? state.error : new StorageProviderError('authentication-required', 'Connect to the storage provider first.')
      try {
        await options.hooks?.initialize?.(signal)
        throwIfAborted(signal)
      } catch (error) {
        state = { status: 'failed', error: failure(error), accountLabel: currentAccount }
        throw state.error
      }
      state = { status: 'ready', accountLabel: currentAccount, locationId }
      return { id: locationId, displayName: 'Test location' }
    },
    async disconnect(signal) {
      throwIfAborted(signal)
      state = { status: 'signed-out' }
    },
    async listFiles(input = {}) {
      assertReady(state)
      await run('list', input.signal)
      const pageSize = input.pageSize ?? 100
      if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
        throw new StorageProviderError('invalid-input', 'Page size must be from 1 through 1,000.')
      }
      const start = input.pageToken === undefined ? 0 : Number(input.pageToken)
      if (!Number.isInteger(start) || start < 0) throw new StorageProviderError('invalid-input', 'The file page token is invalid.')
      const all = [...files.values()].map(({ metadata }) => metadata).toSorted((a, b) => a.name.localeCompare(b.name) || a.handle.id.localeCompare(b.handle.id))
      const page = all.slice(start, start + pageSize)
      return { files: page, ...(start + page.length < all.length ? { nextPageToken: String(start + page.length) } : {}) }
    },
    async readFile(handle, signal) {
      assertReady(state)
      await run('read', signal)
      return makeStream(requireFile(handle).bytes)
    },
    async writeFile(request) {
      assertReady(state)
      await run('write', request.signal)
      if (request.resumeToken) throw new StorageProviderError('unsupported', 'This provider does not support resumable uploads.')
      if (!request.name.trim() || !Number.isSafeInteger(request.size) || request.size < 0) {
        throw new StorageProviderError('invalid-input', 'The file name and declared size are invalid.')
      }
      const current = [...files.values()].find((item) => item.metadata.name === request.name)
      if (request.mode === 'create' && current) throw new StorageProviderError('conflict', 'A file with this name already exists.')
      if (request.mode === 'replace' && !current) throw new StorageProviderError('not-found', 'The file to replace does not exist.')
      if (request.expectedRevision !== undefined && current?.metadata.revision !== request.expectedRevision) {
        throw new StorageProviderError('conflict', 'The file changed since it was read.')
      }
      const originalRevision = current?.metadata.revision
      let bytes: Uint8Array
      try {
        bytes = await consume(request.body, request.size, request.signal, request.onProgress)
      } catch (error) {
        throw error instanceof StorageProviderError ? error : failure(error)
      }
      throwIfAborted(request.signal)
      const latest = [...files.values()].find((item) => item.metadata.name === request.name)
      if (latest?.metadata.revision !== originalRevision) throw new StorageProviderError('conflict', 'The file changed during upload.')
      const fileId = current?.metadata.handle.id ?? `file-${++nextFileId}`
      const metadata: StorageFileMetadata = {
        handle: { providerId: id, locationId, id: fileId },
        name: request.name,
        contentType: request.contentType,
        size: bytes.byteLength,
        revision: `rev-${Number(originalRevision?.replace('rev-', '') ?? 0) + 1}`,
        modifiedAt: new Date().toISOString(),
      }
      files.set(fileId, { metadata, bytes })
      return { file: metadata }
    },
    async deleteFile(handle, deleteOptions) {
      assertReady(state)
      await run('delete', deleteOptions?.signal)
      const file = requireFile(handle)
      if (deleteOptions?.expectedRevision !== undefined && deleteOptions.expectedRevision !== file.metadata.revision) {
        throw new StorageProviderError('conflict', 'The file changed since it was read.')
      }
      files.delete(handle.id)
    },
  }
}
