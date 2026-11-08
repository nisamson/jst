import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function createProfile(page: Page, label: string) {
  await page.getByRole('button', { name: 'Create profile', exact: true }).click()
  const form = page.locator('form')
  await form.getByRole('textbox', { name: 'Profile label' }).fill(label)
  await form.getByRole('button', { name: 'Create profile' }).click()
  await expect(page.getByRole('button', { name: `${label} profile` })).toBeVisible()
}

test('opens an empty profile-scoped overview, survives reload, and switches profiles', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => false })
    Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: async () => true })
  })
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
  await createProfile(page, 'First profile')
  await createProfile(page, 'Second profile')

  await page.getByRole('button', { name: 'First profile profile' }).click()
  await expect(page).toHaveURL(/\/claims\?profile=[0-9a-f-]+$/)
  await expect(page.getByRole('heading', { name: 'Claims overview' })).toBeVisible()
  await expect(page.getByText('Profile: First profile')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'No claims yet' })).toBeVisible()
  await expect(page.getByRole('button', { name: /create claim/i })).toHaveCount(0)

  await page.reload()
  await expect(page.getByText('Profile: First profile')).toBeVisible()
  await page.getByRole('button', { name: 'Change profile' }).click()
  await page.getByRole('button', { name: 'Second profile profile' }).click()
  await expect(page).toHaveURL(/\/claims\?profile=[0-9a-f-]+$/)
  await expect(page.getByText('Profile: Second profile')).toBeVisible()
  await expect(page.getByText('Profile: First profile')).toHaveCount(0)
})

test('direct navigation without a usable profile guides the user back to profile selection', async ({ page }) => {
  await page.goto('/claims')
  await expect(page.getByRole('heading', { name: 'Choose a profile' })).toBeVisible()
  await page.getByRole('button', { name: 'Return to profiles' }).click()
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: 'Your profiles' })).toBeVisible()
})

test('an unavailable profile shows an error without displaying profile content', async ({ page }) => {
  await page.goto('/claims?profile=33333333-3333-4333-8333-333333333333')
  await expect(page.getByRole('alert')).toContainText('This profile could not be opened')
  await expect(page.getByRole('heading', { name: 'No claims yet' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Return to profiles' }).click()
  await expect(page.getByRole('heading', { name: 'Your profiles' })).toBeVisible()
})
