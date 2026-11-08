import { expect, test } from '@playwright/test'

test('main page layouts scale with wide screens, cap their width, and fit narrow viewports', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  for (const [path, heading] of [
    ['/', 'Your profiles'],
    ['/claims', 'Choose a profile'],
    ['/diagnostics/storage', 'Storage diagnostics'],
  ]) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: heading })).toBeVisible()
    const wideWidth = await page.locator('main').evaluate((main) => main.getBoundingClientRect().width)
    expect(wideWidth).toBeGreaterThanOrEqual(1440 * 0.9)
    expect(wideWidth).toBeLessThanOrEqual(1920)
  }

  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto('/')
  const cappedWidth = await page.locator('main').evaluate((main) => main.getBoundingClientRect().width)
  expect(cappedWidth).toBe(1920)

  if (!testInfo.project.name.includes('production')) {
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
    await page.evaluate(async () => {
      const modulePath = '/src/storage/profiles.ts'
      const storage: typeof import('../../src/storage/profiles') = await import(modulePath)
      await storage.createProfile({ label: 'Profile one' })
      await storage.createProfile({ label: 'Profile two' })
    })
    await page.reload()
    await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
    await expect(page.getByRole('heading', { name: 'Local profiles' })).toBeVisible()
    await expect(page.locator('main ul li')).toHaveCount(2)
    const cardPositions = await page.locator('main ul li').evaluateAll((cards) =>
      cards.map((card) => card.getBoundingClientRect().top),
    )
    expect(cardPositions).toHaveLength(2)
    expect(cardPositions[0]).toBe(cardPositions[1])
  }

  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Your profiles' })).toBeVisible()
  const narrowLayout = await page.locator('main').evaluate((main) => ({
    width: main.getBoundingClientRect().width,
    documentWidth: document.documentElement.scrollWidth,
  }))
  expect(narrowLayout.width).toBeLessThanOrEqual(375)
  expect(narrowLayout.documentWidth).toBeLessThanOrEqual(375)
})
