import {test as base,expect,chromium} from '@playwright/test';
import path from 'node:path';
const test=base.extend({
  context:async({},use)=>{
    const extension=path.resolve('extensions/chromium');
    const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
    await use(context);await context.close();
  }
});
test.setTimeout(90000);
async function openFixture(page,draft='') {
  const body = `<!doctype html><html lang="de"><head><title>RED Loop extension test fixture</title></head><body><h1>Local extension test</h1><div data-message-author-role="assistant">A finished local fixture answer.</div><div id="prompt-textarea" contenteditable="true">${draft}</div><button data-testid="send-button">Send fixture</button><script>window.sends=0;document.querySelector('button').onclick=()=>{window.sends++;document.querySelector('#prompt-textarea').textContent='';};</script></body></html>`;
  await page.route('https://chatgpt.com/**', route => route.fulfill({contentType:'text/html', body}));
  await page.goto('https://chatgpt.com/c/extension-fixture');await page.bringToFront();
  await expect(page.locator('#red-loop-root')).toBeVisible();
}
test('packaged extension injects and sends only after explicit start; no duplicate send',async({page})=>{
  test.setTimeout(40000);await openFixture(page);
  expect(await page.evaluate(()=>window.sends)).toBe(0);
  await page.locator('#rl-limit').fill('2');await page.locator('.rl-start').click();
  await expect.poll(()=>page.evaluate(()=>window.sends),{timeout:12000}).toBe(1);
  await page.waitForTimeout(13000);expect(await page.evaluate(()=>window.sends)).toBe(1);
  await page.locator('.rl-stop').click();await expect(page.locator('.rl-stop')).toBeDisabled();
  await page.locator('.rl-reset').click();await expect(page.locator('.rl-counter')).toContainText('0 / 2');
  await page.screenshot({path:'docs/previews/windows-extension-fixture.png',fullPage:true});
});
test('packaged extension preserves drafts and limits execution to one send',async({page})=>{
  await openFixture(page,'Keep this draft');await page.locator('.rl-start').click();
  await expect(page.locator('#prompt-textarea')).toHaveText('Keep this draft');await expect(page.locator('.rl-status')).toContainText('Entwurf');
  await page.locator('#prompt-textarea').fill('');await page.locator('#rl-limit').fill('1');await page.locator('.rl-start').click();
  await expect.poll(()=>page.evaluate(()=>window.sends),{timeout:12000}).toBe(1);
  await expect(page.locator('.rl-status')).toContainText('Limit erreicht',{timeout:4000});
  await page.waitForTimeout(1600);expect(await page.evaluate(()=>window.sends)).toBe(1);
});
