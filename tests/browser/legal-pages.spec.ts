import { expect, test } from '@playwright/test'

test('renders Markdown legal documents and links to them from the disclaimer', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'End User License Agreement' }).first().click()
  await expect(page).toHaveURL('/eula')
  await expect(page.getByRole('heading', { level: 1, name: 'End User License Agreement' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Return to the job search tracker' })).toHaveAttribute('href', '/')

  await page.goto('/privacy')
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeVisible()
})
