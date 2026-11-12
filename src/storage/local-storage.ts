import type { BindingSpec } from '@sqlite.org/sqlite-wasm'
import { getStorageLimitation } from './environment'
import type { SqlRow, StorageCommand, StorageResponse } from './protocol'

export interface StorageSession {
  openDatabase: (filename: string, options?: { create?: boolean }) => Promise<void>
  execute: (sql: string, bind?: BindingSpec) => Promise<SqlRow[]>
  exportProfile: (profileId: string) => Promise<Uint8Array<ArrayBuffer>>
  importProfile: (bytes: Uint8Array<ArrayBuffer>) => Promise<SqlRow>
  closeDatabase: () => Promise<void>
  dispose: () => Promise<void>
}

export async function initializeStorage(signal?: AbortSignal): Promise<StorageSession> {
  signal?.throwIfAborted()
  const limitation = getStorageLimitation()
  if (limitation) throw new Error(limitation)

  const worker = new Worker(new URL('./sqlite.worker.ts', import.meta.url), { type: 'module' })
  const pending = new Map<number, {
    resolve: (response: Extract<StorageResponse, { rows: SqlRow[] }>) => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  }>()
  let nextId = 0
  let stopped = false
  let disposing: Promise<void> | undefined

  function stop(error: Error) {
    if (stopped) return
    stopped = true
    signal?.removeEventListener('abort', abort)
    worker.terminate()
    for (const entry of pending.values()) {
      clearTimeout(entry.timer)
      entry.reject(error)
    }
    pending.clear()
  }

  function abort() {
    stop(new DOMException('The local storage operation was cancelled.', 'AbortError'))
  }
  signal?.addEventListener('abort', abort, { once: true })

  worker.addEventListener('message', ({ data }: MessageEvent<StorageResponse>) => {
    const entry = pending.get(data.id)
    if (!entry) return
    pending.delete(data.id)
    clearTimeout(entry.timer)
    if ('error' in data) entry.reject(new Error(data.error))
    else entry.resolve(data)
  })
  worker.addEventListener('error', (event) => {
    event.preventDefault()
    stop(new Error('The local storage worker failed. Check the connection and host configuration, then retry.'))
  })
  worker.addEventListener('messageerror', () => {
    stop(new Error('The local storage worker returned an unreadable response. Retry storage setup.'))
  })

  function request(command: StorageCommand): Promise<Extract<StorageResponse, { rows: SqlRow[] }>> {
    if (stopped) return Promise.reject(new Error('The local storage session is closed.'))
    const id = ++nextId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        stop(new Error('Local storage timed out. Close other JST tabs and retry.'))
      }, command.type === 'export-profile' || command.type === 'import-profile' ? 120_000 : 30_000)
      pending.set(id, { resolve, reject, timer })
      try {
        worker.postMessage({ ...command, id }, command.type === 'import-profile' ? [command.bytes.buffer] : [])
      } catch {
        stop(new Error('Could not send a request to the local storage worker. Retry storage setup.'))
      }
    })
  }

  function send(command: StorageCommand) {
    if (disposing) return Promise.reject(new Error('The local storage session is closing.'))
    return request(command)
  }

  try {
    await request({ type: 'initialize' })
    return {
      async openDatabase(filename, options) {
        await send({ type: 'open', filename, create: options?.create ?? false })
      },
      execute: async (sql, bind) => (await send({ type: 'execute', sql, bind })).rows,
      async exportProfile(profileId) {
        const { bytes } = await send({ type: 'export-profile', profileId })
        if (!bytes?.length) throw new Error('The profile export returned an empty database.')
        return bytes
      },
      async importProfile(bytes) {
        const { rows } = await send({ type: 'import-profile', bytes })
        if (!rows[0]) throw new Error('The profile restore returned no metadata.')
        return rows[0]
      },
      async closeDatabase() {
        await send({ type: 'close' })
      },
      dispose() {
        if (stopped) return Promise.resolve()
        disposing ??= request({ type: 'close' }).then(() => {}).finally(() => {
          stop(new Error('The local storage session is closed.'))
        })
        return disposing
      },
    }
  } catch (error) {
    stop(error instanceof Error ? error : new Error('Local storage initialization failed.'))
    throw error
  }
}
