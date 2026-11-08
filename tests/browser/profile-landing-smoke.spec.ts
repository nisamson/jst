import { expect, test } from '@playwright/test'

test('first use offers profile creation without creating a database before the user submits', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
  await expect(page.getByRole('main')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your profiles' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'No local profiles yet' })).toBeVisible()
  await page.getByRole('button', { name: 'Create profile', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Create a local profile' })).toBeVisible()
  await page.locator('form').getByRole('button', { name: 'Cancel' }).click()

  const profileFiles = await page.evaluate(async () => {
    const directory = await navigator.storage.getDirectory()
    const files: string[] = []
    for await (const [name, entry] of directory.entries()) {
      if (entry.kind === 'file' && name.startsWith('profile-')) files.push(name)
    }
    return files
  })
  expect(profileFiles).toEqual([])
})

test('unsupported OPFS storage blocks profile discovery with an explanation', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'storage', { value: undefined })
  })
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('OPFS')
  await expect(page.getByRole('heading', { name: 'Your profiles' })).toHaveCount(0)
})
