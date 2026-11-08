import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function createProfile(page: Page, label: string) {
  await page.getByRole('button', { name: 'Create profile', exact: true }).click()
  const form = page.locator('form')
  await form.getByRole('textbox', { name: 'Profile label' }).fill(label)
  await form.getByRole('button', { name: 'Create profile' }).click()
  await expect(page.getByRole('heading', { name: 'Simulated sync setup' })).toBeVisible()
}

test('continues a new local profile to its read-only claims overview and reopens it after reload', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => false })
    Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: async () => false })
  })

  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
  await createProfile(page, 'Local onboarding profile')
  await expect(page.getByText('no authorization, data transfer, synchronization, or backup', { exact: false })).toBeVisible()
  const continueButton = page.getByRole('button', { name: 'Continue without syncing' })
  await continueButton.hover()
  await expect(page.getByRole('tooltip')).toHaveText(
    'Your data may be lost if this browser’s storage is cleared. Without syncing, there’s no cloud copy.',
  )
  await expect(page.getByRole('alert', { name: 'Data loss risk' })).toBeHidden()
  await expect(continueButton).toHaveCSS('color', 'rgb(230, 119, 0)')
  await expect(continueButton.locator('svg[aria-hidden="true"]')).toBeVisible()
  await expect.poll(async () => {
    const button = await continueButton.boundingBox()
    const dialog = await page.getByRole('dialog').boundingBox()
    if (!button || !dialog) return 0
    return button.width / dialog.width
  }).toBeGreaterThan(0.9)
  await continueButton.click()

  await expect(page).toHaveURL(/\/claims\?profile=[0-9a-f-]+$/)
  await expect(page.getByText('Profile: Local onboarding profile')).toBeVisible()
  const readOnlyNotice = page.getByRole('note').filter({ hasText: 'Profile is read-only' })
  await expect(readOnlyNotice).toContainText('profile-content changes are blocked.')

  await page.reload()
  await expect(page.getByText('Profile: Local onboarding profile')).toBeVisible()
  await expect(page.getByRole('note').filter({ hasText: 'Profile is read-only' })).toBeVisible()
  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Profiles' }).click()
  await page.getByRole('button', { name: 'Local onboarding profile profile' }).click()
  await expect(page.getByText('Profile: Local onboarding profile')).toBeVisible()
})

test('shows the data-loss warning inline on mobile widths', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
  await createProfile(page, 'Mobile onboarding profile')

  await expect(page.getByRole('alert', { name: 'Data loss risk' })).toBeVisible()
  await expect(page.getByRole('alert', { name: 'Data loss risk' })).toContainText(
    'Your data may be lost if this browser’s storage is cleared. Without syncing, there’s no cloud copy.',
  )
})

test('successful simulated setup navigates to claims and remains profile-scoped after reload', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => false })
    Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: async () => false })
  })

  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
  await createProfile(page, 'Connected onboarding profile')
  await page.getByRole('button', { name: 'Connect simulated provider' }).click()

  await expect(page).toHaveURL(/\/claims\?profile=[0-9a-f-]+$/)
  await expect(page.getByText('Profile: Connected onboarding profile')).toBeVisible()
  await expect(page.getByRole('note').filter({ hasText: 'Profile is read-only' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'No claims yet' })).toBeVisible()

  await page.reload()
  await expect(page.getByText('Profile: Connected onboarding profile')).toBeVisible()
  await expect(page.getByRole('note').filter({ hasText: 'Profile is read-only' })).toHaveCount(0)
  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Profiles' }).click()
  await page.getByRole('button', { name: 'Connected onboarding profile profile' }).click()
  await expect(page.getByText('Profile: Connected onboarding profile')).toBeVisible()
  await expect(page.getByRole('note').filter({ hasText: 'Profile is read-only' })).toHaveCount(0)
})

test('failed setup can continue locally without changing existing profile records', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('production'), 'This storage failure uses Vite source modules.')
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => true })
    Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: async () => true })
  })

  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
  await createProfile(page, 'Retry onboarding profile')
  await expect(page.getByRole('button', { name: 'Connect simulated provider' })).toBeVisible()

  await page.evaluate(async () => {
    const modulePath = '/src/storage/profiles.ts'
    const profiles: typeof import('../../src/storage/profiles') = await import(modulePath)
    const profile = (await profiles.listProfiles()).profiles.find((item) => item.label === 'Retry onboarding profile')
    if (!profile) throw new Error('The onboarding profile was not saved.')
    const session = await profiles.openProfile(profile.id)
    try {
      await session.execute(
        'INSERT INTO claims (id, identifier, created_at, claim_start_date) VALUES (?, ?, ?, ?)',
        ['preserved-claim', 'Preserved claim', '2026-03-01T12:00:00.000Z', null],
      )
      await session.execute(`
        CREATE TRIGGER reject_onboarding_setup
        BEFORE INSERT ON simulated_sync_setup
        BEGIN
          SELECT RAISE(FAIL, 'Simulated setup persistence failure');
        END
      `)
    } finally {
      await session.dispose()
    }
  })

  await page.getByRole('button', { name: 'Connect simulated provider' }).click()
  await expect(page.getByRole('alert')).toContainText('Simulated setup persistence failure')
  await page.getByRole('button', { name: 'Continue without syncing' }).click()

  await expect(page).toHaveURL(/\/claims\?profile=[0-9a-f-]+$/)
  await expect(page.getByText('Profile: Retry onboarding profile')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Preserved claim' })).toBeVisible()
  const access = await page.evaluate(async () => {
    const modulePath = '/src/storage/profiles.ts'
    const profiles: typeof import('../../src/storage/profiles') = await import(modulePath)
    const profile = (await profiles.listProfiles()).profiles.find((item) => item.label === 'Retry onboarding profile')
    if (!profile) throw new Error('The onboarding profile is missing after setup failure.')
    const session = await profiles.openProfile(profile.id)
    try {
      return session.access
    } finally {
      await session.dispose()
    }
  })
  expect(access.syncConnected).toBe(false)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Preserved claim' })).toBeVisible()
})
