export type StorageProviderErrorCode =
  | 'authentication-required'
  | 'permission-denied'
  | 'not-found'
  | 'conflict'
  | 'quota-exceeded'
  | 'offline'
  | 'network'
  | 'cancelled'
  | 'unsupported'
  | 'not-initialized'
  | 'invalid-input'
  | 'unknown'

export class StorageProviderError extends Error {
  readonly code: StorageProviderErrorCode
  readonly retryable: boolean

  constructor(
    code: StorageProviderErrorCode,
    message: string,
    options?: { cause?: unknown; retryable?: boolean },
  ) {
    super(message, { cause: options?.cause })
    this.name = 'StorageProviderError'
    this.code = code
    this.retryable = options?.retryable ?? false
  }
}

export class StorageProviderOperationError extends StorageProviderError {
  readonly resumeToken?: string

  constructor(
    code: StorageProviderErrorCode,
    message: string,
    resumeToken?: string,
    options?: { cause?: unknown; retryable?: boolean },
  ) {
    super(code, message, options)
    this.name = 'StorageProviderOperationError'
    this.resumeToken = resumeToken
  }
}

export interface StorageProviderCapabilities {
  sessionRestore: boolean
  sessionRefresh: boolean
  fileListing: boolean
  fileReads: boolean
  fileWrites: boolean
  fileDeletes: boolean
  conditionalWrites: boolean
  resumableUploads: boolean
  streamingReads: boolean
  streamingWrites: boolean
  maximumFileSizeBytes?: number
}

export interface StorageProviderConnection {
  providerId: string
  accountLabel: string
  locationId?: string
  connectedAt: string
}

export type StorageProviderState =
  | { status: 'signed-out' }
  | { status: 'authenticated'; accountLabel: string }
  | { status: 'ready'; accountLabel: string; locationId: string }
  | { status: 'failed'; error: StorageProviderError; accountLabel?: string }

export type StorageProviderConnectResult =
  | { status: 'connected'; accountLabel: string }
  | { status: 'cancelled' }

export interface StorageLocation {
  id: string
  displayName?: string
}

export interface StorageFileHandle {
  providerId: string
  locationId: string
  id: string
}

export interface StorageFileMetadata {
  handle: StorageFileHandle
  name: string
  contentType: string
  size: number
  revision: string
  modifiedAt: string
}

export interface StorageFilePage {
  files: StorageFileMetadata[]
  nextPageToken?: string
}

export interface StorageProviderProgress {
  transferredBytes: number
  totalBytes: number
}

export interface StorageProviderWriteRequest {
  name: string
  contentType: string
  size: number
  body: ReadableStream<Uint8Array>
  mode: 'create' | 'replace'
  expectedRevision?: string
  resumeToken?: string
  signal?: AbortSignal
  onProgress?: (progress: StorageProviderProgress) => void
}

export interface StorageProviderWriteResult {
  file: StorageFileMetadata
  resumeToken?: string
}

export interface StorageProviderAdapter {
  readonly id: string
  readonly displayName: string
  readonly simulated: boolean
  readonly capabilities: StorageProviderCapabilities
  getState(): StorageProviderState
  connect(signal?: AbortSignal): Promise<StorageProviderConnectResult>
  restoreSession(signal?: AbortSignal): Promise<StorageProviderState>
  refreshSession(signal?: AbortSignal): Promise<StorageProviderState>
  initialize(signal?: AbortSignal): Promise<StorageLocation>
  disconnect(signal?: AbortSignal): Promise<void>
  listFiles(input?: { pageToken?: string; pageSize?: number; signal?: AbortSignal }): Promise<StorageFilePage>
  readFile(handle: StorageFileHandle, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>>
  writeFile(request: StorageProviderWriteRequest): Promise<StorageProviderWriteResult>
  deleteFile(handle: StorageFileHandle, options?: { expectedRevision?: string; signal?: AbortSignal }): Promise<void>
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new StorageProviderError('cancelled', 'The storage operation was cancelled.', { cause: signal.reason })
  }
}

export function assertReady(state: StorageProviderState): asserts state is Extract<StorageProviderState, { status: 'ready' }> {
  if (state.status === 'signed-out') {
    throw new StorageProviderError('authentication-required', 'Connect to the storage provider first.')
  }
  if (state.status === 'failed') throw state.error
  if (state.status !== 'ready') {
    throw new StorageProviderError('not-initialized', 'Initialize the storage location before using files.')
  }
}

export function validateStorageProviderConnection(input: StorageProviderConnection): void {
  if (!/^[a-z0-9][a-z0-9.-]{0,99}$/i.test(input.providerId)
    || !input.accountLabel.trim() || input.accountLabel.length > 255
    || (input.locationId !== undefined && (!input.locationId.trim() || input.locationId.length > 512))
    || !Number.isFinite(Date.parse(input.connectedAt))) {
    throw new StorageProviderError('invalid-input', 'The storage provider connection metadata is invalid.')
  }
}
