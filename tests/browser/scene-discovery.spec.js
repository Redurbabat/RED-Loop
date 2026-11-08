import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{await page.goto('/');});

test('dashboard finds original motion components by text and category and opens the selected scene',async({page})=>{
  const grid=page.locator('#scene-discovery-results');
  await expect(grid.locator('a[data-scene]')).toHaveCount(12);
  await expect(page.locator('#scene-discovery-count')).toHaveText('12 Komponenten gefunden');
  const material=page.locator('#scene-discovery-filters button[data-category="Material"]');
  await material.click();
  await expect(material).toHaveAttribute('aria-pressed','true');
  await expect(grid.locator('a[data-scene]')).toHaveCount(4);
  await page.locator('#scene-discovery-search').fill('Prism');
  await expect(grid.locator('a[data-scene]')).toHaveCount(1);
  const result=grid.locator('a[data-scene="prism-veil"]');
  await expect(result).toHaveAttribute('href','/motion-studio.html?scene=prism-veil');
  await result.click();
  await expect(page).toHaveURL(/motion-studio.html\?scene=prism-veil/);
  await expect(page.locator('#ui-loop-title')).toContainText('Prism');
});

test('homepage discovery supports direct keyboard search and clear empty results',async({page})=>{
  const search=page.locator('#scene-discovery-search');
  const grid=page.locator('#scene-discovery-results');
  await search.fill('Glass Filament');
  await expect(page.locator('#scene-discovery-count')).toHaveText('1 Komponente gefunden');
  await search.press('ArrowDown');
  await expect(grid.locator('a[data-scene="glass-filament"]')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(search).toBeFocused();

  await search.fill('not-a-real-material');
  await expect(grid.locator('a[data-scene]')).toHaveCount(0);
  await expect(page.locator('#scene-discovery-empty')).toBeVisible();
  await expect(page.locator('#scene-discovery-count')).toHaveText('0 Komponenten gefunden');
  await page.locator('#scene-discovery-reset').click();
  await expect(grid.locator('a[data-scene]')).toHaveCount(12);
  await expect(search).toBeFocused();

  await search.fill('Iris Caustics');
  await search.press('Enter');
  await expect(page).toHaveURL(/motion-studio.html\?scene=iris-caustics/);
  await expect(page.locator('#ui-loop-title')).toContainText('Iris');
});

test('saved motion favorites are visible directly from the home dashboard',async({page})=>{
  await page.goto('/motion-studio.html?scene=vector-bloom');
  await page.locator('#ui-loop-favorite').click();
  await expect(page.locator('#ui-loop-favorite')).toHaveAttribute('aria-pressed','true');
  await page.goto('/');
  const grid=page.locator('#scene-discovery-results');
  await expect(grid.locator('a[data-scene]').first()).toHaveAttribute('data-scene','vector-bloom');
  const saved=page.locator('#scene-discovery-filters button[data-category="Gemerkte"]');
  await expect(saved).toContainText('(1)');
  await saved.click();
  await expect(grid.locator('a[data-scene]')).toHaveCount(1);
  await grid.locator('a[data-scene="vector-bloom"]').click();
  await expect(page.locator('#ui-loop-title')).toContainText('Vector');
});

test('other-tab bookmark changes update the homepage finder without reload',async({page,context})=>{
  const other=await context.newPage();
  try{
    await other.goto('/motion-studio.html?scene=iris-caustics');
    await other.locator('#ui-loop-favorite').click();
    const saved=page.locator('#scene-discovery-filters button[data-category="Gemerkte"]');
    await expect(saved).toContainText('(1)');
    await saved.click();
    await expect(page.locator('#scene-discovery-results a[data-scene="iris-caustics"]')).toBeVisible();
    await other.locator('#ui-loop-favorite').click();
    await expect(saved).toContainText('(0)');
    await expect(page.locator('#scene-discovery-empty')).toBeVisible();
  }finally{await other.close();}
});

test('discovery cards fit phone, tablet and desktop preview widths',async({page})=>{
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:850});
    await expect(page.locator('#scene-discovery')).toBeVisible();
    const grid=page.locator('#scene-discovery-results');
    await expect(grid.locator('a[data-scene]')).toHaveCount(12);
    const withinViewport=await page.locator('#scene-discovery').evaluate(el=>{
      const rect=el.getBoundingClientRect();
      return rect.left>=-1&&rect.right<=window.innerWidth+1;
    });
    expect(withinViewport).toBe(true);
  }
});

test('lazy static thumbnails reveal the original scene without auto-playing',async({page})=>{
  const first=page.locator('#scene-discovery-results a[data-scene="spectral-fold"] canvas');
  await first.scrollIntoViewIfNeeded();
  await expect(first).toHaveAttribute('data-preview-ready','true');
  const initial=await first.evaluate(canvas=>canvas.toDataURL('image/png'));
  const dims=await first.evaluate(canvas=>[canvas.width,canvas.height]);
  expect(dims[0]).toBeGreaterThan(1);
  expect(dims[1]).toBeGreaterThan(1);
  await page.waitForTimeout(350);
  expect(await first.evaluate(canvas=>canvas.toDataURL('image/png'))).toBe(initial);

  const second=page.locator('#scene-discovery-results a[data-scene="vector-bloom"] canvas');
  await second.scrollIntoViewIfNeeded();
  await expect(second).toHaveAttribute('data-preview-ready','true');
  expect(await second.evaluate(canvas=>canvas.toDataURL('image/png'))).not.toBe(initial);
  await expect(page.locator('#scene-discovery-results canvas[data-scene]')).toHaveCount(12);
});

test('filtering cleans up thumbnail observers and creates previews for newly visible matches',async({page})=>{
  const search=page.locator('#scene-discovery-search');
  const first=page.locator('#scene-discovery-results a[data-scene="spectral-fold"] canvas');
  await first.scrollIntoViewIfNeeded();
  await expect(first).toHaveAttribute('data-preview-ready','true');

  await search.fill('Glass Filament');
  const match=page.locator('#scene-discovery-results a[data-scene="glass-filament"]');
  await expect(page.locator('#scene-discovery-results a[data-scene]')).toHaveCount(1);
  await match.scrollIntoViewIfNeeded();
  await expect(match.locator('canvas')).toHaveAttribute('data-preview-ready','true');
  await expect(match.locator('canvas')).toHaveAttribute('aria-hidden','true');
  const [pixelWidth,pixelHeight]=await match.locator('canvas').evaluate(canvas=>[canvas.width,canvas.height]);
  expect(pixelWidth).toBeGreaterThan(1);
  expect(pixelHeight).toBeGreaterThan(1);

  await page.emulateMedia({reducedMotion:'reduce'});
  await search.fill('Iris Caustics');
  const iris=page.locator('#scene-discovery-results a[data-scene="iris-caustics"] canvas');
  await iris.scrollIntoViewIfNeeded();
  await expect(iris).toHaveAttribute('data-preview-ready','true');
});

test('homepage can bookmark an effect directly without leaving the dashboard',async({page})=>{
  const scene='vector-bloom';
  const bookmark=page.locator('#scene-discovery-results button[data-bookmark="'+scene+'"]');
  const finder=page.locator('#scene-discovery-results');
  const start=page.url();
  await expect(bookmark).toHaveAttribute('aria-pressed','false');
  await bookmark.click();
  expect(page.url()).toBe(start);
  await expect(bookmark).toHaveAttribute('aria-pressed','true');
  await expect(bookmark).toHaveAttribute('aria-label',/aus Favoriten entfernen/);
  await expect(page.locator('#scene-discovery-feedback')).toContainText('lokal gemerkt');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('red-loop.motion-studio.favorites.v1'))))
    .toEqual([scene]);
  await expect(finder.locator('a[data-scene]').first()).toHaveAttribute('data-scene',scene);
  await expect(bookmark).toBeFocused();
  await expect(finder.locator('a[data-scene="'+scene+'"]')).toHaveAttribute('href',
    '/motion-studio.html?scene=vector-bloom');

  const saved=page.locator('#scene-discovery-filters button[data-category="Gemerkte"]');
  await saved.click();
  await expect(finder.locator('a[data-scene]')).toHaveCount(1);
  await bookmark.click();
  await expect(finder.locator('a[data-scene]')).toHaveCount(0);
  await expect(page.locator('#scene-discovery-search')).toBeFocused();
  expect(await page.evaluate(()=>localStorage.getItem('red-loop.motion-studio.favorites.v1'))).toBeNull();
  expect(page.url()).toBe(start);
});

test('a homepage bookmark immediately synchronizes to the open Motion Studio tab',async({page,context})=>{
  const other=await context.newPage();
  try{
    await other.goto('/motion-studio.html?scene=iris-caustics');
    const studioFavorite=other.locator('#ui-loop-favorite');
    await expect(studioFavorite).toHaveAttribute('aria-pressed','false');
    const homepageFavorite=page.locator('#scene-discovery-results button[data-bookmark="iris-caustics"]');
    await homepageFavorite.click();
    await expect(studioFavorite).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('#scene-discovery-filters button[data-category="Gemerkte"]')).toContainText('(1)');
    await studioFavorite.click();
    await expect(homepageFavorite).toHaveAttribute('aria-pressed','false');
    await expect(page.locator('#scene-discovery-feedback')).toContainText('lokal gemerkt');
  }finally{await other.close();}
});

test('homepage bookmarking works in a browser that denies localStorage access',async({page})=>{
  await page.addInitScript(()=>{
    Object.defineProperty(window,'localStorage',{configurable:true,get(){throw Error('Storage denied')}});
  });
  await page.reload();
  const bookmark=page.locator('#scene-discovery-results button[data-bookmark="spectral-fold"]');
  await bookmark.click();
  await expect(bookmark).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#scene-discovery-feedback')).toContainText('in dieser Sitzung gemerkt');
  await page.locator('#scene-discovery-filters button[data-category="Gemerkte"]').click();
  await expect(page.locator('#scene-discovery-results a[data-scene]')).toHaveCount(1);
});

test('new original Aurora and Mercury studies appear as responsive homepage thumbnails',async({page})=>{
  const grid=page.locator('#scene-discovery-results');
  await expect(grid.locator('a[data-scene]')).toHaveCount(12);
  for(const id of ['aurora-threads','mercury-droplets']){
    const link=grid.locator('a[data-scene="'+id+'"]');
    await expect(link).toHaveAttribute('href','/motion-studio.html?scene='+id);
    const thumb=link.locator('canvas[data-scene="'+id+'"]');
    await link.scrollIntoViewIfNeeded();
    await expect(thumb).toHaveAttribute('data-preview-ready','true');
    const pixels=await thumb.evaluate(canvas=>[canvas.width,canvas.height]);
    expect(pixels[0]).toBeGreaterThan(1);
    expect(pixels[1]).toBeGreaterThan(1);
  }
  await page.locator('#scene-discovery-search').fill('Aurora Threads');
  await expect(grid.locator('a[data-scene]')).toHaveCount(1);
  await expect(grid.locator('a[data-scene="aurora-threads"]')).toBeVisible();
  await page.locator('#scene-discovery-search').fill('');
  await page.locator('#scene-discovery-filters button[data-category="Material"]').click();
  await expect(grid.locator('a[data-scene]')).toHaveCount(4);
  await expect(grid.locator('a[data-scene="mercury-droplets"]')).toBeVisible();
});

test('two original studies compare side by side with independent static previews',async({page})=>{
  const aurora=page.locator('#scene-discovery-results button[data-compare="aurora-threads"]');
  const mercury=page.locator('#scene-discovery-results button[data-compare="mercury-droplets"]');
  const comparison=page.locator('#scene-discovery-comparison');
  const items=page.locator('#scene-discovery-comparison-items');
  await expect(comparison).toBeHidden();
  const initialGallery=page.locator('#scene-discovery-results a[data-scene="spectral-fold"] canvas');
  await aurora.focus();
  await aurora.click();
  await expect(aurora).toBeFocused();
  await expect(aurora).toHaveAttribute('aria-pressed','true');
  await expect(comparison).toBeVisible();
  await expect(items.locator('canvas[data-scene]')).toHaveCount(1);
  await expect(page.locator('.scene-comparison-placeholder')).toBeVisible();
  await mercury.click();
  await expect(items.locator('canvas[data-scene]')).toHaveCount(2);
  await expect(page.locator('#scene-discovery-comparison-count')).toHaveText('2 / 2');
  const first=items.locator('canvas[data-scene="aurora-threads"]');
  const second=items.locator('canvas[data-scene="mercury-droplets"]');
  await comparison.scrollIntoViewIfNeeded();
  await expect(first).toHaveAttribute('data-preview-ready','true');
  await expect(second).toHaveAttribute('data-preview-ready','true');
  const pixels=await Promise.all([first,second].map(locator=>locator.evaluate(canvas=>canvas.toDataURL('image/png'))));
  expect(pixels[0]).not.toBe(pixels[1]);
  await page.waitForTimeout(250);
  expect(await first.evaluate(canvas=>canvas.toDataURL('image/png'))).toBe(pixels[0]);
  await expect(items.locator('a[href="/motion-studio.html?scene=aurora-threads"]')).toBeVisible();
  await expect(items.locator('a[href="/motion-studio.html?scene=mercury-droplets"]')).toBeVisible();
  await expect(initialGallery).toHaveCount(1);
  expect(await page.evaluate(()=>localStorage.getItem('red-loop.motion-studio.comparison'))).toBeNull();
});

test('third comparison replaces the oldest and removing or clearing restores accessible focus',async({page})=>{
  const choose=id=>page.locator('#scene-discovery-results button[data-compare="'+id+'"]');
  await choose('aurora-threads').click();
  await choose('mercury-droplets').click();
  await choose('prism-veil').click();
  await expect(page.locator('#scene-discovery-feedback')).toContainText('ersetzt');
  await expect(choose('aurora-threads')).toHaveAttribute('aria-pressed','false');
  await expect(choose('prism-veil')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#scene-discovery-comparison-items canvas[data-scene]')).toHaveCount(2);
  await page.locator('#scene-discovery-filters button[data-category="Partikel"]').click();
  await expect(page.locator('#scene-discovery-comparison')).toBeVisible();
  await page.locator('#scene-discovery-comparison-items button[data-remove-compare="mercury-droplets"]').click();
  await expect(page.locator('#scene-discovery-search')).toBeFocused();
  await expect(page.locator('#scene-discovery-comparison-count')).toHaveText('1 / 2');
  await page.locator('#scene-discovery-comparison-clear').click();
  await expect(page.locator('#scene-discovery-comparison')).toBeHidden();
  await expect(page.locator('#scene-discovery-search')).toBeFocused();
  await expect(choose('spectral-fold')).toHaveAttribute('aria-pressed','false');
});

test('side-by-side comparisons remain inside narrow mobile and desktop viewports',async({page})=>{
  await page.locator('#scene-discovery-results button[data-compare="aurora-threads"]').click();
  await page.locator('#scene-discovery-results button[data-compare="mercury-droplets"]').click();
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:850});
    const panel=page.locator('#scene-discovery-comparison');
    await expect(panel).toBeVisible();
    const geometry=await panel.evaluate(element=>{
      const panelRect=element.getBoundingClientRect();
      const boxes=[...element.querySelectorAll('.scene-comparison-item')].map(el=>el.getBoundingClientRect());
      return {fits:panelRect.left>=-1&&panelRect.right<=innerWidth+1,
        sideBySide:boxes.length===2&&Math.abs(boxes[0].top-boxes[1].top)<2,
        clipped:boxes.some(box=>box.left<panelRect.left-1||box.right>panelRect.right+1)};
    });
    expect(geometry.fits).toBe(true);
    expect(geometry.sideBySide).toBe(true);
    expect(geometry.clipped).toBe(false);
  }
});

test('homepage opens the canonical source example directly from an effect card',async({page})=>{
  const codeButton=page.locator('#scene-discovery-results button[data-usage="mercury-droplets"]');
  const panel=page.locator('#scene-discovery-usage');
  const content=page.locator('#scene-discovery-usage-text');
  const first=page.locator('#scene-discovery-results a[data-scene="spectral-fold"]');
  await expect(panel).toBeHidden();
  await codeButton.click();
  await expect(panel).toBeVisible();
  await expect(codeButton).toHaveAttribute('aria-expanded','true');
  await expect(page.locator('#scene-discovery-usage-source')).toBeFocused();
  await expect(content).toContainText("scene: 'mercury-droplets'");
  await expect(content).toContainText('density: 58, depth: 58, speed: 42, hue: 340');
  await expect(first).toHaveAttribute('href','/motion-studio.html?scene=spectral-fold');
  await expect(page).toHaveURL(/\/$/);
  await page.locator('#scene-discovery-usage-close').click();
  await expect(panel).toBeHidden();
  await expect(codeButton).toBeFocused();
});

test('copying the homepage code reports success or offers the readable fallback',async({page})=>{
  await page.locator('#scene-discovery-results button[data-usage="aurora-threads"]').click();
  await page.evaluate(()=>{
    window.__copiedUsage=null;
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{
      writeText:async value=>{window.__copiedUsage=value},
    }});
  });
  await page.locator('#scene-discovery-usage-copy').click();
  await expect(page.locator('#scene-discovery-feedback')).toContainText('Aurora Threads kopiert');
  const copied=await page.evaluate(()=>window.__copiedUsage);
  expect(copied).toContain("scene: 'aurora-threads'");
  await page.evaluate(()=>{
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{
      writeText:async()=>{throw new Error('Permission denied')},
    }});
  });
  await page.locator('#scene-discovery-usage-copy').click();
  await expect(page.locator('#scene-discovery-feedback')).toContainText('Kopieren nicht verfügbar');
  await expect(page.locator('#scene-discovery-usage-source')).toBeFocused();
  await expect(page.locator('#scene-discovery-usage')).toBeVisible();
});

test('code inspector stays inside phone and desktop viewports',async({page})=>{
  await page.locator('#scene-discovery-results button[data-usage="glass-filament"]').click();
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:850});
    const panel=page.locator('#scene-discovery-usage');
    await expect(panel).toBeVisible();
    const fits=await panel.evaluate(element=>{
      const rect=element.getBoundingClientRect();
      const code=element.querySelector('pre').getBoundingClientRect();
      return rect.left>=-1&&rect.right<=innerWidth+1&&code.left>=rect.left-1&&code.right<=rect.right+1;
    });
    expect(fits).toBe(true);
    await expect(page.locator('#scene-discovery-usage-text')).toContainText("scene: 'glass-filament'");
  }
});
