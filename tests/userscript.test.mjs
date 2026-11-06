import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync('userscripts/red-loop.user.js','utf8');
function setup(saved, {modern=false,path='/c/test',paragraphs=false}={}) {
  const html=modern ? '<body><section><h4 data-conversation-role="assistant">ChatGPT hat gesagt:</h4><div data-markdown-text-style="assistant-message">Done</div></section><form data-chatgpt-composer><div contenteditable="true" role="textbox" data-composer-markdown aria-label="ChatGPT fragen"></div><button type="button" aria-label="Senden">Send</button></form></body>' : '<body><div data-message-author-role="assistant">Done</div><textarea id="prompt-textarea"></textarea><button data-testid="send-button">Send</button></body>';
  const dom=new JSDOM(html,{url:'https://chatgpt.com'+path,runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window; let tick,now=100000,sends=0; const sent=[];
  Object.defineProperty(w.HTMLElement.prototype,'innerText',{get(){return this.hasAttribute('data-composer-markdown') && this.children.length && [...this.children].every(el=>el.tagName==='P') ? [...this.children].map(p=>p.textContent || '\n').join('\n\n') : this.textContent;},set(value){this.textContent=value;},configurable:true});
  w.HTMLElement.prototype.getClientRects=function(){return w.getComputedStyle(this).display==='none'?[]:[{width:200,height:40}];};
  w.document.hasFocus=()=>true; w.Date.now=()=>now; w.setInterval=fn=>{tick=fn;return 1;};
  if(saved) w.sessionStorage.setItem('red-loop:v1:/c/test',JSON.stringify(saved));
  w.document.execCommand=(command,unused,value)=>{if(command!=='insertText') return false;const el=w.document.activeElement;if(paragraphs)el.replaceChildren(...value.split('\n').map(line=>{const p=w.document.createElement('p');if(line)p.textContent=line;else p.append(w.document.createElement('br'));return p;}));else el.textContent=value;return true;};
  const sendControl=w.document.querySelector('[data-testid="send-button"],button[aria-label="Senden"]');
  sendControl.onclick=()=>{
    sends++;const editor=sendControl.closest('form')?.querySelector('[data-composer-markdown]') || w.document.querySelector('textarea');
    sent.push(editor.children.length && [...editor.children].every(el=>el.tagName==='P') ? [...editor.children].map(p=>p.textContent).join('\n') : editor.value || editor.textContent);
    if(editor instanceof w.HTMLTextAreaElement) editor.value='';else editor.textContent='';
  };
  w.eval(source);
  return {w,dom,sent,get sends(){return sends;},click:s=>w.document.querySelector(s).click(),advance:ms=>{now+=ms;tick();}};
}

test('rich-text paragraph rendering supports multiline prompts including intentional blank lines',()=>{
  const f=setup(null,{modern:true,paragraphs:true});const prompt='Zeile eins\nZeile zwei\n\nNeuer Absatz';
  f.w.document.querySelector('#rl-prompt').value=prompt;f.click('.rl-start');f.advance(7000);
  assert.equal(f.sends,1);assert.equal(f.sent[0],prompt);f.dom.window.close();
});

test('a newline edit in a prepared rich-text draft cancels the send',()=>{
  const f=setup(null,{modern:true,paragraphs:true});const button=f.w.document.querySelector('button[aria-label="Senden"]');button.disabled=true;
  f.w.document.querySelector('#rl-prompt').value='Erste Zeile\nZweite Zeile';f.click('.rl-start');f.advance(7000);
  const editor=f.w.document.querySelector('[data-composer-markdown]');editor.textContent='Erste Zeile\nZweite Zeile';button.disabled=false;f.advance(1500);
  assert.equal(f.sends,0);assert.match(f.w.document.querySelector('.rl-status').textContent,/Entwurf geändert/);f.dom.window.close();
});

test('custom multiline follow-up repeats only after completed new responses and stops at the limit',()=>{
  const f=setup(null,{modern:true});const prompt='Prüfe den nächsten Schritt.\nAntworte kurz mit dem Ergebnis.';
  f.w.document.querySelector('#rl-prompt').value=prompt;f.w.document.querySelector('#rl-limit').value='2';f.click('.rl-start');
  assert.equal(f.w.document.querySelector('#rl-prompt').disabled,true);
  const stop=f.w.document.createElement('button');stop.setAttribute('aria-label','Stoppen');f.w.document.querySelector('form').append(stop);
  f.advance(20000);assert.equal(f.sends,0);stop.remove();f.advance(7000);assert.deepEqual(f.sent,[prompt]);
  f.advance(20000);assert.equal(f.sends,1);
  f.w.document.querySelector('[data-markdown-text-style]').textContent='Next response';f.advance(1500);f.advance(7000);
  assert.deepEqual(f.sent,[prompt,prompt]);f.advance(1500);assert.match(f.w.document.querySelector('.rl-status').textContent,/Limit erreicht/);
  assert.equal(f.w.document.querySelector('#rl-prompt').disabled,false);f.advance(20000);assert.equal(f.sends,2);f.dom.window.close();
});

test('custom prompt is saved per chat without auto-starting or leaking to another chat',()=>{
  const f=setup({count:1,limit:3,prompt:'Saved text\nSecond line'});
  const field=f.w.document.querySelector('#rl-prompt');assert.equal(field.value,'Saved text\nSecond line');f.advance(20000);assert.equal(f.sends,0);
  field.value='Edited <text> & more';field.dispatchEvent(new f.w.Event('input'));
  assert.equal(JSON.parse(f.w.sessionStorage.getItem('red-loop:v1:/c/test')).prompt,field.value);
  f.w.history.pushState({},'', '/c/other');f.advance(1500);assert.notEqual(field.value,'Edited <text> & more');
  f.w.history.pushState({},'', '/c/test');f.advance(1500);assert.equal(field.value,'Edited <text> & more');
  assert.equal(f.w.document.querySelector('.rl-stop').disabled,true);f.dom.window.close();
});

test('blank and oversized follow-up texts cannot start, reset keeps the chosen text',()=>{
  const f=setup();const field=f.w.document.querySelector('#rl-prompt');
  for(const invalid of ['  \n ', 'x'.repeat(4001)]) {field.value=invalid;f.click('.rl-start');f.advance(20000);assert.equal(f.sends,0);assert.match(f.w.document.querySelector('.rl-status').textContent,/Folgetext/);}
  field.value='Mein Folgetext';f.click('.rl-start');f.advance(7000);assert.deepEqual(f.sent,['Mein Folgetext']);
  f.click('.rl-reset');assert.equal(field.value,'Mein Folgetext');assert.equal(field.disabled,false);assert.equal(f.w.document.querySelector('.rl-stop').disabled,true);f.dom.window.close();
});

test('changing follow-up after Stop applies to the next run',()=>{
  const f=setup();const field=f.w.document.querySelector('#rl-prompt');field.value='Erster Text';f.click('.rl-start');f.advance(7000);f.click('.rl-stop');
  f.w.document.querySelector('[data-message-author-role]').textContent='New completed response';
  field.value='Zweiter Text';f.click('.rl-start');f.advance(13000);assert.deepEqual(f.sent,['Erster Text','Zweiter Text']);f.dom.window.close();
});
test('saved counter survives load and does not auto-start',()=>{
  const f=setup({count:3,limit:7}); assert.match(f.w.document.querySelector('.rl-counter').textContent,/3 \/ 7/);f.advance(20000);assert.equal(f.sends,0);f.dom.window.close();
});

test('opt-in background mode continues through blur and a hidden document but pagehide stops it',()=>{
  const f=setup();const background=f.w.document.querySelector('#rl-background');background.checked=true;background.dispatchEvent(new f.w.Event('change'));
  f.click('.rl-start');assert.equal(background.disabled,true);f.w.document.hasFocus=()=>false;
  Object.defineProperty(f.w.document,'hidden',{value:true,configurable:true});f.w.dispatchEvent(new f.w.Event('blur'));f.w.document.dispatchEvent(new f.w.Event('visibilitychange'));
  f.advance(7000);assert.equal(f.sends,1);f.w.dispatchEvent(new f.w.Event('pagehide'));f.advance(20000);assert.equal(f.sends,1);assert.equal(background.disabled,false);f.dom.window.close();
});

test('foreground mode still stops when the browser loses focus',()=>{
  const f=setup();f.click('.rl-start');f.w.dispatchEvent(new f.w.Event('blur'));f.advance(7000);assert.equal(f.sends,0);assert.match(f.w.document.querySelector('.rl-status').textContent,/Fokus/);f.dom.window.close();
});

test('background preference is per-chat and never auto-starts on load',()=>{
  const f=setup({background:true,prompt:'Continue',limit:4});const check=f.w.document.querySelector('#rl-background');assert.equal(check.checked,true);
  f.advance(20000);assert.equal(f.sends,0);f.w.history.pushState({},'', '/c/other');f.advance(1500);assert.equal(check.checked,false);
  f.w.history.pushState({},'', '/c/test');f.advance(1500);assert.equal(check.checked,true);assert.equal(f.w.document.querySelector('.rl-stop').disabled,true);f.dom.window.close();
});

for(const [marker,status] of [['[RED_LOOP_FERTIG]','Auftrag abgeschlossen'],['[RED_LOOP_RUECKFRAGE]','Rückfrage']]) {
  test(`work preset stops after a completed answer with ${marker}`,()=>{
    const f=setup();f.click('.rl-work');assert.match(f.w.document.querySelector('#rl-prompt').value,/offen/);f.advance(20000);assert.equal(f.sends,0);
    f.click('.rl-start');f.advance(7000);assert.equal(f.sends,1);f.w.document.querySelector('[data-message-author-role]').textContent='Result\n'+marker;
    f.advance(1500);f.advance(13000);assert.equal(f.sends,1);assert.match(f.w.document.querySelector('.rl-status').textContent,new RegExp(status));assert.equal(f.w.document.querySelector('.rl-work').disabled,false);f.dom.window.close();
  });
}

test('quoted completion markers do not stop work and custom texts without markers are unaffected',()=>{
  const f=setup();f.click('.rl-work');f.w.document.querySelector('[data-message-author-role]').textContent='The token [RED_LOOP_FERTIG] is explained here.';f.click('.rl-start');f.advance(7000);assert.equal(f.sends,1);f.click('.rl-reset');
  f.w.document.querySelector('#rl-prompt').value='My text';f.w.document.querySelector('[data-message-author-role]').textContent='[RED_LOOP_FERTIG]';f.click('.rl-start');f.advance(7000);assert.equal(f.sends,2);f.dom.window.close();
});
test('current ChatGPT markup supports semantic composer and assistant body',()=>{
  const f=setup(null,{modern:true});f.click('.rl-start');f.advance(7000);assert.equal(f.sends,1);
  f.advance(15000);assert.equal(f.sends,1);f.dom.window.close();
});
test('a delayed send button is awaited without duplicate insertion',()=>{
  const f=setup(null,{modern:true});const button=f.w.document.querySelector('button[aria-label="Senden"]');
  button.disabled=true;f.click('.rl-start');f.advance(7000);assert.equal(f.sends,0);
  const prompt=f.w.document.querySelector('[data-composer-markdown]').textContent;
  f.advance(1500);assert.equal(f.w.document.querySelector('[data-composer-markdown]').textContent,prompt);
  button.disabled=false;f.advance(1500);assert.equal(f.sends,1);f.advance(15000);assert.equal(f.sends,1);f.dom.window.close();
});
test('stop cancels a prepared message before a delayed send becomes available',()=>{
  const f=setup(null,{modern:true});const button=f.w.document.querySelector('button[aria-label="Senden"]');
  button.disabled=true;f.click('.rl-start');f.advance(7000);f.click('.rl-stop');button.disabled=false;
  f.advance(9000);assert.equal(f.sends,0);assert.match(f.w.document.querySelector('.rl-status').textContent,/Manuell gestoppt/);f.dom.window.close();
});
test('editing a prepared message cancels submission and preserves the edit',()=>{
  const f=setup(null,{modern:true});const button=f.w.document.querySelector('button[aria-label="Senden"]');
  button.disabled=true;f.click('.rl-start');f.advance(7000);
  const editor=f.w.document.querySelector('[data-composer-markdown]');editor.textContent='Keep my change';button.disabled=false;f.advance(1500);
  assert.equal(f.sends,0);assert.equal(editor.textContent,'Keep my change');assert.match(f.w.document.querySelector('.rl-status').textContent,/Entwurf geändert/);f.dom.window.close();
});
test('a permanently unavailable send button times out safely',()=>{
  const f=setup(null,{modern:true});f.w.document.querySelector('button[aria-label="Senden"]').disabled=true;
  f.click('.rl-start');f.advance(7000);f.advance(6000);assert.equal(f.sends,0);
  assert.match(f.w.document.querySelector('.rl-status').textContent,/Senden nicht verfügbar/);assert.equal(f.w.document.querySelector('.rl-stop').disabled,true);f.dom.window.close();
});
test('current response loading errors stop even without an assistant body',()=>{
  const f=setup(null,{modern:true});f.w.document.querySelector('[data-markdown-text-style]').textContent='Diese Antwort konnte nicht geladen werden';
  f.click('.rl-start');f.advance(1500);assert.equal(f.sends,0);assert.match(f.w.document.querySelector('.rl-status').textContent,/Antwortfehler/);f.dom.window.close();
});
test('a recovered latest answer is not blocked by a historical loading error',()=>{
  const f=setup(null,{modern:true});const old=f.w.document.createElement('section');old.innerHTML='<h4 data-conversation-role="assistant">ChatGPT hat gesagt:</h4><p>Diese Antwort konnte nicht geladen werden</p>';
  f.w.document.body.prepend(old);f.click('.rl-start');f.advance(7000);assert.equal(f.sends,1);f.dom.window.close();
});
test('project conversation paths retain the same per-chat counters',()=>{
  const f=setup({count:3,limit:5},{modern:true,path:'/g/g-p-project/c/test'});
  f.click('.rl-start');f.advance(7000);assert.equal(f.sends,1);assert.match(f.w.document.querySelector('.rl-counter').textContent,/4 \/ 5/);f.dom.window.close();
});
test('changing the limit updates the displayed counter without starting',()=>{
  const f=setup();const input=f.w.document.querySelector('#rl-limit');input.value='1';input.dispatchEvent(new f.w.Event('change'));
  assert.match(f.w.document.querySelector('.rl-counter').textContent,/0 \/ 1/);f.advance(20000);assert.equal(f.sends,0);f.dom.window.close();
});
test('empty or nested assistant markup cannot trigger duplicate continuation',()=>{
  const f=setup(null,{modern:true});const body=f.w.document.querySelector('[data-markdown-text-style]');body.textContent='';
  f.click('.rl-start');f.advance(20000);assert.equal(f.sends,0);
  body.textContent='Done';body.parentElement.setAttribute('data-message-author-role','assistant');f.advance(1500);f.advance(7000);assert.equal(f.sends,1);f.dom.window.close();
});
test('hidden background chats cannot provide responses or overwrite their drafts',()=>{
  const f=setup(null,{modern:true});const background=f.w.document.createElement('section');background.hidden=true;
  background.innerHTML='<div data-markdown-text-style="assistant-message">Background answer</div><form data-chatgpt-composer><div data-composer-markdown contenteditable="true">Keep background draft</div><button aria-label="Senden">Send</button></form>';
  f.w.document.body.append(background);f.click('.rl-start');f.advance(7000);assert.equal(f.sends,1);
  background.querySelector('[data-markdown-text-style]').textContent='Different background answer';f.advance(1500);f.advance(15000);
  assert.equal(f.sends,1);assert.equal(background.querySelector('[data-composer-markdown]').textContent,'Keep background draft');f.dom.window.close();
});
test('offscreen cached messages and composers from another conversation are excluded by identity',()=>{
  const f=setup(null,{modern:true});const background=f.w.document.createElement('section');
  background.innerHTML='<div data-chatgpt-selection-conversation-id="other"><div data-markdown-text-style="assistant-message">Other chat</div></div><form data-chatgpt-composer><div data-above-composer-conversation-id="chatgpt:other"></div><div data-composer-markdown contenteditable="true">Private other draft</div><button aria-label="Senden">Send</button></form>';
  f.w.document.body.prepend(background);f.click('.rl-start');f.advance(7000);assert.equal(f.sends,1);
  assert.equal(background.querySelector('[data-composer-markdown]').textContent,'Private other draft');f.dom.window.close();
});
test('hidden generation controls and loading errors cannot affect the active chat',()=>{
  const f=setup(null,{modern:true});const background=f.w.document.createElement('section');background.setAttribute('aria-hidden','true');
  background.innerHTML='<button data-testid="stop-button">Stop</button><div data-testid="error-message">Error</div><div><h4 data-conversation-role="assistant">Assistant</h4>Diese Antwort konnte nicht geladen werden</div>';
  f.w.document.body.append(background);f.click('.rl-start');f.advance(7000);assert.equal(f.sends,1);f.dom.window.close();
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
