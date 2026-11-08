import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync('userscripts/red-loop.user.js','utf8');
function setup(saved, {modern=false,path='/c/test',paragraphs=false,host=null,android=false}={}) {
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
  const posted=[];
  if(host&&android) {w.__RED_LOOP_HOST__=host;w.RedLoopHost={postMessage:value=>posted.push(value)};}
  else if(host){w.__RED_LOOP_HOST__=host;w.webkit={messageHandlers:{redLoop:{postMessage:value=>posted.push(value)}}};}
  w.eval(source);
  // advance runs the interval; warp only moves the clock, like a suspended app.
  return {w,dom,sent,posted,get sends(){return sends;},click:s=>w.document.querySelector(s).click(),advance:ms=>{now+=ms;tick();},warp:ms=>{now+=ms;}};
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

for(const [marker,status] of [['[RED_LOOP_FERTIG]','Auftrag abgeschlossen'],['[RED_LOOP_RUECKFRAGE]','Rückfrage']]) {
  test(`work continues past a nonfinal ${marker} and stops only at the final nonempty line`,()=>{
    const f=setup();f.click('.rl-work');const answer=f.w.document.querySelector('[data-message-author-role]');
    answer.textContent='Marker example:\n'+marker+'\nTask A is still open.';f.click('.rl-start');f.advance(7000);assert.equal(f.sends,1);
    answer.textContent='Another example:\n'+marker+'\nTask B is still open.';f.advance(1500);f.advance(13000);assert.equal(f.sends,2);
    answer.textContent='Final report.\n  '+marker+'  \n\n';f.advance(1500);f.advance(13000);
    assert.equal(f.sends,2);assert.match(f.w.document.querySelector('.rl-status').textContent,new RegExp(status));f.dom.window.close();
  });
}

test('ordinary retry advice and quoted error explanations do not stop a normal answer',()=>{
  for(const answer of [
    'Wir sollten es erneut versuchen und danach das Ergebnis prüfen.',
    'Please try again after changing this input, then continue the next task.',
    'The rate limit calculation is part of the implementation.',
    'Die Meldung „Diese Antwort konnte nicht geladen werden“ wird hier erklärt.',
    'The text "Something went wrong" is an example, not an active error.'
  ]) {
    const f=setup(null,{modern:true});f.w.document.querySelector('[data-markdown-text-style]').textContent=answer;
    f.click('.rl-start');f.advance(7000);assert.equal(f.sends,1,answer);assert.equal(f.w.document.querySelector('.rl-stop').disabled,false);f.dom.window.close();
  }
});

test('complete concrete service failure messages still stop before sending',()=>{
  for(const answer of [
    'Something went wrong',
    'Something went wrong while generating the response. Please try again.',
    'Etwas ist schiefgelaufen. Bitte erneut versuchen.',
    'This response could not be loaded. Try again',
    'Diese Antwort konnte nicht geladen werden\nAntwort neu laden'
  ]) {
    const f=setup(null,{modern:true});f.w.document.querySelector('[data-markdown-text-style]').textContent=answer;
    f.click('.rl-start');f.advance(1500);assert.equal(f.sends,0,answer);assert.match(f.w.document.querySelector('.rl-status').textContent,/Antwortfehler/);f.dom.window.close();
  }
});

test('typed error UI in the active conversation stops even with unfamiliar wording',()=>{
  const f=setup(null,{modern:true});const failure=f.w.document.createElement('section');failure.setAttribute('data-chatgpt-selection-conversation-id','test');
  failure.innerHTML='<div data-testid="conversation-turn-error">Check the service details.</div>';f.w.document.body.append(failure);
  f.click('.rl-start');f.advance(1500);assert.equal(f.sends,0);assert.match(f.w.document.querySelector('.rl-status').textContent,/Antwortfehler/);f.dom.window.close();
});

test('offscreen errors belonging to another conversation cannot stop the active chat',()=>{
  for(const markup of [
    '<div data-testid="conversation-turn-error">Service failure</div>',
    '<div data-testid="error-message">Service failure</div>',
    '<h4 data-conversation-role="assistant">ChatGPT hat gesagt:</h4>\n<p>Diese Antwort konnte nicht geladen werden</p>'
  ]) {
    const f=setup(null,{modern:true});const background=f.w.document.createElement('section');background.setAttribute('data-chatgpt-selection-conversation-id','other');
    background.style.position='absolute';background.style.left='-10000px';background.innerHTML=markup;f.w.document.body.append(background);
    f.click('.rl-start');f.advance(7000);assert.equal(f.sends,1,markup);f.dom.window.close();
  }
});

test('a current loading failure without an assistant body is still detected',()=>{
  const f=setup(null,{modern:true});const failure=f.w.document.createElement('section');failure.setAttribute('data-chatgpt-selection-conversation-id','test');
  failure.innerHTML='<h4 data-conversation-role="assistant">ChatGPT hat gesagt:</h4>\n<p>Diese Antwort konnte nicht geladen werden</p>\n<button>Antwort neu laden</button>';
  f.w.document.body.append(failure);f.click('.rl-start');f.advance(1500);assert.equal(f.sends,0);assert.match(f.w.document.querySelector('.rl-status').textContent,/Antwortfehler/);f.dom.window.close();
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
  f.advance(9000);assert.equal(f.sends,0);assert.match(f.w.document.querySelector('.rl-status').textContent,/Pausiert/);f.dom.window.close();
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

test('endless mode continues past the numeric limit, pauses on request and resumes with the same counter',()=>{
  const f=setup();const endless=f.w.document.querySelector('#rl-endless');
  f.w.document.querySelector('#rl-limit').value='1';
  endless.checked=true;endless.dispatchEvent(new f.w.Event('change'));
  assert.equal(f.w.document.querySelector('#rl-limit').disabled,true);
  assert.match(f.w.document.querySelector('.rl-counter').textContent,/0 \/ ∞/);
  f.click('.rl-start');assert.equal(endless.disabled,true);
  f.advance(7000);assert.equal(f.sends,1);
  for(let i=2;i<=4;i++){
    f.w.document.querySelector('[data-message-author-role]').textContent='Antwort '+i;
    f.advance(1500);f.advance(13000);assert.equal(f.sends,i,'send '+i+' past the numeric limit');
  }
  assert.match(f.w.document.querySelector('.rl-counter').textContent,/4 \/ ∞/);
  f.click('.rl-stop');assert.match(f.w.document.querySelector('.rl-status').textContent,/Pausiert/);assert.equal(endless.disabled,false);
  f.w.document.querySelector('[data-message-author-role]').textContent='Antwort nach Pause';
  f.advance(20000);assert.equal(f.sends,4,'a paused loop sends nothing');
  f.click('.rl-start');f.advance(13000);assert.equal(f.sends,5);
  assert.match(f.w.document.querySelector('.rl-counter').textContent,/5 \/ ∞/);f.dom.window.close();
});

test('endless mode still stops at the requested completion marker',()=>{
  const f=setup();f.click('.rl-work');
  const endless=f.w.document.querySelector('#rl-endless');endless.checked=true;endless.dispatchEvent(new f.w.Event('change'));
  f.click('.rl-start');f.advance(7000);assert.equal(f.sends,1);
  f.w.document.querySelector('[data-message-author-role]').textContent='Ergebnis\n[RED_LOOP_FERTIG]';
  f.advance(1500);f.advance(13000);assert.equal(f.sends,1);
  assert.match(f.w.document.querySelector('.rl-status').textContent,/Auftrag abgeschlossen/);f.dom.window.close();
});

test('the in-app host starts with the work preset and endless mode and gets counter-only status',()=>{
  const f=setup(null,{modern:true,host:{app:'ios-webview',bottomInset:84}});
  assert.match(f.w.document.querySelector('#rl-prompt').value,/offen/);
  assert.equal(f.w.document.querySelector('#rl-endless').checked,true);
  assert.equal(f.w.document.querySelector('#rl-background').checked,true);
  assert.ok(f.w.document.getElementById('red-loop-root').classList.contains('rl-embedded'));
  f.w.document.hasFocus=()=>false;
  f.click('.rl-start');f.advance(7000);assert.equal(f.sends,1,'an unfocused app view still continues');
  const last=f.posted.at(-1);
  assert.equal(last.type,'state');assert.equal(last.running,true);assert.equal(last.endless,true);assert.equal(last.count,1);
  assert.ok(!JSON.stringify(f.posted).includes('offen'),'no follow-up or answer text reaches the native host');
  f.click('.rl-stop');assert.equal(f.posted.at(-1).running,false);f.dom.window.close();
});

test('an ignored host object leaves the browser defaults untouched',()=>{
  const f=setup(null,{modern:true,host:{app:'something-else'}});
  assert.equal(f.w.document.querySelector('#rl-endless').checked,false);
  assert.equal(f.w.document.querySelector('#rl-background').checked,false);
  assert.equal(f.posted.length,0);f.dom.window.close();
});

test('the shared script refuses every origin other than the ChatGPT hosts',()=>{
  for(const url of ['https://example.com/c/test','https://chatgpt.com.example.com/c/test']) {
    const dom=new JSDOM('<body><div data-message-author-role="assistant">Done</div></body>',{url,runScripts:'outside-only',pretendToBeVisual:true});
    dom.window.eval(source);
    assert.equal(dom.window.document.getElementById('red-loop-root'),null,url);dom.window.close();
  }
});

test('a suspended app resumes waiting instead of reporting a missing response',()=>{
  const f=setup(null,{modern:true,host:{app:'ios-webview'}});
  f.click('.rl-start');f.advance(7000);assert.equal(f.sends,1);
  Object.defineProperty(f.w.document,'hidden',{value:true,configurable:true});f.w.document.dispatchEvent(new f.w.Event('visibilitychange'));
  f.warp(600000);
  Object.defineProperty(f.w.document,'hidden',{value:false,configurable:true});f.w.document.dispatchEvent(new f.w.Event('visibilitychange'));
  f.advance(1500);assert.match(f.w.document.querySelector('.rl-status').textContent,/Warte auf neue Antwort/);
  f.w.document.querySelector('[data-markdown-text-style]').textContent='Antwort nach Rückkehr';
  f.advance(1500);f.advance(13000);assert.equal(f.sends,2);f.dom.window.close();
});

test('the Android host is accepted and receives the same state as JSON text',()=>{
  const f=setup(null,{modern:true,host:{app:'android-webview',bottomInset:0},android:true});
  assert.equal(f.w.document.querySelector('#rl-endless').checked,true);
  assert.equal(f.w.document.querySelector('#rl-background').checked,true);
  assert.ok(f.w.document.getElementById('red-loop-root').classList.contains('rl-embedded'));
  f.w.document.hasFocus=()=>false;
  f.click('.rl-start');f.advance(7000);assert.equal(f.sends,1);
  const last=f.posted.at(-1);
  assert.equal(typeof last,'string','the Android interface takes a string');
  const parsed=JSON.parse(last);
  assert.equal(parsed.type,'state');assert.equal(parsed.running,true);assert.equal(parsed.endless,true);assert.equal(parsed.count,1);
  assert.ok(!last.includes('offen'),'no follow-up or answer text reaches the native host');
  f.dom.window.close();
});

test('the panel can be dragged, stays on screen and remembers where it was put',()=>{
  const f=setup(null,{modern:true});
  const root=f.w.document.getElementById('red-loop-root');
  const head=root.querySelector('.rl-head');
  root.getBoundingClientRect=()=>({left:parseFloat(root.style.left)||0,top:parseFloat(root.style.top)||0,width:290,height:400});
  head.setPointerCapture=()=>{};
  const pointer=(type,x,y)=>{const e=new f.w.Event(type,{bubbles:true});e.pointerId=1;e.button=0;e.clientX=x;e.clientY=y;head.dispatchEvent(e);};
  pointer('pointerdown',20,20);pointer('pointermove',220,320);pointer('pointerup',220,320);
  assert.equal(root.style.left,'200px');assert.equal(root.style.top,'300px');
  assert.equal(root.style.right,'auto');
  const saved=JSON.parse(f.w.localStorage.getItem('red-loop:v1:panel-position'));
  assert.deepEqual(saved,{left:200,top:300});
  // Dragging far outside keeps it reachable.
  pointer('pointerdown',210,310);pointer('pointermove',99999,99999);pointer('pointerup',99999,99999);
  assert.ok(parseFloat(root.style.left)<=f.w.innerWidth,'stays inside the viewport');
  assert.ok(parseFloat(root.style.top)<=f.w.innerHeight,'stays inside the viewport');
  f.dom.window.close();
});

test('a click on the header buttons still works and is not treated as a drag',()=>{
  const f=setup(null,{modern:true});
  const root=f.w.document.getElementById('red-loop-root');
  const head=root.querySelector('.rl-head');
  head.setPointerCapture=()=>{};
  const down=new f.w.Event('pointerdown',{bubbles:true});
  down.pointerId=1;down.button=0;down.clientX=5;down.clientY=5;
  root.querySelector('.rl-collapse').dispatchEvent(down);
  f.click('.rl-collapse');
  assert.ok(root.classList.contains('rl-min'),'the collapse button still collapses');
  assert.equal(root.style.left,'','a button press never moves the panel');
  f.dom.window.close();
});

test('the automatic start begins by itself once an answer is finished and stable',()=>{
  const f=setup(null,{modern:true});
  const auto=f.w.document.querySelector('#rl-autostart');
  auto.checked=true;auto.dispatchEvent(new f.w.Event('change'));
  assert.equal(f.w.document.querySelector('.rl-stop').disabled,true,'nothing runs yet');
  f.advance(1500);assert.equal(f.sends,0,'an answer that just appeared is not acted on');
  f.advance(7000);
  assert.equal(f.w.document.querySelector('.rl-stop').disabled,false,'started without a click');
  f.advance(7000);assert.deepEqual(f.sent.length,1);
  f.dom.window.close();
});

test('a pause the user asked for is never undone by the automatic start',()=>{
  const f=setup(null,{modern:true});
  const auto=f.w.document.querySelector('#rl-autostart');
  auto.checked=true;auto.dispatchEvent(new f.w.Event('change'));
  f.advance(1500);f.advance(7000);f.advance(7000);assert.equal(f.sends,1);
  f.click('.rl-stop');
  f.w.document.querySelector('[data-markdown-text-style]').textContent='Eine neue fertige Antwort';
  for(let i=0;i<6;i++) f.advance(20000);
  assert.equal(f.sends,1,'stays paused');
  assert.equal(f.w.document.querySelector('.rl-stop').disabled,true);
  f.dom.window.close();
});

test('a completion marker is not undone by the automatic start either',()=>{
  const f=setup();f.click('.rl-work');
  const auto=f.w.document.querySelector('#rl-autostart');
  auto.checked=true;auto.dispatchEvent(new f.w.Event('change'));
  f.advance(1500);f.advance(7000);f.advance(7000);assert.equal(f.sends,1);
  f.w.document.querySelector('[data-message-author-role]').textContent='Ergebnis\n[RED_LOOP_FERTIG]';
  f.advance(1500);f.advance(13000);
  assert.match(f.w.document.querySelector('.rl-status').textContent,/Auftrag abgeschlossen/);
  for(let i=0;i<6;i++) f.advance(20000);
  assert.equal(f.sends,1,'a finished assignment stays finished');
  f.dom.window.close();
});

test('a recoverable error is bridged up to three times, then the loop gives up',()=>{
  const f=setup(null,{modern:true});
  const retry=f.w.document.querySelector('#rl-retry');
  retry.checked=true;retry.dispatchEvent(new f.w.Event('change'));
  f.click('.rl-start');f.advance(7000);assert.equal(f.sends,1);
  for(let attempt=1;attempt<=3;attempt++){
    f.advance(95000);
    assert.match(f.w.document.querySelector('.rl-status').textContent,new RegExp('Versuch '+attempt+'/3'),'attempt '+attempt+' announced');
    f.advance(21000);
    assert.equal(f.w.document.querySelector('.rl-stop').disabled,false,'running again on attempt '+attempt);
  }
  f.advance(95000);
  const status=f.w.document.querySelector('.rl-status').textContent;
  assert.match(status,/Keine neue Antwort/);
  assert.doesNotMatch(status,/Versuch/,'the budget is spent');
  assert.equal(f.w.document.querySelector('.rl-stop').disabled,true);
  assert.equal(f.sends,1,'bridging never sends twice for one answer');
  f.dom.window.close();
});

test('a draft is never bridged, however often the retry option is on',()=>{
  const f=setup(null,{modern:true});
  const retry=f.w.document.querySelector('#rl-retry');
  retry.checked=true;retry.dispatchEvent(new f.w.Event('change'));
  const button=f.w.document.querySelector('button[aria-label="Senden"]');button.disabled=true;
  f.click('.rl-start');f.advance(7000);
  f.w.document.querySelector('[data-composer-markdown]').textContent='Mein eigener Text';
  button.disabled=false;f.advance(1500);
  assert.match(f.w.document.querySelector('.rl-status').textContent,/Entwurf geändert/);
  assert.doesNotMatch(f.w.document.querySelector('.rl-status').textContent,/Versuch/);
  for(let i=0;i<4;i++) f.advance(21000);
  assert.equal(f.sends,0);
  assert.equal(f.w.document.querySelector('[data-composer-markdown]').textContent,'Mein eigener Text');
  f.dom.window.close();
});

test('the native host can preselect both automatic options',()=>{
  const f=setup(null,{modern:true,host:{app:'android-webview',autoStart:true,autoRetry:true},android:true});
  assert.equal(f.w.document.querySelector('#rl-autostart').checked,true);
  assert.equal(f.w.document.querySelector('#rl-retry').checked,true);
  const plain=setup(null,{modern:true,host:{app:'android-webview'},android:true});
  assert.equal(plain.w.document.querySelector('#rl-autostart').checked,false,'off unless the host asks');
  assert.equal(plain.w.document.querySelector('#rl-retry').checked,false);
  f.dom.window.close();plain.dom.window.close();
});

test('a used up quota waits instead of burning the retry budget',()=>{
  const f=setup(null,{modern:true});
  const retry=f.w.document.querySelector('#rl-retry');retry.checked=true;retry.dispatchEvent(new f.w.Event('change'));
  f.click('.rl-start');f.advance(7000);assert.equal(f.sends,1);
  f.w.document.querySelector('[data-markdown-text-style]').textContent='You have reached your GPT-4 limit.';
  f.advance(1500);
  const waiting=f.w.document.querySelector('.rl-status').textContent;
  assert.match(waiting,/Kontingent erschöpft/);
  assert.match(waiting,/wartet 10 Min \(1\/12\)/);
  assert.doesNotMatch(waiting,/Versuch/,'the fault budget stays untouched');
  f.advance(300000);
  assert.equal(f.w.document.querySelector('.rl-stop').disabled,true,'five minutes is too early');
  f.w.document.querySelector('[data-markdown-text-style]').textContent='Wieder da, hier der nächste Schritt.';
  f.advance(310000);
  assert.equal(f.w.document.querySelector('.rl-stop').disabled,false,'carries on after the wait');
  f.dom.window.close();
});

test('a quota notice stops cleanly when bridging is off',()=>{
  for(const notice of ['Rate limit exceeded','Too many requests','Du hast zu viele Nachrichten gesendet.']) {
    const f=setup(null,{modern:true});
    f.w.document.querySelector('[data-markdown-text-style]').textContent=notice;
    f.click('.rl-start');f.advance(1500);
    assert.equal(f.sends,0,notice);
    assert.match(f.w.document.querySelector('.rl-status').textContent,/Kontingent erschöpft/,notice);
    assert.equal(f.w.document.querySelector('.rl-stop').disabled,true);
    f.dom.window.close();
  }
});

test('a long answer that is still being written is not mistaken for a stall',()=>{
  const f=setup(null,{modern:true});
  f.click('.rl-start');f.advance(7000);assert.equal(f.sends,1);
  const generating=f.w.document.createElement('button');
  generating.setAttribute('aria-label','Stoppen');
  f.w.document.querySelector('form').append(generating);
  // Far past the 90 second window that would otherwise call this a stall.
  for(let i=0;i<8;i++) f.advance(20000);
  assert.equal(f.w.document.querySelector('.rl-stop').disabled,false,'still running after 160 s of writing');
  assert.match(f.w.document.querySelector('.rl-status').textContent,/antwortet/);
  generating.remove();
  f.w.document.querySelector('[data-markdown-text-style]').textContent='Die lange Antwort ist fertig.';
  f.advance(1500);f.advance(13000);
  assert.equal(f.sends,2,'and continues once the answer is done');
  f.dom.window.close();
});
