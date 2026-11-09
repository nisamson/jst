import { expect, test } from '@playwright/test'

declare global {
  interface Window {
    restoreDirectory?: () => void
  }
}

test('opens the selected profile claims overview and switches profiles', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')

  const profiles = await page.evaluate(async () => {
    const modulePath = '/src/storage/profiles.ts'
    const storage: typeof import('../../src/storage/profiles') = await import(modulePath)
    const first = await storage.createProfile({ label: 'Profile one', realName: 'Alex One' })
    const second = await storage.createProfile({ label: 'Profile two', realName: 'Riley Two' })
    return { first, second }
  })
  await page.reload()
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')

  const firstOption = page.getByRole('button', { name: 'Profile one profile' })
  const secondOption = page.getByRole('button', { name: 'Profile two profile' })
  await expect(firstOption).toBeVisible()
  await expect(secondOption).toBeVisible()
  await secondOption.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(`/claims\\?profile=${profiles.second.id}`))
  await expect(page.getByRole('heading', { name: 'Claims overview' })).toBeVisible()
  await expect(page.getByText('Profile: Profile two')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'No claims yet' })).toBeVisible()

  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Profiles' }).click()
  await firstOption.click()
  await expect(page).toHaveURL(new RegExp(`/claims\\?profile=${profiles.first.id}`))
  await expect(page.getByText('Profile: Profile one')).toBeVisible()
  await expect(page.getByText('Profile: Profile two')).toHaveCount(0)
  expect(profiles.first.id).not.toBe(profiles.second.id)
})

test('requires the exact profile label before deletion and preserves other profiles after reload', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => true })
    Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: async () => true })
  })
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')

  for (const label of ['Profile to delete', 'Profile to keep']) {
    await page.getByRole('button', { name: 'Create profile', exact: true }).click()
    const form = page.locator('form')
    await form.getByRole('textbox', { name: 'Profile label' }).fill(label)
    await form.getByRole('button', { name: 'Create profile' }).click()
    await page.getByRole('button', { name: 'Continue without syncing' }).click()
    await expect(page.getByText(`Profile: ${label}`)).toBeVisible()
    await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Profiles' }).click()
  }

  await page.evaluate(async () => {
    const modulePath = '/src/storage/profiles.ts'
    const profiles: typeof import('../../src/storage/profiles') = await import(modulePath)
    const profile = (await profiles.listProfiles()).profiles.find((item) => item.label === 'Profile to keep')
    if (!profile) throw new Error('The profile to keep was not found.')
    const session = await profiles.openProfile(profile.id)
    try {
      await session.execute(
        'INSERT INTO claims (id, identifier, created_at, claim_start_date) VALUES (?, ?, ?, ?)',
        ['preserved-claim', 'Preserved claim', '2026-03-01T12:00:00.000Z', null],
      )
    } finally {
      await session.dispose()
    }
  })

  const deletedProfileId = await page.evaluate(async () => {
    const modulePath = '/src/storage/profiles.ts'
    const profiles: typeof import('../../src/storage/profiles') = await import(modulePath)
    return (await profiles.listProfiles()).profiles.find((item) => item.label === 'Profile to delete')?.id
  })
  expect(deletedProfileId).toBeDefined()

  await page.getByRole('button', { name: 'Delete Profile to delete' }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete profile?' })
  const nameInput = dialog.getByRole('textbox', { name: 'Type profile name to confirm' })
  const confirmButton = dialog.getByRole('button', { name: 'Delete profile' })
  await expect(confirmButton).toBeDisabled()
  await nameInput.fill('wrong label')
  await expect(confirmButton).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Profile to delete profile' })).toBeVisible()

  await page.getByRole('button', { name: 'Delete Profile to delete' }).click()
  const confirmDialog = page.getByRole('dialog', { name: 'Delete profile?' })
  const confirmInput = confirmDialog.getByRole('textbox', { name: 'Type profile name to confirm' })
  const confirmDelete = confirmDialog.getByRole('button', { name: 'Delete profile' })
  await expect(confirmDelete).toBeDisabled()
  await confirmInput.fill('Profile to delete!')
  await expect(confirmDelete).toBeDisabled()
  await confirmInput.fill('Profile to delete')
  await confirmDelete.click()
  await expect(page.getByRole('button', { name: 'Profile to delete profile' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Profile to keep profile' })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('button', { name: 'Profile to delete profile' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Profile to keep profile' })).toBeVisible()
  await page.getByRole('button', { name: 'Profile to keep profile' }).click()
  await expect(page.getByRole('button', { name: 'Preserved claim' })).toBeVisible()

  await page.goto(`/claims?profile=${deletedProfileId}`)
  await expect(page.getByRole('alert')).toContainText('This profile could not be opened')
  await page.getByRole('button', { name: 'Return to profiles' }).click()
  await expect(page.getByRole('button', { name: 'Profile to keep profile' })).toBeVisible()
})

test('reports discovery failure and recovers when profile discovery is retried', async ({ page }) => {
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
    Object.defineProperty(window, 'restoreDirectory', {
      configurable: true,
      value: () => Object.defineProperty(storage, 'getDirectory', { configurable: true, value: original }),
    })
  })
  await page.getByRole('button', { name: 'Retry profile discovery' }).click()
  await expect(page.getByRole('alert')).toContainText('OPFS directory is temporarily unavailable')
  await expect(page.getByRole('heading', { name: 'No local profiles yet' })).toHaveCount(0)

  await page.evaluate(() => {
    window.restoreDirectory?.()
  })
  await page.getByRole('button', { name: 'Retry profile discovery' }).click()
  await expect(page.getByRole('heading', { name: 'No local profiles yet' })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('reports corrupt profile files while keeping valid profiles available', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')

  const validProfile = await page.evaluate(async () => {
    const modulePath = '/src/storage/profiles.ts'
    const storage: typeof import('../../src/storage/profiles') = await import(modulePath)
    return storage.createProfile({ label: 'Available profile' })
  })
  const corruptId = '33333333-3333-4333-8333-333333333333'
  await page.evaluate(async (id) => {
    const directory = await navigator.storage.getDirectory()
    await directory.getFileHandle(`profile-${id}.sqlite3`, { create: true })
  }, corruptId)
  await page.reload()
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')

  await expect(page.getByRole('button', { name: 'Available profile profile' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText(corruptId)
  await page.getByRole('button', { name: 'Available profile profile' }).click()
  await expect(page.getByRole('heading', { name: 'Claims overview' })).toBeVisible()
  await expect(page.getByText('Profile: Available profile')).toBeVisible()
  expect(validProfile.id).not.toBe(corruptId)
})
