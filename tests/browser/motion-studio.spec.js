import { test, expect } from '@playwright/test'

const studio = '/motion-studio.html'

test.beforeEach(async ({ page }) => { await page.goto(studio) })

test.describe('RED Loop Motion Studio', () => {

  test('initializes all catalog controls and updates color profiles without runtime error', async ({ page }) => {
    await expect(page.locator('#ui-loop-scene-list button')).toHaveCount(10)
    await expect(page.locator('#ui-loop-usage-source')).toContainText('spectral-fold')
    await expect(page.locator('.ui-loop-swatches button[data-hue="340"]')).toHaveAttribute('aria-pressed', 'true')
    await page.locator('#ui-loop-hue').evaluate(input => {
      input.value = '255'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await expect(page.locator('.ui-loop-swatches button[data-hue="255"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('#ui-loop-usage-source')).toContainText('hue: 255')
    await expect(page).toHaveURL(/hue=255/)
  })

  test('catalog search, scene switching and settings remain functional', async ({ page }) => {
    const compact = await page.evaluate(() => matchMedia('(max-width: 850px)').matches)
    if (compact) await page.getByRole('button', { name: 'Katalog' }).click()
    await expect(page.locator('#ui-loop-scene-list button')).toHaveCount(10)
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

test('five device preview controls remain usable without horizontal page overflow',async({page})=>{
  for(const device of ['macbook','windows','tablet','iphone','android']){
    const button=page.locator('.ui-loop-device-buttons button[data-device="'+device+'"]')
    await button.click()
    await expect(button).toHaveAttribute('aria-pressed','true')
    await expect(page.locator('#ui-loop-stage')).toHaveAttribute('data-device',device)
    const dimensions=await page.evaluate(()=>({
      width:document.documentElement.scrollWidth,viewport:window.innerWidth,
      canvas:document.querySelector('#ui-loop-canvas').width
    }))
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport+1)
    expect(dimensions.canvas).toBeGreaterThan(0)
  }
})
test('new Prism Veil and Vector Bloom scenes are selectable and render',async({page})=>{
  for(const id of ['prism-veil','vector-bloom']){
    const mobile=await page.evaluate(()=>matchMedia('(max-width:850px)').matches)
    if(mobile)await page.locator('#ui-loop-mobile-catalog').click()
    await page.locator('#ui-loop-scene-list button[data-scene="'+id+'"]').click()
    await expect(page).toHaveURL(new RegExp('scene='+id))
    const width=await page.locator('#ui-loop-canvas').evaluate(el=>el.width)
    expect(width).toBeGreaterThan(0)
  }
})

test('copied preset URLs exclude unrelated query values and fragments', async ({ page }) => {
  await page.goto('/motion-studio.html?scene=iris-caustics&density=70&token=private-value&state=opaque#sensitive-fragment')
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async text => { window.__copiedMotionLink = text } },
    })
  })
  await page.locator('#ui-loop-copy-link').click()
  const copied = await page.evaluate(() => window.__copiedMotionLink)
  const parsed = new URL(copied)
  expect(parsed.origin).toBe(new URL(page.url()).origin)
  expect(parsed.pathname).toBe('/motion-studio.html')
  expect(parsed.hash).toBe('')
  expect([...parsed.searchParams.keys()]).toEqual(['scene', 'density', 'depth', 'speed', 'hue'])
  expect(parsed.searchParams.get('scene')).toBe('iris-caustics')
  expect(parsed.searchParams.get('density')).toBe('70')
  expect(copied).not.toContain('private-value')
  expect(copied).not.toContain('sensitive-fragment')
  expect(copied).not.toContain('state=')
})

test('compact catalog traps focus, blocks the page and can be dismissed',async({page})=>{
  const compact=await page.evaluate(()=>matchMedia('(max-width:850px)').matches)
  test.skip(!compact,'Modal catalog is only used on tablet/phone')
  const trigger=page.locator('#ui-loop-mobile-catalog')
  const sidebar=page.locator('#ui-loop-sidebar')
  const backdrop=page.locator('#ui-loop-backdrop')
  await trigger.click()
  await expect(sidebar).toHaveAttribute('role','dialog')
  await expect(sidebar).toHaveAttribute('aria-modal','true')
  await expect(page.locator('#ui-loop-search')).toBeFocused()
  await expect(backdrop).toBeVisible()
  await expect(page.locator('.ui-loop-main')).toHaveJSProperty('inert',true)
  await expect(page.locator('.ui-loop-topbar')).toHaveJSProperty('inert',true)
  await sidebar.locator('.ui-loop-sidebar-bottom a').focus()
  await page.keyboard.press('Tab')
  await expect(page.locator('#ui-loop-sidebar-close')).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(sidebar.locator('.ui-loop-sidebar-bottom a')).toBeFocused()
  await page.locator('#ui-loop-sidebar-close').click()
  await expect(sidebar).toHaveJSProperty('inert',true)
  await expect(sidebar).not.toHaveAttribute('role','dialog')
  await expect(backdrop).toBeHidden()
  await expect(page.locator('.ui-loop-main')).toHaveJSProperty('inert',false)
  await expect(page.locator('.ui-loop-topbar')).toHaveJSProperty('inert',false)
  await expect(trigger).toBeFocused()
})

test('compact catalog backdrop closes on outside pointer tap',async({page})=>{
  const compact=await page.evaluate(()=>matchMedia('(max-width:850px)').matches)
  test.skip(!compact,'Outside-tap dismissal applies to tablet/phone')
  await page.locator('#ui-loop-mobile-catalog').click()
  await expect(page.locator('#ui-loop-backdrop')).toBeVisible()
  const size=page.viewportSize()
  await page.mouse.click(size.width-5,120)
  await expect(page.locator('#ui-loop-mobile-catalog')).toHaveAttribute('aria-expanded','false')
  await expect(page.locator('#ui-loop-backdrop')).toBeHidden()
})

test('session favorites can be filtered without stopping the current animation', async ({ page }) => {
  const play = page.locator('#ui-loop-play')
  const favorite = page.locator('#ui-loop-favorite')
  const filter = page.locator('#ui-loop-filters button[data-category="Gemerkte"]')
  const items = page.locator('#ui-loop-scene-list button')
  const compact = await page.evaluate(() => matchMedia('(max-width:850px)').matches)

  await expect(filter).toContainText('0')
  await play.click()
  await expect(play).toHaveAttribute('aria-pressed','true')
  await favorite.click()
  await expect(play).toHaveAttribute('aria-pressed','true')
  await expect(favorite).toHaveAttribute('aria-pressed','true')
  await expect(filter).toContainText('1')

  if (compact) await page.locator('#ui-loop-mobile-catalog').click()
  await filter.click()
  await expect(filter).toHaveAttribute('aria-pressed','true')
  await expect(items).toHaveCount(1)
  await expect(items.first()).toHaveAttribute('data-scene','spectral-fold')
  await expect(items.first().locator('.ui-loop-scene-favorite-marker')).toBeVisible()
  await expect(items.first()).toHaveAttribute('aria-label',/gemerkt/)

  if (compact) await page.locator('#ui-loop-sidebar-close').click()
  await favorite.click()
  await expect(play).toHaveAttribute('aria-pressed','true')
  await expect(favorite).toHaveAttribute('aria-pressed','false')

  if (compact) await page.locator('#ui-loop-mobile-catalog').click()
  await expect(items).toHaveCount(0)
  await expect(page.locator('.ui-loop-no-results')).toContainText('Noch nichts gemerkt')
  await expect(filter).toContainText('0')
  await page.locator('#ui-loop-filters button[data-category="Alle"]').click()
  await expect(items).toHaveCount(10)
})
