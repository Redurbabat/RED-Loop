import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {initMotionDiscovery} from '../web/scene-discovery.js';
import {motionFavoritesStorageKey} from '../web/motion-favorites.js';

function createPage(bookmarks=[]){
  const html=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
  const dom=new JSDOM(html,{url:'https://red-loop.example/'});
  if(bookmarks.length)dom.window.localStorage.setItem(motionFavoritesStorageKey,JSON.stringify(bookmarks));
  const discovery=initMotionDiscovery(dom.window.document);
  return {dom,discovery,doc:dom.window.document};
}
function type(dom,input,value){
  input.value=value;
  input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
}
function key(dom,element,value){
  const event=new dom.window.KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true});
  element.dispatchEvent(event);
  return event.defaultPrevented;
}

test('homepage renders all 10 original studies with working deep links and category filters',()=>{
  const {dom,doc,discovery}=createPage();
  try{
    const all=doc.querySelectorAll('#scene-discovery-results a[data-scene]');
    assert.equal(all.length,10);
    assert.equal(doc.querySelector('#scene-discovery-count').textContent,'10 Komponenten gefunden');
    assert.equal(all[0].getAttribute('href'),'/motion-studio.html?scene=spectral-fold');
    assert.equal(doc.querySelectorAll('#scene-discovery-filters button[data-category]').length,5);
    const category=doc.querySelector('#scene-discovery-filters button[data-category="Material"]');
    category.click();
    assert.equal(discovery.category,'Material');
    assert.equal(category.getAttribute('aria-pressed'),'true');
    assert.equal(doc.querySelectorAll('#scene-discovery-results a[data-scene]').length,3);
  }finally{dom.window.close();}
});

test('homepage search is keyboard-first and reset recovers from no matches',()=>{
  const {dom,doc}=createPage();
  try{
    const input=doc.getElementById('scene-discovery-search');
    const results=doc.getElementById('scene-discovery-results');
    type(dom,input,'Iris Caustics');
    const links=results.querySelectorAll('a[data-scene]');
    assert.equal(links.length,1);
    assert.equal(links[0].dataset.scene,'iris-caustics');
    assert.equal(doc.getElementById('scene-discovery-count').textContent,'1 Komponente gefunden');
    input.focus();
    assert.equal(key(dom,input,'ArrowDown'),true);
    assert.equal(doc.activeElement,links[0]);
    assert.equal(key(dom,results,'Home'),false,'only actual result focus triggers list handling');
    assert.equal(key(dom,links[0],'ArrowUp'),true);
    assert.equal(doc.activeElement,input);

    type(dom,input,'not-a-real-material');
    assert.equal(results.children.length,0);
    assert.equal(doc.getElementById('scene-discovery-empty').hidden,false);
    assert.equal(doc.getElementById('scene-discovery-count').textContent,'0 Komponenten gefunden');
    input.focus();
    assert.equal(key(dom,input,'ArrowDown'),false);
    assert.equal(doc.activeElement,input);
    doc.getElementById('scene-discovery-reset').click();
    assert.equal(input.value,'');
    assert.equal(doc.activeElement,input);
    assert.equal(results.querySelectorAll('a[data-scene]').length,10);
    assert.equal(doc.getElementById('scene-discovery-empty').hidden,true);
  }finally{dom.window.close();}
});

test('saved components are shown first and remote bookmark changes update without reload',()=>{
  const {dom,doc}=createPage(['vector-bloom']);
  try{
    const list=doc.getElementById('scene-discovery-results');
    assert.equal(list.querySelector('a[data-scene]').dataset.scene,'vector-bloom');
    const saved=doc.querySelector('#scene-discovery-filters button[data-category="Gemerkte"]');
    assert.match(saved.textContent,/Gemerkte \(1\)/);
    saved.click();
    assert.equal(list.querySelectorAll('a[data-scene]').length,1);
    assert.equal(list.querySelector('a[data-scene]').dataset.scene,'vector-bloom');
    const oldCard=list.querySelector('a[data-scene]');
    oldCard.focus();
    dom.window.localStorage.setItem(motionFavoritesStorageKey,JSON.stringify(['iris-caustics']));
    dom.window.dispatchEvent(new dom.window.StorageEvent('storage',{
      key:motionFavoritesStorageKey,
      storageArea:dom.window.localStorage,
      newValue:JSON.stringify(['iris-caustics']),
    }));
    assert.equal(list.querySelectorAll('a[data-scene]').length,1);
    assert.equal(list.querySelector('a[data-scene]').dataset.scene,'iris-caustics');
    assert.equal(doc.activeElement,doc.getElementById('scene-discovery-search'));
    assert.match(saved.textContent,/Gemerkte \(1\)/);
    dom.window.localStorage.clear();
    dom.window.dispatchEvent(new dom.window.StorageEvent('storage',{
      key:null,storageArea:dom.window.localStorage,newValue:null,
    }));
    assert.equal(list.querySelectorAll('a[data-scene]').length,0);
    assert.match(saved.textContent,/Gemerkte \(0\)/);
  }finally{dom.window.close();}
});

test('private-mode storage failures cannot block homepage discoverability',()=>{
  const html=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
  const dom=new JSDOM(html,{url:'https://red-loop.example/'});
  try{
    Object.defineProperty(dom.window,'localStorage',{configurable:true,get(){throw new Error('storage disabled')}});
    initMotionDiscovery(dom.window.document);
    assert.equal(dom.window.document.querySelectorAll('#scene-discovery-results a').length,10);
    dom.window.document.querySelector('#scene-discovery-filters button[data-category="Gemerkte"]').click();
    assert.equal(dom.window.document.querySelectorAll('#scene-discovery-results a').length,0);
  }finally{dom.window.close();}
});
