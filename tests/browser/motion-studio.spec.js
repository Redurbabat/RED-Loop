import { test, expect } from '@playwright/test'

const studio = '/motion-studio.html'

test.describe('RED Loop Motion Studio', () => {
  test.beforeEach(async ({ page }) => { await page.goto(studio) })

  test('catalog search, scene switching and settings remain functional', async ({ page }) => {
    const compact = await page.evaluate(() => matchMedia('(max-width: 850px)').matches)
    if (compact) await page.getByRole('button', { name: 'Katalog' }).click()
    await expect(page.locator('#ui-loop-scene-list button')).toHaveCount(8)
    await page.locator('#ui-loop-search').fill('Glass Filament')
    await expect(page.locator('#ui-loop-scene-list button')).toHaveCount(1)
    await page.locator('[data-scene="glass-filament"]').click()
    await expect(page.locator('#ui-loop-title')).toContainText('Glass')
    await page.locator('#ui-loop-density').evaluate(input => { input.value = '72'; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })) })
    await expect(page.locator('#ui-loop-density-output')).toHaveText('72')
    await expect(page).toHaveURL(/density=72/)
    const pixels = await page.locator('#ui-loop-canvas').evaluate(canvas => canvas.width * canvas.height)
    expect(pixels).toBeGreaterThan(0)
    expect(pixels).toBeLessThanOrEqual(1605000)
  })

  test('animation is opt-in and source panel is available', async ({ page }) => {
    const play = page.locator('#ui-loop-play')
    await expect(play).toHaveAttribute('aria-pressed', 'false')
    await play.click()
    await expect(play).toHaveAttribute('aria-pressed', 'true')
    await play.click()
    await expect(play).toHaveAttribute('aria-pressed', 'false')
    await page.locator('#ui-loop-tab-code').click()
    await expect(page.locator('#ui-loop-code-source')).toContainText('createMotionEngine')
  })

  test('compact catalog cannot receive focus while closed', async ({ page }) => {
    const compact = await page.evaluate(() => matchMedia('(max-width: 850px)').matches)
    test.skip(!compact, 'Compact catalog applies to tablet/phone only')
    const sidebar = page.locator('#ui-loop-sidebar')
    const trigger = page.locator('#ui-loop-mobile-catalog')
    await expect(sidebar).toHaveJSProperty('inert', true)
    await trigger.click()
    await expect(sidebar).toHaveJSProperty('inert', false)
    await page.locator('#ui-loop-search').focus()
    await page.keyboard.press('Escape')
    await expect(sidebar).toHaveJSProperty('inert', true)
    await expect(trigger).toBeFocused()
  })

  test('reduce motion leaves the scene static and disables Play', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(page.locator('#ui-loop-play')).toBeDisabled()
    await expect(page.locator('#ui-loop-motion-pref')).toHaveText('Reduziert')
  })
})

test('preset links restore scene and controls without saving private data', async ({ page }) => {
  await page.goto('/motion-studio.html?scene=iris-caustics&density=70&depth=30&speed=20&hue=195')
  await expect(page.locator('#ui-loop-title')).toContainText('Iris')
  await expect(page.locator('#ui-loop-density')).toHaveValue('70')
  await expect(page.locator('#ui-loop-depth')).toHaveValue('30')
  await page.locator('#ui-loop-tab-usage').click()
  await expect(page.locator('#ui-loop-usage-source')).toContainText("scene: 'iris-caustics', density: 70, depth: 30, speed: 20, hue: 195")
})

test('export generates a scene-specific PNG download', async ({ page, browserName }) => {
  if (browserName === 'webkit') {
    await page.locator('#ui-loop-save-image').click()
    await expect(page.locator('#ui-loop-toast')).toContainText('PNG zum Herunterladen vorbereitet')
    return
  }
  const downloadPromise = page.waitForEvent('download')
  await page.locator('#ui-loop-save-image').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('red-loop-spectral-fold.png')
})
