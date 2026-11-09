import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function createProfile(page: Page, label: string) {
  await page.getByRole('button', { name: 'Create profile', exact: true }).click()
  await page.getByRole('textbox', { name: 'Profile label', exact: true }).fill(label)
  await page.locator('form').getByRole('button', { name: 'Create profile', exact: true }).click()
  await page.getByRole('button', { name: 'Continue without syncing' }).click()
  await expect(page.getByText(`Profile: ${label}`)).toBeVisible()
}

async function createClaim(page: Page, name: string) {
  await page.getByRole('button', { name: 'Create claim', exact: true }).click()
  const form = page.getByRole('dialog', { name: 'Create claim', exact: true })
  await form.getByRole('textbox', { name: 'Claim identifier', exact: true }).fill(name)
  await form.getByRole('button', { name: 'Create claim', exact: true }).click()
  await expect(form).toBeHidden()
  await expect(page.getByText('No activities yet.', { exact: false })).toBeVisible()
}

async function addOtherActivity(page: Page, date: string, description: string) {
  await page.getByRole('button', { name: 'Add activity', exact: true }).click()
  const form = page.getByRole('dialog', { name: 'Add activity', exact: true })
  await form.getByRole('combobox', { name: 'Activity kind', exact: true }).selectOption('other_activity')
  await form.getByLabel(/^Activity date/).fill(date)
  await form.getByRole('textbox', { name: 'Activity description', exact: true }).fill(description)
  await form.getByRole('button', { name: 'Add activity', exact: true }).click()
  await expect(form).toBeHidden()
}

async function addEmployerActivity(page: Page, date: string) {
  await page.getByRole('button', { name: 'Add activity', exact: true }).click()
  const form = page.getByRole('dialog', { name: 'Add activity', exact: true })
  await form.getByRole('combobox', { name: 'Activity kind', exact: true }).selectOption('employer_contact')
  await form.getByLabel(/^Activity date/).fill(date)
  await form.getByRole('textbox', { name: 'Job title or reference', exact: true }).fill('Resume interview')
  await form.getByRole('textbox', { name: 'Employer name', exact: true }).fill('Acme')
  await form.getByRole('combobox', { name: 'Contact method', exact: true }).selectOption('email')
  await form.getByRole('combobox', { name: 'Contact type', exact: true }).selectOption('interview')
  await form.getByRole('textbox', { name: 'Employer website or email', exact: true }).fill('jobs@acme.test')
  await form.getByRole('button', { name: 'Add activity', exact: true }).click()
  await expect(form).toBeHidden()
}

function activitySearch(page: Page) {
  const activities = page.getByRole('region', { name: 'Job-search activities', exact: true })
  const disclosure = activities.locator('details[data-search-disclosure]')
  return { activities, disclosure }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => true })
    Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: async () => true })
  })
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
  await createProfile(page, 'Activity search')
  await createClaim(page, 'Search claim')
})

test('ranks token matches, keeps a collapsed search intact, and restores weekly browsing when cleared', async ({ page }) => {
  await addOtherActivity(page, '2026-01-18', 'Resume refresh')
  await addEmployerActivity(page, '2026-01-04')
  const { activities, disclosure } = activitySearch(page)
  await expect(disclosure).not.toHaveAttribute('open')
  await expect(disclosure.locator(':scope > summary')).toContainText('Search within claim')
  await expect(disclosure.locator(':scope > summary svg[aria-hidden="true"]')).toHaveCount(1)
  const summary = disclosure.locator(':scope > summary')
  const summaryBox = await summary.boundingBox()
  const labelBox = await summary.getByText('Search within claim', { exact: true }).boundingBox()
  expect(summaryBox!.height).toBeLessThan(labelBox!.height * 1.5)

  await page.context().setOffline(true)
  await disclosure.locator('summary').click()
  await disclosure.getByRole('textbox', { name: 'Search activities', exact: true }).fill('resume interview')
  const results = activities.getByRole('region', { name: 'Activity search results', exact: true })
  const weeks = results.getByRole('region')
  await expect(weeks).toHaveCount(2)
  await expect(weeks.nth(0)).toHaveAttribute('aria-label', 'Search results for week 2026-01-04 to 2026-01-10')
  await expect(weeks.nth(1)).toHaveAttribute('aria-label', 'Search results for week 2026-01-18 to 2026-01-24')
  await weeks.nth(0).getByRole('button', { name: /Acme - Resume interview/ }).click()
  const detail = results.getByRole('region', { name: 'Activity details', exact: true })
  await expect(detail).toContainText('Employer name: Acme')
  await expect(disclosure.getByRole('textbox', { name: 'Search activities', exact: true })).toHaveValue('resume interview')

  await disclosure.locator(':scope > summary').click()
  await expect(disclosure).not.toHaveAttribute('open')
  await disclosure.locator(':scope > summary').click()
  await expect(disclosure).toHaveAttribute('open', '')
  await expect(disclosure.getByRole('textbox', { name: 'Search activities', exact: true })).toHaveValue('resume interview')
  await expect(results.getByRole('region', { name: 'Activity details', exact: true })).toContainText('Employer name: Acme')

  const kindFilter = disclosure.getByRole('combobox', { name: 'Activity kind', exact: true })
  await kindFilter.click()
  await page.getByRole('option', { name: 'Other activity', exact: true }).click()
  await expect(results.getByRole('list')).toHaveCount(1)
  await disclosure.getByRole('textbox', { name: 'Search activities', exact: true }).fill('xyznonexistentterm')
  await expect(results.getByText('No activities match this search.', { exact: true })).toBeVisible()
  await disclosure.getByRole('button', { name: 'Clear search', exact: true }).click()
  await expect(results).toHaveCount(0)
  await expect(activities.getByRole('region', { name: 'Selected activity week', exact: true })).toBeVisible()

  await page.context().setOffline(false)
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => false })
  })
  await page.reload()
  await expect(page.getByRole('button', { name: 'Add activity', exact: true })).toBeDisabled()
  const readOnlySearch = activitySearch(page).disclosure
  await readOnlySearch.locator(':scope > summary').click()
  await readOnlySearch.getByRole('textbox', { name: 'Search activities', exact: true }).fill('resume interview')
  const readOnlyResults = readOnlySearch.getByRole('region', { name: 'Activity search results', exact: true })
  await readOnlyResults.getByRole('button', { name: /Acme - Resume interview/ }).click()
  await expect(readOnlyResults.getByRole('region', { name: 'Activity details', exact: true })
    .getByRole('button', { name: 'Edit activity', exact: true })).toBeDisabled()
})

test('keeps search results isolated between claims and profiles', async ({ page }) => {
  await addOtherActivity(page, '2026-01-04', 'firstonlymarker')
  const firstClaimUrl = page.url()
  await createClaim(page, 'Second claim')
  await addOtherActivity(page, '2026-01-11', 'secondonlymarker')
  let disclosure = activitySearch(page).disclosure
  await disclosure.locator('summary').click()
  let search = disclosure.getByRole('textbox', { name: 'Search activities', exact: true })
  await search.fill('firstonlymarker')
  await expect(disclosure.getByText('No activities match this search.', { exact: true })).toBeVisible()
  await search.fill('secondonlymarker')
  await expect(disclosure.getByRole('list', { name: /^Search results for week/ })).toHaveCount(1)

  await page.getByRole('button', { name: 'Switch profile', exact: true }).click()
  await createProfile(page, 'Other profile')
  await createClaim(page, 'Other profile claim')
  await addOtherActivity(page, '2026-01-18', 'profileonlymarker')
  disclosure = activitySearch(page).disclosure
  await disclosure.locator('summary').click()
  search = disclosure.getByRole('textbox', { name: 'Search activities', exact: true })
  await search.fill('secondonlymarker')
  await expect(disclosure.getByText('No activities match this search.', { exact: true })).toBeVisible()
  await search.fill('profileonlymarker')
  await expect(disclosure.getByRole('list', { name: /^Search results for week/ })).toHaveCount(1)

  await page.goto(firstClaimUrl)
  disclosure = activitySearch(page).disclosure
  await disclosure.locator('summary').click()
  search = disclosure.getByRole('textbox', { name: 'Search activities', exact: true })
  await search.fill('firstonlymarker')
  await expect(disclosure.getByRole('list', { name: /^Search results for week/ })).toHaveCount(1)
  await search.fill('profileonlymarker')
  await expect(disclosure.getByText('No activities match this search.', { exact: true })).toBeVisible()
})
