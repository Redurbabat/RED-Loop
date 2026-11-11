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

test('in-app host injection uses the work preset and endless mode and reports counter-only status',async({page})=>{
  await page.route('https://chatgpt.com/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><div data-message-author-role="assistant">An initial answer.</div><div id="prompt-textarea" contenteditable="true"></div><button data-testid="send-button">Send</button><script>window.sends=0;document.querySelector("button").onclick=()=>{window.sends++;document.querySelector("#prompt-textarea").textContent="";document.querySelector("[data-message-author-role]").textContent="Fixture answer "+window.sends;};<\/script></body></html>'}));
  // Exactly what the app installs before the page loads: display settings and a
  // one-way status channel. No credentials, no way to start a run.
  await page.addInitScript(()=>{
    window.__RED_LOOP_HOST__={app:'ios-webview',bottomInset:12};
    window.redLoopMessages=[];
    window.webkit={messageHandlers:{redLoop:{postMessage:value=>window.redLoopMessages.push(value)}}};
  });
  await page.goto('https://chatgpt.com/c/red-loop-app-view');await page.addScriptTag({content:source});
  await expect(page.locator('#red-loop-root.rl-embedded')).toBeVisible();
  await expect(page.locator('#rl-endless')).toBeChecked();
  await expect(page.locator('#rl-background')).toBeHidden();
  await expect(page.locator('#rl-prompt')).toHaveValue(/offen/);
  await expect(page.locator('.rl-counter')).toContainText('0 / ∞');
  await page.locator('.rl-start').click();
  await expect.poll(()=>page.evaluate(()=>window.sends),{timeout:15000}).toBe(1);
  const reported=await page.evaluate(()=>window.redLoopMessages);
  expect(reported.at(-1).type).toBe('state');expect(reported.at(-1).running).toBe(true);
  expect(reported.at(-1).endless).toBe(true);expect(reported.at(-1).count).toBe(1);
  expect(JSON.stringify(reported)).not.toContain('offen');
  expect(JSON.stringify(reported)).not.toContain('Fixture answer');
  await page.locator('.rl-stop').click();
  await expect.poll(()=>page.evaluate(()=>window.redLoopMessages.at(-1).running)).toBe(false);
});
