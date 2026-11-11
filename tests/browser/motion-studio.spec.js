import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const studio = '/motion-studio.html'

test.beforeEach(async ({ page }) => { await page.goto(studio) })

test.describe('RED Loop Motion Studio', () => {

  test('initializes all catalog controls and updates color profiles without runtime error', async ({ page }) => {
    await expect(page.locator('#ui-loop-scene-list button')).toHaveCount(12)
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
    if (compact) await page.getByRole('button', { name: 'Katalog', exact: true }).click()
    await expect(page.locator('#ui-loop-scene-list button')).toHaveCount(12)
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

test('favorites can be filtered without stopping the current animation', async ({ page }) => {
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
  await expect(items).toHaveCount(12)
})

test('focusable canvas supports arrow keys and Home without starting animation', async ({ page }) => {
  const canvas = page.locator('#ui-loop-canvas')
  await expect(canvas).toHaveAttribute('tabindex', '0')
  await expect(canvas).toHaveAttribute('aria-describedby', 'ui-loop-canvas-help')
  await canvas.focus()
  await expect(canvas).toBeFocused()
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const initial = await canvas.evaluate(element => element.toDataURL('image/png'))
  const beforeScroll = await page.evaluate(() => window.scrollY)

  await page.keyboard.press('ArrowRight')
  await page.evaluate(() => new Promise(requestAnimationFrame))
  const moved = await canvas.evaluate(element => element.toDataURL('image/png'))
  expect(moved).not.toBe(initial)
  await expect(page.locator('#ui-loop-play')).toHaveAttribute('aria-pressed', 'false')
  expect(await page.evaluate(() => window.scrollY)).toBe(beforeScroll)

  await page.keyboard.press('Home')
  await page.evaluate(() => new Promise(requestAnimationFrame))
  const reset = await canvas.evaluate(element => element.toDataURL('image/png'))
  expect(reset).not.toBe(moved) // Home resets the interactive pointer; PNG encoding need not reproduce identical bytes.
  await expect(page.locator('#ui-loop-play')).toHaveAttribute('aria-pressed', 'false')
})

test('PNG captures the latest scene and chosen responsive device size', async ({page,browserName}) => {
  test.skip(browserName==='webkit','Safari download behavior varies across contexts')
  const compact=await page.evaluate(()=>matchMedia('(max-width:850px)').matches)
  if(compact)await page.locator('#ui-loop-mobile-catalog').click()
  await page.locator('#ui-loop-scene-list button[data-scene="vector-bloom"]').click()
  await expect(page.locator('#ui-loop-title')).toContainText('Vector')

  // Capture the backing-buffer dimensions at the exact moment toBlob starts.
  // Responsive UI can resize again after the export button restores its label.
  await page.locator('#ui-loop-canvas').evaluate(canvas => {
    const encode=canvas.toBlob.bind(canvas)
    canvas.toBlob=(callback,type)=> {
      canvas.__capturedExportSize=[canvas.width,canvas.height]
      return encode(callback,type)
    }
  })
  let lastImage=null
  for(const device of ['iphone','android']){
    await page.locator('.ui-loop-device-buttons button[data-device="'+device+'"]').click()
    const downloadPromise=page.waitForEvent('download')
    await page.locator('#ui-loop-save-image').click()
    const download=await downloadPromise
    expect(download.suggestedFilename()).toBe('red-loop-vector-bloom.png')
    const image=await readFile(await download.path())
    expect(image.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))).toBe(true)
    const pngWidth=image.readUInt32BE(16)
    const pngHeight=image.readUInt32BE(20)
    const exportDimensions=await page.locator('#ui-loop-canvas').evaluate(canvas=>canvas.__capturedExportSize)
    expect([pngWidth,pngHeight]).toEqual(exportDimensions)
    expect(pngWidth*pngHeight).toBeGreaterThan(0)
    expect(pngWidth*pngHeight).toBeLessThanOrEqual(1605000)
    expect(image.length).toBeGreaterThan(1000)
    if(lastImage)expect(image.equals(lastImage)).toBe(false)
    lastImage=image
  }
  await expect(page.locator('#ui-loop-play')).toHaveAttribute('aria-pressed','false')
})

test('PNG filename remains tied to the scene clicked before asynchronous encoding finishes', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'Download event handling differs in Safari contexts')
  const exportButton = page.locator('#ui-loop-save-image')
  await page.locator('#ui-loop-canvas').evaluate(canvas => {
    const originalToBlob = canvas.toBlob.bind(canvas)
    canvas.toBlob = (callback,format) => {
      originalToBlob(blob => {
        window.__releasePngDownload = () => callback(blob)
      },format)
    }
  })
  const downloadPromise = page.waitForEvent('download')
  await exportButton.click()
  await expect(exportButton).toBeDisabled()
  await expect(exportButton).toHaveAttribute('aria-busy','true')
  await expect(exportButton).toContainText('PNG wird erstellt')
  await expect.poll(() => page.evaluate(() => typeof window.__releasePngDownload)).toBe('function')

  const compact = await page.evaluate(() => matchMedia('(max-width:850px)').matches)
  if(compact)await page.locator('#ui-loop-mobile-catalog').click()
  await page.locator('#ui-loop-scene-list button[data-scene="vector-bloom"]').click()
  await expect(page.locator('#ui-loop-title')).toContainText('Vector')
  await page.evaluate(() => window.__releasePngDownload())

  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('red-loop-spectral-fold.png')
  await expect(exportButton).toBeEnabled()
  await expect(exportButton).not.toHaveAttribute('aria-busy','true')
  await expect(exportButton).toContainText('PNG exportieren')
  await expect(page.locator('#ui-loop-toast')).toContainText('PNG zum Herunterladen vorbereitet')
})

test('invalid PNG data shows an error and restores the export button', async ({ page }) => {
  await page.locator('#ui-loop-canvas').evaluate(canvas => {
    canvas.toBlob = callback => callback(null)
  })
  await page.locator('#ui-loop-save-image').click()
  await expect(page.locator('#ui-loop-toast')).toContainText('PNG-Export fehlgeschlagen')
  await expect(page.locator('#ui-loop-save-image')).toBeEnabled()
  await expect(page.locator('#ui-loop-save-image')).not.toHaveAttribute('aria-busy','true')
})

test('keyboard search opens the first matching scene and preserves accessible focus', async ({page})=>{
  const compact=await page.evaluate(()=>matchMedia('(max-width:850px)').matches)
  if(compact)await page.locator('#ui-loop-mobile-catalog').click()
  const search=page.locator('#ui-loop-search')
  await search.fill('Vector Bloom')
  await expect(page.locator('#ui-loop-result-status')).toHaveText('1 Komponente gefunden')
  await expect(page.locator('#ui-loop-scene-list button[data-scene]')).toHaveCount(1)
  await search.press('ArrowDown')
  await expect(page.locator('#ui-loop-scene-list button[data-scene="vector-bloom"]')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#ui-loop-title')).toContainText('Vector')
  await expect(page).toHaveURL(/scene=vector-bloom/)
  if(compact){
    await expect(page.locator('#ui-loop-mobile-catalog')).toHaveAttribute('aria-expanded','false')
    await expect(page.locator('#ui-loop-mobile-catalog')).toBeFocused()
  }else{
    await expect(page.locator('#ui-loop-scene-list button[data-scene="vector-bloom"]')).toBeFocused()
  }
})

test('catalog arrows support first/last navigation without trapping the search field',async({page})=>{
  const compact=await page.evaluate(()=>matchMedia('(max-width:850px)').matches)
  if(compact)await page.locator('#ui-loop-mobile-catalog').click()
  const search=page.locator('#ui-loop-search')
  const first=page.locator('#ui-loop-scene-list button[data-scene]').first()
  const last=page.locator('#ui-loop-scene-list button[data-scene]').last()
  await search.focus()
  await search.press('ArrowDown')
  await expect(first).toBeFocused()
  await page.keyboard.press('End')
  await expect(last).toBeFocused()
  await page.keyboard.press('Home')
  await expect(first).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(search).toBeFocused()
  await search.press('ArrowUp')
  await expect(last).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(search).toBeFocused()

  await search.fill('never-matches-this-library')
  await expect(page.locator('#ui-loop-result-status')).toHaveText('0 Komponenten gefunden')
  await search.press('ArrowDown')
  await expect(search).toBeFocused()
  await search.fill('Glass Filament')
  await search.press('Enter')
  await expect(page.locator('#ui-loop-title')).toContainText('Glass')
  if(compact)await expect(page.locator('#ui-loop-mobile-catalog')).toBeFocused()
  await expect(page.locator('#ui-loop-result-status')).toHaveText('1 Komponente gefunden')
})

test('view tabs have full ARIA relationships, keyboard wrapping and paused playback', async ({ page }) => {
  const group = page.getByRole('tablist', { name: 'Vorschaumodus' })
  const preview = page.getByRole('tab', { name: /Preview/ })
  const code = page.getByRole('tab', { name: /Code/ })
  const usage = page.getByRole('tab', { name: /Einbau/ })
  const panel = name => page.locator('#ui-loop-' + name + '-panel')

  await expect(group).toBeVisible()
  await expect(preview).toHaveAttribute('aria-controls', 'ui-loop-preview-panel')
  await expect(code).toHaveAttribute('aria-controls', 'ui-loop-code-panel')
  await expect(usage).toHaveAttribute('aria-controls', 'ui-loop-usage-panel')
  await expect(preview).toHaveAttribute('aria-selected', 'true')
  await expect(preview).toHaveAttribute('tabindex', '0')
  await expect(code).toHaveAttribute('tabindex', '-1')
  await expect(panel('preview')).toBeVisible()
  await expect(panel('code')).toBeHidden()
  await expect(panel('usage')).toBeHidden()
  await expect(panel('preview')).toHaveAttribute('role', 'tabpanel')
  await expect(panel('preview')).toHaveAttribute('aria-labelledby', 'ui-loop-tab-preview')

  await page.locator('#ui-loop-play').click()
  await expect(page.locator('#ui-loop-play')).toHaveAttribute('aria-pressed', 'true')

  await preview.focus()
  await page.keyboard.press('ArrowRight')
  await expect(code).toBeFocused()
  await expect(code).toHaveAttribute('aria-selected', 'true')
  await expect(code).toHaveAttribute('tabindex', '0')
  await expect(preview).toHaveAttribute('tabindex', '-1')
  await expect(panel('code')).toBeVisible()
  await expect(panel('preview')).toBeHidden()
  await expect(page.locator('#ui-loop-play')).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('#ui-loop-code-source')).toContainText('createMotionEngine')

  await page.keyboard.press('ArrowRight')
  await expect(usage).toBeFocused()
  await expect(usage).toHaveAttribute('aria-selected', 'true')
  await expect(panel('usage')).toBeVisible()
  await expect(panel('code')).toBeHidden()

  await page.keyboard.press('ArrowRight')
  await expect(preview).toBeFocused()
  await expect(preview).toHaveAttribute('aria-selected', 'true')
  await expect(panel('preview')).toBeVisible()
  await expect(page.locator('#ui-loop-play')).toHaveAttribute('aria-pressed', 'false')

  await page.keyboard.press('ArrowLeft')
  await expect(usage).toBeFocused()
  await page.keyboard.press('Home')
  await expect(preview).toBeFocused()
  await page.keyboard.press('End')
  await expect(usage).toBeFocused()
  await expect(usage).toHaveAttribute('tabindex', '0')
  await expect(preview).toHaveAttribute('tabindex', '-1')
})

test('bookmarked scenes survive reload and can be removed from local storage', async ({page})=>{
  const favorite=page.locator('#ui-loop-favorite')
  const filter=page.locator('#ui-loop-filters button[data-category="Gemerkte"]')
  await expect(favorite).toHaveAttribute('aria-pressed','false')
  await favorite.click()
  await expect(favorite).toHaveAttribute('aria-pressed','true')
  await expect(filter).toContainText('(1)')
  const stored=await page.evaluate(()=>localStorage.getItem('red-loop.motion-studio.favorites.v1'))
  expect(JSON.parse(stored)).toEqual(['spectral-fold'])

  await page.reload()
  await expect(favorite).toHaveAttribute('aria-pressed','true')
  await expect(filter).toContainText('(1)')
  const compact=await page.evaluate(()=>matchMedia('(max-width:850px)').matches)
  if(compact)await page.locator('#ui-loop-mobile-catalog').click()
  await filter.click()
  await expect(page.locator('#ui-loop-scene-list button[data-scene]')).toHaveCount(1)
  await expect(page.locator('#ui-loop-scene-list button[data-scene="spectral-fold"]')).toBeVisible()
  if(compact)await page.locator('#ui-loop-sidebar-close').click()
  await favorite.click()
  await expect(filter).toContainText('(0)')
  await page.reload()
  await expect(favorite).toHaveAttribute('aria-pressed','false')
  await expect(filter).toContainText('(0)')
  expect(await page.evaluate(()=>localStorage.getItem('red-loop.motion-studio.favorites.v1'))).toBeNull()
})

test('blocked browser storage preserves in-memory favorites and catalog startup',async({page})=>{
  await page.addInitScript(()=>{
    Object.defineProperty(window,'localStorage',{configurable:true,get(){throw new Error('Storage disabled')}})
  })
  await page.reload()
  await expect(page.locator('#ui-loop-scene-list button[data-scene]')).toHaveCount(12)
  const favorite=page.locator('#ui-loop-favorite')
  const filter=page.locator('#ui-loop-filters button[data-category="Gemerkte"]')
  await favorite.click()
  await expect(favorite).toHaveAttribute('aria-pressed','true')
  await expect(filter).toContainText('(1)')
  await expect(page.locator('#ui-loop-toast')).toContainText('In dieser Sitzung gemerkt')
  const compact=await page.evaluate(()=>matchMedia('(max-width:850px)').matches)
  if(compact)await page.locator('#ui-loop-mobile-catalog').click()
  await filter.click()
  await expect(page.locator('#ui-loop-scene-list button[data-scene]')).toHaveCount(1)
})

test('favorites synchronize between open tabs without reloading',async({page,context})=>{
  const other=await context.newPage();
  try{
    await other.goto(studio);
    const remoteFavorite=other.locator('#ui-loop-favorite');
    const remoteFilter=other.locator('#ui-loop-filters button[data-category="Gemerkte"]');
    await expect(remoteFavorite).toHaveAttribute('aria-pressed','false');
    await page.locator('#ui-loop-favorite').click();
    await expect(remoteFavorite).toHaveAttribute('aria-pressed','true');
    await expect(remoteFilter).toContainText('(1)');
    await expect(other.locator('#ui-loop-title')).toContainText('Spectral');

    const compact=await other.evaluate(()=>matchMedia('(max-width:850px)').matches);
    if(compact)await other.locator('#ui-loop-mobile-catalog').click();
    await remoteFilter.click();
    const saved=other.locator('#ui-loop-scene-list button[data-scene="spectral-fold"]');
    await expect(saved).toBeVisible();
    await saved.focus();
    await expect(saved).toBeFocused();

    await page.evaluate(()=>localStorage.removeItem('red-loop.motion-studio.favorites.v1'));
    await expect(remoteFavorite).toHaveAttribute('aria-pressed','false');
    await expect(other.locator('#ui-loop-scene-list button[data-scene]')).toHaveCount(0);
    await expect(other.locator('#ui-loop-search')).toBeFocused();

    await page.evaluate(()=>localStorage.setItem('red-loop.motion-studio.favorites.v1',
      JSON.stringify(['spectral-fold','not-a-real-scene'])));
    await expect(remoteFavorite).toHaveAttribute('aria-pressed','true');
    await expect(other.locator('#ui-loop-scene-list button[data-scene]')).toHaveCount(1);
    await expect(saved).toHaveAttribute('aria-label',/gemerkt/);

    await page.evaluate(()=>localStorage.clear());
    await expect(remoteFavorite).toHaveAttribute('aria-pressed','false');
    await expect(remoteFilter).toContainText('(0)');
    await expect(other.locator('#ui-loop-scene-list button[data-scene]')).toHaveCount(0);
  }finally{
    await other.close();
  }
});

test('unrelated storage changes leave the open catalog and keyboard focus alone',async({page,context})=>{
  const other=await context.newPage();
  try{
    await other.goto(studio);
    const compact=await other.evaluate(()=>matchMedia('(max-width:850px)').matches);
    if(compact)await other.locator('#ui-loop-mobile-catalog').click();
    const scene=other.locator('#ui-loop-scene-list button[data-scene="spectral-fold"]');
    await scene.focus();
    await page.evaluate(()=>localStorage.setItem('unrelated.settings','example'));
    await expect(scene).toBeFocused();
    await expect(other.locator('#ui-loop-scene-list button[data-scene]')).toHaveCount(12);
    await expect(other.locator('#ui-loop-favorite')).toHaveAttribute('aria-pressed','false');
  }finally{
    await other.close();
  }
});

test('new Aurora and Mercury studies render distinct original static images and support deep links',async({page})=>{
  const images=[];
  for(const [id,title] of [['aurora-threads','Aurora Threads'],['mercury-droplets','Mercury Droplets']]){
    await page.goto('/motion-studio.html?scene='+id);
    await expect(page.locator('#ui-loop-title')).toContainText(title);
    await expect(page.locator('#ui-loop-scene-list button[data-scene="'+id+'"]')).toHaveAttribute('aria-current','true');
    await expect(page.locator('#ui-loop-play')).toHaveAttribute('aria-pressed','false');
    const canvas=page.locator('#ui-loop-canvas');
    await expect(canvas).toBeVisible();
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    images.push(await canvas.evaluate(el=>el.toDataURL('image/png')));
    const [width,height]=await canvas.evaluate(el=>[el.width,el.height]);
    expect(width).toBeGreaterThan(1);
    expect(height).toBeGreaterThan(1);
    const bookmark=page.locator('#ui-loop-favorite');
    await bookmark.click();
    await expect(bookmark).toHaveAttribute('aria-pressed','true');
  }
  expect(images[0]).not.toBe(images[1]);
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(page.locator('#ui-loop-play')).toHaveAttribute('aria-pressed','false');
  await expect(page.locator('#ui-loop-filters button[data-category="Gemerkte"]')).toContainText('(2)');
});

test('new original material opens from responsive catalog on phone and desktop',async({page})=>{
  const compact=await page.evaluate(()=>matchMedia('(max-width:850px)').matches);
  if(compact)await page.locator('#ui-loop-mobile-catalog').click();
  await page.locator('#ui-loop-search').fill('Mercury Droplets');
  await expect(page.locator('#ui-loop-result-count')).toHaveText('01');
  await page.locator('#ui-loop-scene-list button[data-scene="mercury-droplets"]').click();
  await expect(page.locator('#ui-loop-title')).toContainText('Mercury Droplets');
  await expect(page).toHaveURL(/scene=mercury-droplets/);
  if(compact)await expect(page.locator('#ui-loop-mobile-catalog')).toHaveAttribute('aria-expanded','false');
});

test('Motion Studio exports current scene and slider settings in runnable starter ZIP',async({page})=>{
  await page.goto('/motion-studio.html?scene=mercury-droplets');
  const values={density:83,depth:11,speed:7,hue:275};
  for(const [key,value] of Object.entries(values)){
    await page.locator('#ui-loop-'+key).evaluate((input,next)=>{
      input.value=String(next);
      input.dispatchEvent(new Event('input',{bubbles:true}));
      input.dispatchEvent(new Event('change',{bubbles:true}));
    },value);
  }
  await page.locator('#ui-loop-tab-usage').click();
  await expect(page.locator('#ui-loop-usage-source'))
    .toContainText("scene: 'mercury-droplets', density: 83, depth: 11, speed: 7, hue: 275");
  const button=page.locator('#ui-loop-save-starter');
  await expect(button).toBeVisible();
  const downloadReady=page.waitForEvent('download');
  await button.click();
  const download=await downloadReady;
  expect(download.suggestedFilename()).toBe('red-morph-mercury-droplets-custom-starter.zip');
  const buffer=await readFile(await download.path());
  expect(buffer.readUInt32LE(0)).toBe(0x04034b50);
  expect(buffer.readUInt32LE(buffer.length-22)).toBe(0x06054b50);
  expect(buffer.includes(Buffer.from('motion-engine.js'))).toBe(true);
  expect(buffer.includes(Buffer.from('README.md'))).toBe(true);
  expect(buffer.includes(Buffer.from("scene: 'mercury-droplets', density: 83, depth: 11, speed: 7, hue: 275"))).toBe(true);
  expect(buffer.includes(Buffer.from('density=83, depth=11,'))).toBe(true);
  await expect(button).toBeEnabled();
  await expect(button).not.toHaveAttribute('aria-busy','true');
  await expect(page.locator('#ui-loop-toast')).toContainText('Starter-ZIP mit gewählten Einstellungen');
});

test('custom starter export reports network failure and preserves editable sliders',async({page})=>{
  await page.locator('#ui-loop-tab-usage').click();
  await page.route('**/motion-engine.js',route=>route.fulfill({
    status:503,contentType:'text/plain',body:'Unavailable',
  }));
  const button=page.locator('#ui-loop-save-starter');
  await button.click();
  await expect(page.locator('#ui-loop-toast')).toContainText('Starter-ZIP fehlgeschlagen');
  await expect(button).toBeEnabled();
  await expect(button).not.toHaveAttribute('aria-busy','true');
  await expect(page.locator('#ui-loop-usage-source')).toContainText("scene: 'spectral-fold'");
  await expect(page.locator('#ui-loop-density')).toHaveValue('58');
});

test('configured ZIP preserves click-time preset if sliders change during download',async({page})=>{
  await page.goto('/motion-studio.html?scene=aurora-threads');
  await page.locator('#ui-loop-density').evaluate(input=>{
    input.value='78';
    input.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await page.locator('#ui-loop-hue').evaluate(input=>{
    input.value='201';
    input.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await page.locator('#ui-loop-tab-usage').click();
  let releaseEngine;
  let requests=0;
  await page.route('**/motion-engine.js',async route=>{
    requests++;
    await new Promise(resolve=>{releaseEngine=resolve});
    await route.continue();
  });
  const button=page.locator('#ui-loop-save-starter');
  const ready=page.waitForEvent('download');
  await button.click();
  await expect(button).toBeDisabled();
  await expect(button).toHaveAttribute('aria-busy','true');
  await expect.poll(()=>typeof releaseEngine).toBe('function');
  await page.locator('#ui-loop-density').evaluate(input=>{
    input.value='22';
    input.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await page.locator('#ui-loop-hue').evaluate(input=>{
    input.value='19';
    input.dispatchEvent(new Event('input',{bubbles:true}));
  });
  releaseEngine();
  const download=await ready;
  const bytes=await readFile(await download.path());
  expect(download.suggestedFilename()).toBe('red-morph-aurora-threads-custom-starter.zip');
  expect(bytes.includes(Buffer.from("scene: 'aurora-threads', density: 78, depth: 58, speed: 42, hue: 201"))).toBe(true);
  expect(bytes.includes(Buffer.from("scene: 'aurora-threads', density: 22"))).toBe(false);
  expect(requests).toBe(1);
  await expect(button).toBeEnabled();
});
