import { expect, test } from '@playwright/test'

declare global {
  interface Window {
    persistRequestCount?: number
    finishPersistenceRequest?: () => void
    restoreProfileDirectory?: () => void
  }
}

test('validates profile labels, creates a profile, and defers persistence requests until creation', async ({ page }) => {
  await page.addInitScript(() => {
    window.persistRequestCount = 0
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => false })
    Object.defineProperty(navigator.storage, 'persist', {
      configurable: true,
      value: async () => {
        window.persistRequestCount = (window.persistRequestCount ?? 0) + 1
        return false
      },
    })
  })

  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
  await expect(page.getByRole('note')).toHaveCount(0)
  expect(await page.evaluate(() => window.persistRequestCount)).toBe(0)

  await page.getByRole('button', { name: 'Create profile', exact: true }).click()
  const form = page.locator('form')
  const label = form.getByRole('textbox', { name: 'Profile label' })
  await label.fill('   ')
  await form.getByRole('button', { name: 'Create profile' }).click()
  await expect(page.getByRole('alert')).toContainText('Enter a profile label')
  expect(await page.evaluate(() => window.persistRequestCount)).toBe(0)
  await expect(page.getByRole('heading', { name: 'No local profiles yet' })).toBeVisible()

  await label.fill('  Example profile  ')
  await form.getByRole('textbox', { name: 'Real name (optional)' }).fill('  Alex Example  ')
  await form.getByRole('button', { name: 'Create profile' }).click()

  await expect(page.getByRole('button', { name: 'Example profile profile' })).toBeVisible()
  await expect(page.getByText('Alex Example')).toBeVisible()
  await expect(page.getByRole('note')).toContainText('Persistent storage was not granted.')
  expect(await page.evaluate(() => window.persistRequestCount)).toBe(1)

  await page.reload()
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
  await expect(page.getByRole('button', { name: 'Example profile profile' })).toBeVisible()
  await expect(page.getByRole('note')).toHaveCount(0)
  expect(await page.evaluate(() => window.persistRequestCount)).toBe(0)
  await page.getByRole('button', { name: 'Example profile profile' }).click()
  await expect(page.getByText('Example profile is selected and open.')).toBeVisible()
  expect(await page.evaluate(() => window.persistRequestCount)).toBe(0)
})

test('cancel leaves existing profiles unchanged and makes no persistence request', async ({ page }) => {
  await page.addInitScript(() => {
    window.persistRequestCount = 0
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => false })
    Object.defineProperty(navigator.storage, 'persist', {
      configurable: true,
      value: async () => {
        window.persistRequestCount = (window.persistRequestCount ?? 0) + 1
        return true
      },
    })
  })

  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
  await expect(page.getByRole('heading', { name: 'No local profiles yet' })).toBeVisible()
  await page.getByRole('button', { name: 'Create profile', exact: true }).click()
  let form = page.locator('form')
  await form.getByRole('textbox', { name: 'Profile label' }).fill('Existing profile')
  await form.getByRole('button', { name: 'Create profile' }).click()
  await expect(page.getByRole('button', { name: 'Existing profile profile' })).toBeVisible()

  await page.getByRole('button', { name: 'Create profile', exact: true }).click()
  form = page.locator('form')
  await form.getByRole('textbox', { name: 'Profile label' }).fill('Cancelled profile')
  await form.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('heading', { name: 'Create a local profile' })).toHaveCount(0)
  expect(await page.evaluate(() => window.persistRequestCount)).toBe(1)
  await expect(page.getByRole('button', { name: 'Existing profile profile' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancelled profile profile' })).toHaveCount(0)
})

test('preserves form values after a save failure and allows retry', async ({ page }) => {
  await page.addInitScript(() => {
    window.persistRequestCount = 0
    let granted = false
    Object.defineProperty(navigator.storage, 'persisted', {
      configurable: true,
      value: async () => granted,
    })
    Object.defineProperty(navigator.storage, 'persist', {
      configurable: true,
      value: async () => {
        window.persistRequestCount = (window.persistRequestCount ?? 0) + 1
        granted = true
        return true
      },
    })
  })

  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
  await expect(page.getByRole('heading', { name: 'No local profiles yet' })).toBeVisible()
  await page.evaluate(() => {
    const storage = navigator.storage
    const original = storage.getDirectory.bind(storage)
    Object.defineProperty(storage, 'getDirectory', {
      configurable: true,
      value: () => Promise.reject(new Error('OPFS directory is temporarily unavailable')),
    })
    Object.defineProperty(window, 'restoreProfileDirectory', {
      configurable: true,
      value: () => Object.defineProperty(storage, 'getDirectory', { configurable: true, value: original }),
    })
  })

  await page.getByRole('button', { name: 'Create profile', exact: true }).click()
  const form = page.locator('form')
  const label = form.getByRole('textbox', { name: 'Profile label' })
  const realName = form.getByRole('textbox', { name: 'Real name (optional)' })
  await label.fill('Retry profile')
  await realName.fill('Riley Example')
  await form.getByRole('button', { name: 'Create profile' }).click()
  await expect(page.getByRole('alert')).toContainText('OPFS directory is temporarily unavailable')
  await expect(label).toHaveValue('Retry profile')
  await expect(realName).toHaveValue('Riley Example')
  await expect(page.getByRole('button', { name: 'Retry profile profile' })).toHaveCount(0)

  await page.evaluate(() => window.restoreProfileDirectory?.())
  await form.getByRole('button', { name: 'Create profile' }).click()
  await expect(page.getByRole('button', { name: 'Retry profile profile' })).toBeVisible()
  await expect(page.getByText('Riley Example')).toBeVisible()
  expect(await page.evaluate(() => window.persistRequestCount)).toBe(1)
})

test('blocks duplicate submissions while a persistence request is pending', async ({ page }) => {
  await page.addInitScript(() => {
    window.persistRequestCount = 0
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => false })
    Object.defineProperty(navigator.storage, 'persist', {
      configurable: true,
      value: () => {
        window.persistRequestCount = (window.persistRequestCount ?? 0) + 1
        return new Promise<boolean>((resolve) => {
          window.finishPersistenceRequest = () => resolve(true)
        })
      },
    })
  })

  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
  await page.getByRole('button', { name: 'Create profile', exact: true }).click()
  const form = page.locator('form')
  await form.getByRole('textbox', { name: 'Profile label' }).fill('Single profile')
  await form.getByRole('button', { name: 'Create profile' }).click()
  await expect(form).toHaveAttribute('aria-busy', 'true')

  await form.evaluate((element) => {
    element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  expect(await page.evaluate(() => window.persistRequestCount)).toBe(1)

  await page.evaluate(() => window.finishPersistenceRequest?.())
  await expect(page.getByRole('button', { name: 'Single profile profile' })).toBeVisible()
  const profileFiles = await page.evaluate(async () => {
    const directory = await navigator.storage.getDirectory()
    const files: string[] = []
    for await (const [name, entry] of directory.entries()) {
      if (entry.kind === 'file' && name.startsWith('profile-')) files.push(name)
    }
    return files
  })
  expect(profileFiles).toHaveLength(1)
})
