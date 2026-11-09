/// <reference types="node" />

import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function createClaim(page: Page) {
  await page.getByRole('button', { name: 'Create claim', exact: true }).click()
  const form = page.getByRole('dialog', { name: 'Create claim', exact: true })
  await form.getByRole('textbox', { name: 'Claim identifier', exact: true }).fill('Evidence claim')
  await form.getByRole('button', { name: 'Create claim', exact: true }).click()
  await expect(form).toBeHidden()
}

async function openForm(page: Page) {
  await page.getByRole('button', { name: 'Add activity', exact: true }).click()
  const form = page.getByRole('dialog', { name: 'Add activity', exact: true })
  await form.getByRole('combobox', { name: 'Activity kind', exact: true }).selectOption('other_activity')
  await form.getByLabel(/^Activity date/).fill('2026-01-04')
  await form.getByRole('textbox', { name: 'Activity description', exact: true }).fill('Evidence workshop')
  return form
}

async function selectActivity(page: Page) {
  await page.getByRole('region', { name: 'Selected activity week', exact: true })
    .getByRole('list').getByRole('button', { name: /^Evidence workshop,/ }).click()
  return page.getByRole('region', { name: 'Activity details', exact: true })
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => true })
    Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: async () => true })
  })
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
  await page.getByRole('button', { name: 'Create profile', exact: true }).click()
  await page.getByRole('textbox', { name: 'Profile label', exact: true }).fill('Evidence profile')
  await page.locator('form').getByRole('button', { name: 'Create profile', exact: true }).click()
  await page.getByRole('button', { name: 'Continue without syncing' }).click()
  await createClaim(page)
})

test('persists multiple files, descriptions, and safe links; cancel preserves evidence; read-only downloads retain bytes', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 390, height: 844 })
  const form = await openForm(page)
  await form.getByRole('button', { name: 'Add link', exact: true }).click()
  await form.getByRole('textbox', { name: 'Link 1 label (optional)', exact: true }).fill('Workshop confirmation')
  await form.getByRole('textbox', { name: 'Link 1 URL', exact: true }).fill('javascript:alert(1)')
  await form.getByLabel('Choose files', { exact: true }).setInputFiles([
    { name: 'receipt.eml', mimeType: 'message/rfc822', buffer: Buffer.from('original email bytes') },
    { name: 'untrusted.html', mimeType: 'text/html', buffer: Buffer.from('<script>window.attachmentExecuted=true</script>') },
  ])
  await form.getByRole('textbox', { name: 'File 1 description (optional)', exact: true }).fill('Original confirmation email')
  await form.getByRole('button', { name: 'Add activity', exact: true }).click()
  await expect(form.getByRole('alert')).toContainText('HTTP or HTTPS')
  await form.getByRole('textbox', { name: 'Link 1 URL', exact: true }).fill('https://example.test/receipt')
  await form.getByRole('button', { name: 'Add link', exact: true }).click()
  await form.getByRole('textbox', { name: 'Link 2 URL', exact: true }).fill('https://example.test/notes')
  await form.getByRole('combobox', { name: 'Activity kind', exact: true }).selectOption('worksource_activity')
  await form.getByRole('textbox', { name: 'Activity description', exact: true }).fill('Evidence workshop')
  await expect(form.getByText('receipt.eml', { exact: true })).toBeVisible()
  await expect(form.getByRole('textbox', { name: 'File 1 description (optional)', exact: true })).toHaveValue('Original confirmation email')
  await form.getByRole('button', { name: 'Add activity', exact: true }).click()
  await expect(form).toBeHidden()
  await page.reload()
  let detail = await selectActivity(page)
  await expect(detail.getByRole('link')).toHaveCount(2)
  await expect(detail.getByRole('link', { name: 'Workshop confirmation', exact: true })).toHaveAttribute('rel', 'noopener noreferrer')
  await expect(detail).toContainText('Original confirmation email')
  await expect(detail.getByRole('button', { name: /^Download / })).toHaveCount(2)
  await expect(detail.getByText(/Consider retaining supporting evidence/)).toHaveCount(0)
  expect(await page.evaluate(() => Reflect.get(window, 'attachmentExecuted'))).toBeUndefined()
  const downloadPromise = page.waitForEvent('download')
  await detail.getByRole('button', { name: 'Download receipt.eml', exact: true }).click()
  const download = await downloadPromise
  expect(await readFile((await download.path())!, 'utf8')).toBe('original email bytes')

  await detail.getByRole('button', { name: 'Edit activity', exact: true }).click()
  const edit = page.getByRole('dialog', { name: 'Edit activity', exact: true })
  await edit.getByRole('button', { name: 'Remove file receipt.eml', exact: true }).click()
  await edit.getByRole('button', { name: 'Remove link 1', exact: true }).click()
  await edit.getByRole('textbox', { name: 'File 1 description (optional)', exact: true }).fill('Cancelled change')
  await edit.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(detail).toContainText('Original confirmation email')
  await expect(detail.getByRole('link')).toHaveCount(2)

  await detail.getByRole('button', { name: 'Edit activity', exact: true }).click()
  await edit.getByRole('textbox', { name: 'File 1 description (optional)', exact: true }).fill('Edited description')
  await edit.getByRole('button', { name: 'Remove file untrusted.html', exact: true }).click()
  await edit.getByRole('button', { name: 'Remove link 2', exact: true }).click()
  await edit.getByRole('button', { name: 'Save activity', exact: true }).click()
  await expect(edit).toBeHidden()
  await page.reload()
  detail = await selectActivity(page)
  await expect(detail).toContainText('Edited description')
  await expect(detail.getByRole('link')).toHaveCount(1)
  await expect(detail.getByRole('button', { name: /^Download / })).toHaveCount(1)

  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => false })
  })
  await page.reload()
  detail = await selectActivity(page)
  await expect(detail.getByRole('button', { name: 'Edit activity', exact: true })).toBeDisabled()
  const readOnlyDownloadPromise = page.waitForEvent('download')
  await detail.getByRole('button', { name: 'Download receipt.eml', exact: true }).click()
  expect(await readFile((await (await readOnlyDownloadPromise).path())!, 'utf8')).toBe('original email bytes')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('rejects file selections above the limits without losing the existing draft', async ({ page }) => {
  const form = await openForm(page)
  await form.getByLabel('Choose files', { exact: true }).setInputFiles([
    { name: 'keep.txt', mimeType: 'text/plain', buffer: Buffer.from('keep') },
  ])
  await form.getByRole('textbox', { name: 'File 1 description (optional)', exact: true }).fill('Keep this draft')
  await form.getByLabel('Choose files', { exact: true }).setInputFiles([
    { name: 'too-large.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) },
  ])
  await expect(form.getByRole('alert')).toContainText('10 MiB')
  await expect(form.getByText('keep.txt', { exact: true })).toBeVisible()
  await expect(form.getByText('too-large.bin', { exact: true })).toHaveCount(0)
  await expect(form.getByRole('textbox', { name: 'File 1 description (optional)', exact: true })).toHaveValue('Keep this draft')
  await form.getByRole('button', { name: 'Add activity', exact: true }).click()
  await expect(form).toBeHidden()
  await expect(page.getByRole('button', { name: 'Download keep.txt', exact: true })).toBeVisible()
})

test('accepts dropped files and pasted pictures with shared limits and preserves downloaded bytes', async ({ page }) => {
  const form = await openForm(page)
  const dropArea = form.getByRole('group', { name: 'Add evidence files', exact: true })
  await dropArea.focus()
  await expect(dropArea).toBeFocused()
  const dropped = await dropArea.evaluate((element) => {
    const dataTransfer = new DataTransfer()
    dataTransfer.items.add(new File(['dropped notes'], 'notes.txt', { type: 'text/plain' }))
    dataTransfer.items.add(new File(['dropped document'], 'receipt.pdf', { type: 'application/pdf' }))
    const event = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer })
    element.dispatchEvent(event)
    return event.defaultPrevented
  })
  expect(dropped).toBe(true)
  await expect(form.getByText('notes.txt', { exact: true })).toBeVisible()
  await expect(form.getByText('receipt.pdf', { exact: true })).toBeVisible()
  const picture = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a28sAAAAASUVORK5CYII='
  await dropArea.evaluate((element, base64) => {
    const clipboardData = new DataTransfer()
    clipboardData.items.add(new File([Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))],
      'image.png', { type: 'image/png' }))
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: clipboardData })
    element.dispatchEvent(event)
  }, picture)
  await expect(form.getByText('image.png', { exact: true })).toBeVisible()
  await form.getByRole('textbox', { name: 'File 3 description (optional)', exact: true }).fill('Pasted screenshot')
  const textPrevented = await form.getByRole('textbox', { name: 'File 3 description (optional)', exact: true })
    .evaluate((element) => {
      const clipboardData = new DataTransfer()
      clipboardData.setData('text/plain', 'ordinary text')
      const event = new Event('paste', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'clipboardData', { value: clipboardData })
      element.dispatchEvent(event)
      return event.defaultPrevented
    })
  expect(textPrevented).toBe(false)
  await dropArea.evaluate((element) => {
    const clipboardData = new DataTransfer()
    clipboardData.items.add(new File(['small'], 'small.png', { type: 'image/png' }))
    clipboardData.items.add(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }))
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: clipboardData })
    element.dispatchEvent(event)
  })
  await expect(form.getByRole('alert')).toContainText('10 MiB')
  await expect(form.getByText('small.png', { exact: true })).toHaveCount(0)
  await expect(form.getByText('large.png', { exact: true })).toHaveCount(0)
  await expect(form.getByRole('textbox', { name: 'File 3 description (optional)', exact: true })).toHaveValue('Pasted screenshot')
  await form.getByRole('button', { name: 'Add activity', exact: true }).click()
  await expect(form).toBeHidden()
  await page.reload()
  const detail = await selectActivity(page)
  await expect(detail.getByRole('button', { name: /^Download / })).toHaveCount(3)
  await expect(detail).toContainText('Pasted screenshot')
  let downloadPromise = page.waitForEvent('download')
  await detail.getByRole('button', { name: 'Download notes.txt', exact: true }).click()
  expect(await readFile((await (await downloadPromise).path())!, 'utf8')).toBe('dropped notes')
  downloadPromise = page.waitForEvent('download')
  await detail.getByRole('button', { name: 'Download image.png', exact: true }).click()
  expect(await readFile((await (await downloadPromise).path())!)).toEqual(Buffer.from(picture, 'base64'))
})

test('saves evidence on employer contacts with an optional blank file description', async ({ page }) => {
  await page.getByRole('button', { name: 'Add activity', exact: true }).click()
  const form = page.getByRole('dialog', { name: 'Add activity', exact: true })
  await form.getByLabel(/^Activity date/).fill('2026-01-04')
  await form.getByRole('textbox', { name: 'Job title or reference', exact: true }).fill('Engineer')
  await form.getByRole('textbox', { name: 'Employer name', exact: true }).fill('Example employer')
  await form.getByRole('textbox', { name: 'Employer website or email', exact: true }).fill('jobs@example.test')
  await form.getByRole('combobox', { name: 'Contact method', exact: true }).selectOption('email')
  await form.getByRole('combobox', { name: 'Contact type', exact: true }).selectOption('application_resume')
  await form.getByLabel('Choose files', { exact: true }).setInputFiles([
    { name: 'application.txt', mimeType: 'text/plain', buffer: Buffer.from('application confirmation') },
  ])
  await form.getByRole('button', { name: 'Add activity', exact: true }).click()
  await expect(form).toBeHidden()
  const detail = page.getByRole('region', { name: 'Activity details', exact: true })
  await expect(detail.getByRole('button', { name: 'Download application.txt', exact: true })).toBeVisible()
  await detail.getByRole('button', { name: 'Edit activity', exact: true }).click()
  const edit = page.getByRole('dialog', { name: 'Edit activity', exact: true })
  await expect(edit.getByRole('textbox', { name: 'File 1 description (optional)', exact: true })).toHaveValue('')
})

test('rolls back partial evidence saves on storage failure and lets the unchanged draft retry', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('production'), 'Failure injection uses Vite source modules.')
  let form = await openForm(page)
  await form.getByLabel('Choose files', { exact: true }).setInputFiles([{ name: 'existing.txt', mimeType: 'text/plain', buffer: Buffer.from('keep original') }])
  await form.getByRole('button', { name: 'Add activity', exact: true }).click()
  await expect(form).toBeHidden()
  const profileId = new URL(page.url()).searchParams.get('profile')!
  await page.evaluate(async (id) => {
    const path = '/src/storage/profiles.ts'
    const profiles: typeof import('../../src/storage/profiles') = await import(path)
    const session = await profiles.openProfile(id)
    try {
      await session.execute(`CREATE TRIGGER evidence_full BEFORE INSERT ON activity_files
        BEGIN SELECT RAISE(FAIL, 'SQLITE_FULL: injected quota failure'); END`)
    } finally { await session.dispose() }
  }, profileId)
  await page.getByRole('region', { name: 'Activity details', exact: true }).getByRole('button', { name: 'Edit activity', exact: true }).click()
  form = page.getByRole('dialog', { name: 'Edit activity', exact: true })
  await form.getByRole('textbox', { name: 'Activity description', exact: true }).fill('Pending edit')
  await form.getByRole('button', { name: 'Remove file existing.txt', exact: true }).click()
  await form.getByLabel('Choose files', { exact: true }).setInputFiles([{ name: 'retry.txt', mimeType: 'text/plain', buffer: Buffer.from('retry bytes') }])
  await form.getByRole('button', { name: 'Add link', exact: true }).click()
  await form.getByRole('textbox', { name: 'Link 1 URL', exact: true }).fill('https://example.test/retry')
  await form.getByRole('button', { name: 'Save activity', exact: true }).click()
  await expect(form.getByRole('alert')).toContainText('not enough browser or device storage')
  await expect(form.getByRole('textbox', { name: 'Activity description', exact: true })).toHaveValue('Pending edit')
  await expect(form.getByText('retry.txt', { exact: true })).toBeVisible()
  const stored = await page.evaluate(async (id) => {
    const path = '/src/storage/profiles.ts'
    const profiles: typeof import('../../src/storage/profiles') = await import(path)
    const session = await profiles.openProfile(id)
    try {
      const activities = await session.execute('SELECT activity_description FROM activities')
      const files = await session.execute('SELECT name FROM activity_files')
      const links = await session.execute('SELECT url FROM activity_links')
      await session.execute('DROP TRIGGER evidence_full')
      return { activities, files, links }
    } finally { await session.dispose() }
  }, profileId)
  expect(stored).toEqual({ activities: [{ activity_description: 'Evidence workshop' }], files: [{ name: 'existing.txt' }], links: [] })
  await form.getByRole('button', { name: 'Save activity', exact: true }).click()
  await expect(form).toBeHidden()
  await expect(page.getByRole('button', { name: 'Download retry.txt', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Download existing.txt', exact: true })).toHaveCount(0)
})
