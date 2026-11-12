import { beforeEach, expect, it, vi } from 'vitest'
import { readDiagnosticRecord, writeDiagnosticRecord } from './diagnostics'
import { initializeStorage } from './local-storage'
import type { StorageSession } from './local-storage'

vi.mock('./local-storage', () => ({ initializeStorage: vi.fn() }))

let storage: StorageSession

beforeEach(() => {
  storage = {
    openDatabase: vi.fn().mockResolvedValue(undefined),
    execute: vi.fn().mockResolvedValue([]),
    exportProfile: vi.fn(),
    importProfile: vi.fn(),
    closeDatabase: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
  }
  vi.mocked(initializeStorage).mockResolvedValue(storage)
})

it('releases the storage session when a diagnostic write fails', async () => {
  vi.mocked(storage.execute).mockRejectedValue(new Error('disk is full'))
  await expect(writeDiagnosticRecord()).rejects.toThrow('disk is full')
  expect(storage.dispose).toHaveBeenCalledOnce()
})

it('does not report success when the saved marker differs from the URL', async () => {
  vi.mocked(storage.execute).mockResolvedValue([{
    token: 'different-token',
    written_at: '2026-01-01T00:00:00.000Z',
    sqlite_version: '3.54.1',
  }])
  await expect(readDiagnosticRecord('expected-token')).rejects.toThrow(/does not match/)
  expect(storage.dispose).toHaveBeenCalledOnce()
})

it('reports a missing record without fabricating a persistence result', async () => {
  await expect(readDiagnosticRecord()).rejects.toThrow(/No diagnostic record was found/)
  expect(storage.dispose).toHaveBeenCalledOnce()
})
