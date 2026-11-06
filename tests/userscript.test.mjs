import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync('userscripts/red-loop.user.js','utf8');
function setup(saved) {
  const dom=new JSDOM('<body><div data-message-author-role="assistant">Done</div><textarea id="prompt-textarea"></textarea><button data-testid="send-button">Send</button></body>',{url:'https://chatgpt.com/c/test',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window; let tick,now=100000,sends=0;
  Object.defineProperty(w.HTMLElement.prototype,'innerText',{get(){return this.textContent;},set(value){this.textContent=value;},configurable:true});
  w.document.hasFocus=()=>true; w.Date.now=()=>now; w.setInterval=fn=>{tick=fn;return 1;};
  if(saved) w.sessionStorage.setItem('red-loop:v1:/c/test',JSON.stringify(saved));
  w.document.querySelector('[data-testid="send-button"]').onclick=()=>{sends++;w.document.querySelector('textarea').value='';};
  w.eval(source);
  return {w,dom,get sends(){return sends;},click:s=>w.document.querySelector(s).click(),advance:ms=>{now+=ms;tick();}};
}
test('saved counter survives load and does not auto-start',()=>{
  const f=setup({count:3,limit:7}); assert.match(f.w.document.querySelector('.rl-counter').textContent,/3 \/ 7/);f.advance(20000);assert.equal(f.sends,0);f.dom.window.close();
});
test('start sends once; unchanged answer never triggers duplicate send',()=>{
  const f=setup(); f.click('.rl-start');f.advance(7000);assert.equal(f.sends,1);f.advance(15000);assert.equal(f.sends,1);
  f.w.document.querySelector('[data-message-author-role]').textContent='New response';f.advance(2000);f.advance(7000);assert.equal(f.sends,2);f.click('.rl-stop');f.advance(20000);assert.equal(f.sends,2);f.dom.window.close();
});
test('draft protected, reset and invalid limit',()=>{
  const f=setup();const editor=f.w.document.querySelector('textarea');editor.value='Private draft';f.click('.rl-start');f.advance(20000);assert.equal(editor.value,'Private draft');assert.equal(f.sends,0);
  editor.value='';f.w.document.querySelector('#rl-limit').value='51';f.click('.rl-start');assert.match(f.w.document.querySelector('.rl-status').textContent,/1 bis 50/);
  f.click('.rl-reset');assert.match(f.w.document.querySelector('.rl-counter').textContent,/0 \/ 10/);f.dom.window.close();
});
test('navigation loads separate counters and stops; visibility stops',()=>{
  const f=setup();f.click('.rl-start');f.w.history.pushState({},'', '/c/other');f.advance(7000);assert.equal(f.sends,0);assert.equal(f.w.document.querySelector('.rl-stop').disabled,true);
  f.click('.rl-start');Object.defineProperty(f.w.document,'hidden',{value:true,configurable:true});f.w.document.dispatchEvent(new f.w.Event('visibilitychange'));assert.equal(f.w.document.querySelector('.rl-stop').disabled,true);f.dom.window.close();
});
test('answer errors stop without send; limit stops exactly',()=>{
  const f=setup();f.w.document.querySelector('#rl-limit').value='1';f.click('.rl-start');f.advance(7000);assert.equal(f.sends,1);f.advance(1500);assert.match(f.w.document.querySelector('.rl-status').textContent,/Limit erreicht/);f.click('.rl-reset');
  f.w.document.querySelector('[data-message-author-role]').textContent='Something went wrong';f.click('.rl-start');f.advance(7000);assert.equal(f.sends,1);assert.match(f.w.document.querySelector('.rl-status').textContent,/Antwortfehler/);f.dom.window.close();
});
