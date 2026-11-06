/// <reference lib="webworker" />

import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import type { Database, Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import type { SqlRow, StorageRequest, StorageResponse } from './protocol'

let sqlite: Sqlite3Static | undefined
let database: Database | undefined
let queue = Promise.resolve()
const scope = globalThis as unknown as DedicatedWorkerGlobalScope

async function handle(request: StorageRequest) {
  try {
    let rows: SqlRow[] = []
    switch (request.type) {
      case 'initialize':
        if (
          typeof FileSystemFileHandle === 'undefined'
          || !('createSyncAccessHandle' in FileSystemFileHandle.prototype)
        ) {
          throw new Error('This browser does not support synchronous OPFS access in a worker.')
        }
        sqlite = await sqlite3InitModule()
        if (!sqlite.capi.sqlite3_vfs_find('opfs')) {
          throw new Error('SQLite OPFS storage is unavailable. Check browser support and isolation headers.')
        }
        break
      case 'open':
        if (!sqlite) throw new Error('Local storage has not been initialized.')
        if (database) throw new Error('Close the current database before opening another.')
        if (!/^\/[\w-]+\.sqlite3$/.test(request.filename)) {
          throw new Error('Use an absolute database filename such as /profile-id.sqlite3.')
        }
        database = new sqlite.oo1.DB({
          filename: request.filename,
          flags: request.create ? 'c' : 'w',
          vfs: 'opfs',
        })
        break
      case 'execute':
        if (!database) throw new Error('Open a local database before executing SQL.')
        rows = database.exec({
          sql: request.sql,
          bind: request.bind,
          rowMode: 'object',
          returnValue: 'resultRows',
        })
        break
      case 'close':
        database?.close()
        database = undefined
        break
    }
    scope.postMessage({ id: request.id, rows } satisfies StorageResponse, [])
  } catch (error) {
    scope.postMessage({
      id: request.id,
      error: error instanceof Error ? error.message : 'Local storage operation failed.',
    } satisfies StorageResponse, [])
  }
}

scope.addEventListener('message', (event: MessageEvent<StorageRequest>) => {
  queue = queue.then(() => handle(event.data))
})
