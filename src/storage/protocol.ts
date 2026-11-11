import type { BindingSpec, SqlValue } from '@sqlite.org/sqlite-wasm'

export type SqlRow = Record<string, SqlValue>

export type StorageCommand =
  | { type: 'initialize' }
  | { type: 'open'; filename: string; create: boolean }
  | { type: 'execute'; sql: string; bind?: BindingSpec }
  | { type: 'export-profile'; profileId: string }
  | { type: 'import-profile'; bytes: Uint8Array<ArrayBuffer> }
  | { type: 'close' }

export type StorageRequest = StorageCommand & { id: number }

export type StorageResponse =
  | { id: number; rows: SqlRow[]; bytes?: Uint8Array<ArrayBuffer> }
  | { id: number; error: string }
