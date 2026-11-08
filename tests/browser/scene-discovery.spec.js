import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{await page.goto('/');});

test('dashboard finds original motion components by text and category and opens the selected scene',async({page})=>{
  const grid=page.locator('#scene-discovery-results');
  await expect(grid.locator('a[data-scene]')).toHaveCount(10);
  await expect(page.locator('#scene-discovery-count')).toHaveText('10 Komponenten gefunden');
  const material=page.locator('#scene-discovery-filters button[data-category="Material"]');
  await material.click();
  await expect(material).toHaveAttribute('aria-pressed','true');
  await expect(grid.locator('a[data-scene]')).toHaveCount(3);
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
  await expect(grid.locator('a[data-scene]')).toHaveCount(10);
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
    await expect(grid.locator('a[data-scene]')).toHaveCount(10);
    const withinViewport=await page.locator('#scene-discovery').evaluate(el=>{
      const rect=el.getBoundingClientRect();
      return rect.left>=-1&&rect.right<=window.innerWidth+1;
    });
    expect(withinViewport).toBe(true);
  }
});
