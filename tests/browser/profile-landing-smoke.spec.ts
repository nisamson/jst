import { expect, test } from '@playwright/test'

test('first use explains local profiles without creating a database or dead-end action', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
  await expect(page.getByRole('main')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your profiles' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'No local profiles yet' })).toBeVisible()
  await expect(page.getByRole('button', { name: /create profile/i })).toHaveCount(0)

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
