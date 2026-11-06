import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const source=readFileSync('userscripts/red-loop.user.js','utf8');
test('real editor insertion, bounded send and duplicate guard on a local fixture',async({page})=>{
  await page.route('https://chatgpt.com/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><p id="untouched">Unrelated content</p><div data-message-author-role="assistant">An initial answer.</div><div id="prompt-textarea" contenteditable="true"></div><button data-testid="send-button">Send</button><script>window.sends=0;document.querySelector("button").onclick=()=>{window.sends++;document.querySelector("#prompt-textarea").textContent="";};</script></body></html>'}));
  await page.goto('https://chatgpt.com/c/red-loop-fixture');await page.clock.install();
  await page.addScriptTag({content:source});await page.addScriptTag({content:source});await expect(page.locator('#red-loop-root')).toHaveCount(1);
  await expect(page.getByRole('textbox',{name:'Automatischer Folgetext'})).toBeVisible();
  await page.locator('.rl-collapse').click();await expect(page.locator('#rl-prompt')).toBeHidden();await expect(page.locator('.rl-stop')).toBeVisible();
  await page.locator('.rl-collapse').click();await expect(page.locator('#rl-prompt')).toBeVisible();
  await page.locator('#rl-limit').fill('2');await page.locator('.rl-start').click();await page.clock.fastForward(7500);
  expect(await page.evaluate(()=>window.sends)).toBe(1);await expect(page.locator('#untouched')).toHaveText('Unrelated content');
  await page.clock.fastForward(20000);expect(await page.evaluate(()=>window.sends)).toBe(1);
  await page.locator('.rl-stop').click();await page.clock.fastForward(20000);expect(await page.evaluate(()=>window.sends)).toBe(1);
});
test('contenteditable draft never overwritten',async({page})=>{
  await page.route('https://chatgpt.com/**',route=>route.fulfill({contentType:'text/html',body:'<html><body><div data-message-author-role="assistant">Done</div><div id="prompt-textarea" contenteditable="true">Keep my private draft</div><button data-testid="send-button">Send</button></body></html>'}));
  await page.goto('https://chatgpt.com/c/red-loop-draft');await page.addScriptTag({content:source});await page.locator('.rl-start').click();
  await expect(page.locator('#prompt-textarea')).toHaveText('Keep my private draft');await expect(page.locator('.rl-status')).toContainText('Entwurf');await expect(page.locator('.rl-stop')).toBeDisabled();
});

