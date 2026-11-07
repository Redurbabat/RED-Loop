import {test as base,expect,chromium} from '@playwright/test';
import path from 'node:path';
import {unzipSync} from 'fflate';
import {readFileSync} from 'node:fs';
import {withNaturalVisibility} from './natural-visibility.mjs';
const test=base.extend({
  naturalVisibility:[false,{option:true}],
  context:async({naturalVisibility},use)=>{
    const extension=path.resolve('extensions/chromium');
    if(naturalVisibility) return withNaturalVisibility(chromium,extension,use);
    const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
    await use(context);await context.close();
  }
});

test.setTimeout(90000);
test('downloadable Windows package has a valid manifest and the canonical script',async({request})=>{
  const response=await request.get('/red-loop-browser-extension.zip');expect(response.ok()).toBe(true);
  const zip=unzipSync(await response.body());
  const manifest=JSON.parse(new TextDecoder().decode(zip['manifest.json']));
  expect(manifest.manifest_version).toBe(3);expect(manifest.host_permissions).not.toContain('<all_urls>');
  expect(new TextDecoder().decode(zip['red-loop.user.js'])).toBe(readFileSync('userscripts/red-loop.user.js','utf8'));
  expect(zip['popup.html']).toBeTruthy();expect(zip['INSTALLATION-WINDOWS.txt']).toBeTruthy();
});
async function openFixture(page,draft='') {
  const body = `<!doctype html><html lang="de"><head><title>RED Loop extension test fixture</title></head><body><h1>Local extension test</h1><div data-message-author-role="assistant">A finished local fixture answer.</div><div id="prompt-textarea" contenteditable="true">${draft}</div><button data-testid="send-button">Send fixture</button><script>window.sends=0;document.querySelector('button').onclick=()=>{window.sends++;document.querySelector('#prompt-textarea').textContent='';};</script></body></html>`;
  await page.route('https://chatgpt.com/**', route => route.fulfill({contentType:'text/html', body}));
  await page.goto('https://chatgpt.com/c/extension-fixture');await page.bringToFront();
  await expect(page.locator('#red-loop-root')).toBeVisible();
  await page.emulateMedia({colorScheme:'light'});
  await expect(page.locator('#red-loop-root')).toHaveCSS('color','rgb(39, 40, 45)');
  await page.emulateMedia({colorScheme:'dark'});
  await expect(page.locator('#red-loop-root')).toHaveCSS('color','rgb(247, 247, 249)');
}
test('packaged extension injects and sends only after explicit start; no duplicate send',async({page})=>{
  test.setTimeout(40000);await openFixture(page);
  expect(await page.evaluate(()=>window.sends)).toBe(0);
  await page.locator('#rl-limit').fill('2');await page.locator('.rl-start').click();
  await expect.poll(()=>page.evaluate(()=>window.sends),{timeout:12000}).toBe(1);
  await page.waitForTimeout(13000);expect(await page.evaluate(()=>window.sends)).toBe(1);
  await page.locator('.rl-stop').click();await expect(page.locator('.rl-stop')).toBeDisabled();
  await page.locator('.rl-reset').click();await expect(page.locator('.rl-counter')).toContainText('0 / 2');
  await page.screenshot({path:'test-results/windows-extension-fixture.png',fullPage:true});
});
test('packaged extension preserves drafts and limits execution to one send',async({page})=>{
  await openFixture(page,'Keep this draft');await page.locator('.rl-start').click();
  await expect(page.locator('#prompt-textarea')).toHaveText('Keep this draft');await expect(page.locator('.rl-status')).toContainText('Entwurf');
  await page.locator('#prompt-textarea').fill('');await page.locator('#rl-limit').fill('1');await page.locator('.rl-start').click();
  await expect.poll(()=>page.evaluate(()=>window.sends),{timeout:12000}).toBe(1);
  await expect(page.locator('.rl-status')).toContainText('Limit erreicht',{timeout:4000});
  await page.waitForTimeout(1600);expect(await page.evaluate(()=>window.sends)).toBe(1);
});

test('packaged extension repeats the chosen multiline text after answers, stops and restores it on reload',async({page})=>{
  await openFixture(page);const prompt='Mein nächster Schritt.\nBitte prüfe das Ergebnis.';
  await page.evaluate(()=>{window.sent=[];document.querySelector('[data-testid="send-button"]').onclick=()=>{window.sent.push(document.querySelector('#prompt-textarea').innerText);document.querySelector('#prompt-textarea').textContent='';};});
  await page.locator('#rl-prompt').fill(prompt);await page.locator('#rl-limit').fill('2');
  await page.evaluate(()=>{const b=document.createElement('button');b.dataset.testid='stop-button';b.textContent='Generating';document.body.append(b);});
  await page.locator('.rl-start').click();await expect(page.locator('#rl-prompt')).toBeDisabled();
  await page.waitForTimeout(8000);expect(await page.evaluate(()=>window.sent)).toEqual([]);
  await page.locator('[data-testid="stop-button"]').evaluate(el=>el.remove());
  await expect.poll(()=>page.evaluate(()=>window.sent),{timeout:12000}).toEqual([prompt]);
  await page.evaluate(()=>{document.querySelector('[data-message-author-role]').textContent='A second completed answer.';});
  await expect.poll(()=>page.evaluate(()=>window.sent),{timeout:22000}).toEqual([prompt,prompt]);
  await expect(page.locator('.rl-status')).toContainText('Limit erreicht',{timeout:4000});await expect(page.locator('#rl-prompt')).toBeEnabled();
  await page.screenshot({path:'test-results/custom-follow-up-extension.png',fullPage:true});
  await page.reload();await expect(page.locator('#rl-prompt')).toHaveValue(prompt);await expect(page.locator('.rl-stop')).toBeDisabled();
  await expect(page.locator('.rl-counter')).toContainText('2 / 2');
});

for (const [name,prompt] of [['line break','Erster Schritt.\nZweiter Schritt.'],['blank paragraph','Erster Schritt.\n\nNeuer Absatz.']]) {
  test(`packaged rich-text composer preserves a ${name}`,async({page})=>{
    await openFixture(page);
    await page.evaluate(()=>{
      const editor=document.querySelector('#prompt-textarea');
      editor.addEventListener('input',event=>{
        if (!event.data?.includes('\n')) return;
        editor.replaceChildren(...event.data.split('\n').map(line=>{const p=document.createElement('p');if(line)p.textContent=line;else p.append(document.createElement('br'));return p;}));
      });
      window.sentText=null;
      document.querySelector('[data-testid="send-button"]').onclick=()=>{window.sentText=[...editor.querySelectorAll('p')].map(p=>p.textContent).join('\n');editor.textContent='';};
    });
    await page.locator('#rl-prompt').fill(prompt);await page.locator('#rl-limit').fill('1');await page.locator('.rl-start').click();
    await expect.poll(()=>page.evaluate(()=>window.sentText),{timeout:12000}).toBe(prompt);
    await expect(page.locator('.rl-status')).toContainText('Limit erreicht',{timeout:4000});
  });
}

test('work preset stops after a returned completion marker',async({page})=>{
  await openFixture(page);await page.locator('.rl-work').click();await page.locator('#rl-background').check();await page.locator('#rl-limit').fill('3');
  await page.evaluate(()=>{document.querySelector('[data-testid="send-button"]').onclick=()=>{window.sends++;document.querySelector('#prompt-textarea').textContent='';const answer=document.querySelector('[data-message-author-role]');answer.style.whiteSpace='pre-wrap';answer.textContent='All fixture tasks verified.\n[RED_LOOP_FERTIG]';};});
  await page.locator('.rl-start').click();
  await expect.poll(()=>page.evaluate(()=>window.sends),{timeout:25000}).toBe(1);
  await expect.poll(()=>page.locator('.rl-status').textContent(),{timeout:25000}).toBe('Auftrag abgeschlossen');
  expect(await page.evaluate(()=>window.sends)).toBe(1);await expect(page.locator('.rl-stop')).toBeDisabled();
  await page.screenshot({path:'test-results/background-work-completed.png',fullPage:true});
});

test('packaged endless mode continues past the numeric limit and pause keeps the counter',async({page})=>{
  test.setTimeout(150000);await openFixture(page);
  await page.evaluate(()=>{window.sends=0;document.querySelector('[data-testid="send-button"]').onclick=()=>{
    window.sends++;document.querySelector('#prompt-textarea').textContent='';
    document.querySelector('[data-message-author-role]').textContent='Fixture answer number '+window.sends+'.';
  };});
  await page.locator('#rl-limit').fill('1');await page.locator('#rl-endless').check();
  await expect(page.locator('#rl-limit')).toBeDisabled();await expect(page.locator('.rl-counter')).toContainText('0 / ∞');
  await page.locator('.rl-start').click();await expect(page.locator('#rl-endless')).toBeDisabled();
  await expect.poll(()=>page.evaluate(()=>window.sends),{timeout:70000}).toBeGreaterThanOrEqual(3);
  await page.locator('.rl-stop').click();await expect(page.locator('.rl-status')).toContainText('Pausiert');
  const paused=await page.evaluate(()=>window.sends);
  await expect(page.locator('.rl-counter')).toContainText(`${paused} / ∞`);
  await page.waitForTimeout(16000);expect(await page.evaluate(()=>window.sends)).toBe(paused);
  await page.locator('.rl-start').click();
  await expect.poll(()=>page.evaluate(()=>window.sends),{timeout:30000}).toBeGreaterThan(paused);
  await page.locator('.rl-stop').click();
  await expect(page.locator('.rl-counter')).toContainText('/ ∞');
  await expect(page.locator('#rl-endless')).toBeEnabled();
});

test.describe('natural background visibility',()=>{
  test.use({naturalVisibility:true});
  test.describe.configure({mode:'serial'});

  async function selectOtherTab(page,context,mustBeHidden=true) {
    const other=await context.newPage();await other.goto('about:blank');await other.bringToFront();
    await expect.poll(()=>page.evaluate(()=>document.hasFocus())).toBe(false);
    if(mustBeHidden) await expect.poll(()=>page.evaluate(()=>document.hidden)).toBe(true);
    return other;
  }

  test('packaged work loop sends without visibility or focus and stops at completion',async({page,context})=>{
    await openFixture(page);await page.locator('.rl-work').click();await page.locator('#rl-background').check();await page.locator('#rl-limit').fill('3');
    await page.evaluate(()=>{window.sendStates=[];document.querySelector('[data-testid="send-button"]').onclick=()=>{
      window.sends++;window.sendStates.push({hidden:document.hidden,focused:document.hasFocus()});
      document.querySelector('#prompt-textarea').textContent='';
      const answer=document.querySelector('[data-message-author-role]');answer.style.whiteSpace='pre-wrap';answer.textContent='Fixture tasks verified.\n[RED_LOOP_FERTIG]';
    };});
    await page.locator('.rl-start').click();const other=await selectOtherTab(page,context);
    await expect.poll(()=>page.evaluate(()=>window.sends),{timeout:30000}).toBe(1);
    await expect.poll(()=>page.locator('.rl-status').textContent(),{timeout:30000}).toBe('Auftrag abgeschlossen');
    expect(await page.evaluate(()=>window.sendStates)).toEqual([{hidden:true,focused:false}]);
    expect(await page.evaluate(()=>({hidden:document.hidden,focused:document.hasFocus()}))).toEqual({hidden:true,focused:false});
    await page.waitForTimeout(3000);expect(await page.evaluate(()=>window.sends)).toBe(1);
    await other.close();await page.bringToFront();await page.screenshot({path:'test-results/natural-background-completed.png',fullPage:true});
  });

  test('foreground default stops on real focus loss before sending',async({page,context})=>{
    await openFixture(page);await page.locator('.rl-start').click();await expect(page.locator('.rl-stop')).toBeEnabled();
    const other=await selectOtherTab(page,context,false);
    await expect.poll(()=>page.locator('.rl-stop').isDisabled()).toBe(true);
    expect(await page.evaluate(()=>window.sends)).toBe(0);await other.close();
  });
});
