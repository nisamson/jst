import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('requires explicit acknowledgment and remembers it across visits but not cleared or outdated storage', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const dialog = page.getByRole('dialog', { name: 'Before you use Job Search Tracker' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.markdown-document p')).not.toBeEmpty()
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.mouse.click(5, 5)
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'I understand', exact: true }).click()
  await expect(dialog).toBeHidden()
  const acknowledgment = await page.evaluate(() => localStorage.getItem('jst-disclaimer-acknowledgment'))
  expect(acknowledgment).not.toBeNull()
  const version = testInfo.project.name.includes('production')
    ? await (await page.request.get('/app-version.txt')).text()
    : 'development'
  expect(acknowledgment!.split('\n')[0]).toBe(version)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Your profiles' })).toBeVisible()
  await expect(dialog).toBeHidden()
  await page.goto('/privacy')
  await expect(page.getByRole('heading', { name: 'Privacy Policy', level: 1 })).toBeVisible()
  await expect(dialog).toBeHidden()

  for (const previous of [
    acknowledgment!.replace(/^[^\n]+/, 'previous-build'),
    acknowledgment!.replace(/\n[\s\S]*/, '\nprevious disclaimer'),
  ]) {
    await page.evaluate((value) => localStorage.setItem('jst-disclaimer-acknowledgment', value), previous)
    await page.reload()
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'I understand', exact: true }).click()
  }
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(dialog).toBeVisible()
})

test('acknowledgment is not shared with a fresh browser context', async ({ page, browser, baseURL }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'I understand', exact: true }).click()
  const otherContext = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } })
  try {
    const otherPage = await otherContext.newPage()
    await otherPage.goto('/privacy')
    await expect(otherPage.getByRole('dialog', { name: 'Before you use Job Search Tracker' })).toBeVisible()
  } finally {
    await otherContext.close()
  }
})

test('allows continuing when acknowledgment storage is blocked and asks again after reload', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new DOMException('Storage blocked', 'SecurityError') },
    })
  })
  await page.goto('/privacy')
  const dialog = page.getByRole('dialog', { name: 'Before you use Job Search Tracker' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'I understand', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Privacy Policy', level: 1 })).toBeVisible()
  await page.reload()
  await expect(dialog).toBeVisible()
})

test('allows continuing when saving acknowledgment exceeds the storage quota', async ({ page }) => {
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'jst-disclaimer-acknowledgment') throw new DOMException('Storage full', 'QuotaExceededError')
      return setItem.call(this, key, value)
    }
  })
  await page.goto('/privacy')
  const dialog = page.getByRole('dialog', { name: 'Before you use Job Search Tracker' })
  await dialog.getByRole('button', { name: 'I understand', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(await page.evaluate(() => localStorage.getItem('jst-disclaimer-acknowledgment'))).toBeNull()
  await page.reload()
  await expect(dialog).toBeVisible()
})
