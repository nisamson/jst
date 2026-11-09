import { expect, it } from 'vitest'
import { developerToolsEnabled } from './developer-tools'

it('allows local preview but not deployed production hosts', () => {
  for (const hostname of ['localhost', '127.0.0.1', '[::1]']) {
    expect(developerToolsEnabled(hostname, false)).toBe(true)
  }
  for (const hostname of ['example.com', 'localhost.example.com', '192.168.1.10', undefined]) {
    expect(developerToolsEnabled(hostname, false)).toBe(false)
  }
})

it('retains developer tools when the dev server is accessed remotely', () => {
  expect(developerToolsEnabled('192.168.1.10', true)).toBe(true)
})
