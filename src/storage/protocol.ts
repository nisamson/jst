import type { BindingSpec, SqlValue } from '@sqlite.org/sqlite-wasm'

export type SqlRow = Record<string, SqlValue>

export type StorageCommand =
  | { type: 'initialize' }
  | { type: 'open'; filename: string; create: boolean }
  | { type: 'execute'; sql: string; bind?: BindingSpec }
  | { type: 'close' }

export type StorageRequest = StorageCommand & { id: number }

export type StorageResponse =
  | { id: number; rows: SqlRow[] }
  | { id: number; error: string }
