import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test.beforeEach(async({page})=>{await page.goto('/');});
test('bounded start, stop, reset, messages and no duplicates',async({page})=>{
  await page.locator('#limit').fill('2');await page.locator('#start').click();await expect(page.locator('#start')).toBeDisabled();
  await expect(page.locator('#count')).toHaveText('02',{timeout:7000});await expect(page.locator('#status')).toHaveText('Limit erreicht');
  await expect(page.locator('.message.assistant')).toHaveCount(2);await page.locator('#reset').click();await expect(page.locator('#count')).toHaveText('00');
  await page.locator('#start').click();await page.locator('#stop').click();await page.waitForTimeout(1800);await expect(page.locator('#count')).toHaveText('00');await expect(page.locator('#status')).toHaveText('Gestoppt');
});
test('invalid limits and safe failure',async({page})=>{
  for(const value of ['0','51','1.5']){await page.locator('#limit').fill(value);await page.locator('#start').click();await expect(page.locator('#error')).toBeVisible();}
  await page.locator('#limit').fill('1');await page.locator('#scenario').selectOption('error');await page.locator('#start').click();await expect(page.locator('#error')).toContainText('Antwortfehler',{timeout:4000});await expect(page.locator('#count')).toHaveText('00');
  await page.locator('#scenario').selectOption('draft');await page.locator('#start').click();await expect(page.locator('#error')).toContainText('Entwurf',{timeout:4000});
});
test('navigation stops execution and history works',async({page})=>{
  await page.locator('#start').click();await page.getByRole('link',{name:'Integration',exact:true}).click();await expect(page.locator('#integration')).toBeVisible();
  await page.goBack();await expect(page.locator('#dashboard')).toBeVisible();await expect(page.locator('#status')).toHaveText('Gestoppt');
  await page.getByRole('link',{name:'Datenschutz',exact:true}).click();await expect(page.locator('#privacy')).toBeVisible();
});
test('responsive layout, dark mode, accessibility and reduced motion',async({page},testInfo)=>{
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.emulateMedia({reducedMotion:'reduce'});
  expect(await page.locator('#start').evaluate(el=>getComputedStyle(el).transitionDuration)).toBe('0s');
  await page.screenshot({path:`docs/previews/${testInfo.project.name}-light.png`,fullPage:true});
  let results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(results.violations).toEqual([]);
  await page.locator('#theme').click();await page.locator('#theme').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(results.violations).toEqual([]);
  await page.screenshot({path:`docs/previews/${testInfo.project.name}-dark.png`,fullPage:true});
});
test('keyboard control and health',async({page,request})=>{
  await page.locator('#start').focus();await page.keyboard.press('Enter');await expect(page.locator('#stop')).toBeEnabled();
  await page.keyboard.press('Tab');await expect(page.locator('#stop')).toBeFocused();await page.keyboard.press('Enter');await expect(page.locator('#status')).toHaveText('Gestoppt');
  const health=await request.get('/health');expect(health.ok()).toBe(true);expect((await health.json()).mode).toBe('local-demo');
});
