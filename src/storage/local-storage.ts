import type { BindingSpec } from '@sqlite.org/sqlite-wasm'
import { getStorageLimitation } from './environment'
import type { SqlRow, StorageCommand, StorageResponse } from './protocol'

export interface StorageSession {
  openDatabase: (filename: string, options?: { create?: boolean }) => Promise<void>
  execute: (sql: string, bind?: BindingSpec) => Promise<SqlRow[]>
  closeDatabase: () => Promise<void>
  dispose: () => Promise<void>
}

export async function initializeStorage(): Promise<StorageSession> {
  const limitation = getStorageLimitation()
  if (limitation) throw new Error(limitation)

  const worker = new Worker(new URL('./sqlite.worker.ts', import.meta.url), { type: 'module' })
  const pending = new Map<number, {
    resolve: (rows: SqlRow[]) => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  }>()
  let nextId = 0
  let stopped = false
  let disposing: Promise<void> | undefined

  function stop(error: Error) {
    if (stopped) return
    stopped = true
    worker.terminate()
    for (const entry of pending.values()) {
      clearTimeout(entry.timer)
      entry.reject(error)
    }
    pending.clear()
  }

  worker.addEventListener('message', ({ data }: MessageEvent<StorageResponse>) => {
    const entry = pending.get(data.id)
    if (!entry) return
    pending.delete(data.id)
    clearTimeout(entry.timer)
    if ('error' in data) entry.reject(new Error(data.error))
    else entry.resolve(data.rows)
  })
  worker.addEventListener('error', (event) => {
    event.preventDefault()
    stop(new Error('The local storage worker failed. Check the connection and host configuration, then retry.'))
  })
  worker.addEventListener('messageerror', () => {
    stop(new Error('The local storage worker returned an unreadable response. Retry storage setup.'))
  })

  function request(command: StorageCommand): Promise<SqlRow[]> {
    if (stopped) return Promise.reject(new Error('The local storage session is closed.'))
    const id = ++nextId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        stop(new Error('Local storage timed out. Close other JST tabs and retry.'))
      }, 30_000)
      pending.set(id, { resolve, reject, timer })
      try {
        worker.postMessage({ ...command, id }, [])
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
      execute: (sql, bind) => send({ type: 'execute', sql, bind }),
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
