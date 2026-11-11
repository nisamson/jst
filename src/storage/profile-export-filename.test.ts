import { describe, expect, it } from 'vitest'
import { profileExportFilename } from './profile-export-filename'

describe('profileExportFilename', () => {
  it('preserves profile labels including spaces and Unicode', () => {
    expect(profileExportFilename('My job search')).toBe('My job search.sqlite3')
    expect(profileExportFilename('Recherche été')).toBe('Recherche été.sqlite3')
  })

  it('replaces path separators, forbidden characters, and control characters', () => {
    expect(profileExportFilename('../Job\\search: "2026"?\n')).toBe('_Job_search_ _2026___.sqlite3')
  })

  it('removes boundary dots and whitespace and handles empty names', () => {
    expect(profileExportFilename(' .My profile... ')).toBe('My profile.sqlite3')
    expect(profileExportFilename(' ... ')).toBe('job-search-profile.sqlite3')
  })

  it('avoids reserved Windows device names, including names with extensions', () => {
    expect(profileExportFilename('CON')).toBe('_CON.sqlite3')
    expect(profileExportFilename('lpt1.notes')).toBe('_lpt1.notes.sqlite3')
  })

  it('bounds long filenames without splitting Unicode characters', () => {
    const name = profileExportFilename('😀'.repeat(100))
    expect(name).toBe(`${'😀'.repeat(60)}.sqlite3`)
    expect(new TextEncoder().encode(name).length).toBeLessThan(255)
  })
})
