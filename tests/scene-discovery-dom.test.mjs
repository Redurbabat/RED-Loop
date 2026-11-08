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

test('homepage renders all 12 original studies with working deep links and category filters',()=>{
  const {dom,doc,discovery}=createPage();
  try{
    const all=doc.querySelectorAll('#scene-discovery-results a[data-scene]');
    assert.equal(all.length,12);
    const previews=doc.querySelectorAll('#scene-discovery-results canvas[data-scene]');
    assert.equal(previews.length,12,'each link has a decorative static Canvas preview');
    for(const canvas of previews){
      assert.equal(canvas.dataset.scene,canvas.closest('a[data-scene]').dataset.scene);
      assert.equal(canvas.getAttribute('aria-hidden'),'true');
    }
    assert.equal(doc.querySelector('#scene-discovery-count').textContent,'12 Komponenten gefunden');
    assert.equal(all[0].getAttribute('href'),'/motion-studio.html?scene=spectral-fold');
    assert.equal(doc.querySelectorAll('#scene-discovery-filters button[data-category]').length,5);
    const category=doc.querySelector('#scene-discovery-filters button[data-category="Material"]');
    category.click();
    assert.equal(discovery.category,'Material');
    assert.equal(category.getAttribute('aria-pressed'),'true');
    assert.equal(doc.querySelectorAll('#scene-discovery-results a[data-scene]').length,4);
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
    assert.equal(results.querySelectorAll('a[data-scene]').length,12);
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
    assert.equal(dom.window.document.querySelectorAll('#scene-discovery-results a').length,12);
    dom.window.document.querySelector('#scene-discovery-filters button[data-category="Gemerkte"]').click();
    assert.equal(dom.window.document.querySelectorAll('#scene-discovery-results a').length,0);
  }finally{dom.window.close();}
});

test('homepage bookmark control saves a scene without navigating or nesting buttons in links',()=>{
  const {dom,doc}=createPage();
  try{
    const root=doc.getElementById('scene-discovery-results');
    let button=doc.querySelector('#scene-discovery-results button[data-bookmark="vector-bloom"]');
    assert.equal(button.getAttribute('aria-pressed'),'false');
    assert.equal(button.closest('a'),null,'bookmark must be outside the scene link');
    assert.equal(button.getBoundingClientRect().width>=0,true);
    button.focus();
    button.click();
    assert.deepEqual(JSON.parse(dom.window.localStorage.getItem(motionFavoritesStorageKey)),['vector-bloom']);
    button=doc.querySelector('#scene-discovery-results button[data-bookmark="vector-bloom"]');
    assert.equal(doc.activeElement,button,'bookmark stays keyboard-focused after sorting');
    assert.equal(button.getAttribute('aria-pressed'),'true');
    assert.match(button.getAttribute('aria-label'),/aus Favoriten entfernen/);
    assert.equal(root.querySelector('a[data-scene]').dataset.scene,'vector-bloom');
    assert.equal(root.querySelector('a[data-scene="vector-bloom"]').getAttribute('href'),
      '/motion-studio.html?scene=vector-bloom');
    assert.match(doc.getElementById('scene-discovery-feedback').textContent,/lokal gemerkt/);

    doc.querySelector('#scene-discovery-filters button[data-category="Gemerkte"]').click();
    assert.equal(root.querySelectorAll('a[data-scene]').length,1);
    button=doc.querySelector('#scene-discovery-results button[data-bookmark="vector-bloom"]');
    button.focus();
    button.click();
    assert.equal(dom.window.localStorage.getItem(motionFavoritesStorageKey),null);
    assert.equal(root.querySelectorAll('a[data-scene]').length,0);
    assert.equal(doc.activeElement,doc.getElementById('scene-discovery-search'),
      'removing the focused last favorite returns focus to search');
    assert.match(doc.getElementById('scene-discovery-feedback').textContent,/aus Favoriten entfernt/);
  }finally{dom.window.close();}
});

test('homepage bookmark controls remain usable if the storage getter is blocked',()=>{
  const html=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
  const dom=new JSDOM(html,{url:'https://red-loop.example/'});
  try{
    Object.defineProperty(dom.window,'localStorage',{configurable:true,get(){throw Error('denied')}});
    const app=initMotionDiscovery(dom.window.document);
    const button=dom.window.document.querySelector('#scene-discovery-results button[data-bookmark="iris-caustics"]');
    button.click();
    assert.equal(app.favorites.has('iris-caustics'),true);
    assert.match(dom.window.document.getElementById('scene-discovery-feedback').textContent,/in dieser Sitzung gemerkt/);
    dom.window.document.querySelector('#scene-discovery-filters button[data-category="Gemerkte"]').click();
    assert.equal(dom.window.document.querySelectorAll('#scene-discovery-results a[data-scene]').length,1);
  }finally{dom.window.close();}
});

test('homepage compares two original scenes without navigating, saving data or rebuilding gallery',()=>{
  const {dom,doc,discovery}=createPage();
  try{
    const panel=doc.getElementById('scene-discovery-comparison');
    const comparisonItems=doc.getElementById('scene-discovery-comparison-items');
    const results=doc.getElementById('scene-discovery-results');
    const first=doc.querySelector('button[data-compare="aurora-threads"]');
    const second=doc.querySelector('button[data-compare="mercury-droplets"]');
    const originalCard=doc.querySelector('a[data-scene="spectral-fold"]');
    assert.equal(panel.hidden,true);
    assert.equal(first.closest('a'),null,'compare action must not be nested inside link');
    first.focus();
    first.click();
    assert.deepEqual(discovery.comparison,['aurora-threads']);
    assert.equal(doc.activeElement,first,'selection keeps compare button focus');
    assert.equal(first.getAttribute('aria-pressed'),'true');
    assert.equal(panel.hidden,false);
    assert.equal(comparisonItems.querySelectorAll('canvas[data-scene]').length,1);
    assert.equal(doc.querySelector('.scene-comparison-placeholder')!==null,true);
    assert.equal(doc.querySelector('a[data-scene="spectral-fold"]'),originalCard,
      'comparison should not rebuild gallery thumbnails');
    assert.equal(dom.window.localStorage.length,0,'compare does not store anything');

    second.click();
    assert.deepEqual(discovery.comparison,['aurora-threads','mercury-droplets']);
    assert.equal(doc.getElementById('scene-discovery-comparison-count').textContent,'2 / 2');
    const previews=comparisonItems.querySelectorAll('canvas[data-scene]');
    assert.deepEqual([...previews].map(canvas=>canvas.dataset.scene),
      ['aurora-threads','mercury-droplets']);
    assert.equal([...previews].every(canvas=>canvas.getAttribute('aria-hidden')==='true'),true);
    assert.deepEqual([...comparisonItems.querySelectorAll('a[href]')].map(link=>link.getAttribute('href')),
      ['/motion-studio.html?scene=aurora-threads','/motion-studio.html?scene=mercury-droplets']);
    assert.equal(doc.querySelector('.scene-comparison-placeholder'),null);
    assert.equal(results.querySelectorAll('button[data-compare]').length,12);
    assert.equal(dom.window.localStorage.length,0);
  }finally{dom.window.close();}
});

test('comparison replaces oldest selection and restores focus after removal and clearing',()=>{
  const {dom,doc,discovery}=createPage();
  try{
    const choose=id=>doc.querySelector('button[data-compare="'+id+'"]');
    choose('aurora-threads').click();
    choose('mercury-droplets').click();
    choose('prism-veil').focus();
    choose('prism-veil').click();
    assert.deepEqual(discovery.comparison,['mercury-droplets','prism-veil']);
    assert.equal(doc.activeElement,choose('prism-veil'),'third selection keeps focus');
    assert.equal(choose('aurora-threads').getAttribute('aria-pressed'),'false');
    assert.equal(choose('prism-veil').getAttribute('aria-pressed'),'true');
    assert.match(doc.getElementById('scene-discovery-feedback').textContent,/ersetzt.*im Vergleich/);
    // Filtering cannot discard a comparison already selected.
    doc.querySelector('button[data-category="Partikel"]').click();
    assert.deepEqual(discovery.comparison,['mercury-droplets','prism-veil']);

    doc.querySelector('button[data-remove-compare="mercury-droplets"]').click();
    assert.deepEqual(discovery.comparison,['prism-veil']);
    assert.equal(doc.activeElement,doc.getElementById('scene-discovery-search'),
      'filtered-out comparison control returns focus to search');
    doc.getElementById('scene-discovery-comparison-clear').click();
    assert.deepEqual(discovery.comparison,[]);
    assert.equal(doc.getElementById('scene-discovery-comparison').hidden,true);
    assert.equal(doc.activeElement,doc.getElementById('scene-discovery-search'));
    assert.match(doc.getElementById('scene-discovery-feedback').textContent,/gelöscht/);
    assert.equal(dom.window.localStorage.length,0);
  }finally{dom.window.close();}
});

test('homepage opens canonical integration code without navigation or gallery replacement',()=>{
  const {dom,doc,discovery}=createPage();
  try{
    const open=doc.querySelector('button[data-usage="mercury-droplets"]');
    const original=doc.querySelector('a[data-scene="spectral-fold"]');
    const panel=doc.getElementById('scene-discovery-usage');
    const text=doc.getElementById('scene-discovery-usage-text');
    assert.equal(panel.hidden,true);
    assert.equal(open.closest('a'),null,'code action must not be nested inside a link');
    open.click();
    assert.equal(discovery.usageScene,'mercury-droplets');
    assert.equal(panel.hidden,false);
    assert.equal(open.getAttribute('aria-expanded'),'true');
    assert.equal(doc.activeElement,doc.getElementById('scene-discovery-usage-source'));
    assert.match(text.textContent,/scene: 'mercury-droplets'/);
    assert.match(text.textContent,/density: 58, depth: 58, speed: 42, hue: 340/);
    assert.match(text.textContent,/createMotionEngine/);
    assert.equal(doc.querySelector('a[data-scene="spectral-fold"]'),original,
      'opening integration code does not rebuild existing gallery thumbnails');
    assert.equal(dom.window.localStorage.length,0,'source display saves no user data');

    doc.querySelector('button[data-usage="aurora-threads"]').click();
    assert.match(text.textContent,/scene: 'aurora-threads'/);
    assert.doesNotMatch(text.textContent,/mercury-droplets/);
    assert.equal(open.getAttribute('aria-expanded'),'false');
    doc.getElementById('scene-discovery-usage-close').click();
    assert.equal(panel.hidden,true);
    assert.equal(discovery.usageScene,null);
    assert.equal(doc.activeElement,doc.querySelector('button[data-usage="aurora-threads"]'),
      'closing restores focus to the button that opened the inspector');
  }finally{dom.window.close();}
});

test('usage inspector remains readable if the selected card is filtered away',()=>{
  const {dom,doc}=createPage();
  try{
    doc.querySelector('button[data-usage="mercury-droplets"]').click();
    doc.querySelector('button[data-category="Partikel"]').click();
    assert.equal(doc.getElementById('scene-discovery-usage').hidden,false);
    assert.match(doc.getElementById('scene-discovery-usage-text').textContent,/mercury-droplets/);
    doc.getElementById('scene-discovery-usage-close').click();
    assert.equal(doc.activeElement,doc.getElementById('scene-discovery-search'),
      'closing after filtering restores focus to search');
  }finally{dom.window.close();}
});

test('canonical snippet copy handles success and unavailable Clipboard API',async()=>{
  const {dom,doc}=createPage();
  try{
    const open=doc.querySelector('button[data-usage="aurora-threads"]');
    open.click();
    const source=doc.getElementById('scene-discovery-usage-text');
    const feedback=doc.getElementById('scene-discovery-feedback');
    const button=doc.getElementById('scene-discovery-usage-copy');
    let copied=null;
    Object.defineProperty(dom.window.navigator,'clipboard',{configurable:true,value:{
      writeText:async value=>{copied=value},
    }});
    button.click();
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(copied,source.textContent);
    assert.match(feedback.textContent,/Aurora Threads kopiert/);
    Object.defineProperty(dom.window.navigator,'clipboard',{configurable:true,value:{
      writeText:async()=>{throw new Error('Clipboard denied')},
    }});
    button.click();
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.match(feedback.textContent,/Kopieren nicht verfügbar/);
    assert.equal(doc.activeElement,doc.getElementById('scene-discovery-usage-source'));
    assert.equal(doc.getElementById('scene-discovery-usage').hidden,false);
  }finally{dom.window.close();}
});

test('homepage downloads the original starter ZIP without leaving the catalog',async()=>{
  const {dom,doc}=createPage();
  try{
    doc.querySelector('button[data-usage="mercury-droplets"]').click();
    const engine=readFileSync(new URL('../web/motion-engine.js',import.meta.url),'utf8');
    const calls=[],urls=[],scheduled=[];
    dom.window.fetch=async (url,options)=>{
      calls.push({url,options});
      return {ok:true,text:async()=>engine};
    };
    dom.window.URL.createObjectURL=blob=>{
      urls.push({blob});
      return 'blob:starter-download';
    };
    dom.window.URL.revokeObjectURL=url=>urls.push({revoked:url});
    dom.window.setTimeout=callback=>{scheduled.push(callback);return 1};
    const originalClick=dom.window.HTMLAnchorElement.prototype.click;
    let downloaded=null;
    dom.window.HTMLAnchorElement.prototype.click=function(){
      downloaded={href:this.href,name:this.download,connected:this.isConnected};
    };
    try{
      const download=doc.getElementById('scene-discovery-usage-download');
      assert.equal(download.disabled,false);
      download.click();
      await new Promise(resolve=>setTimeout(resolve,0));
      assert.deepEqual(calls,[{url:'/motion-engine.js',options:{credentials:'same-origin',cache:'no-store'}}]);
      assert.equal(downloaded.name,'red-morph-mercury-droplets-starter.zip');
      assert.equal(downloaded.connected,true);
      assert.equal(downloaded.href,'blob:starter-download');
      assert.equal(urls[0].blob.type,'application/zip');
      assert.ok(urls[0].blob.size>25000);
      assert.equal(download.disabled,false);
      assert.equal(download.hasAttribute('aria-busy'),false);
      assert.match(doc.getElementById('scene-discovery-feedback').textContent,/Starterpaket für Mercury Droplets zum Download vorbereitet/);
      assert.equal(doc.getElementById('scene-discovery-usage').hidden,false);
      assert.equal(scheduled.length,1,'object URL is scheduled for release');
      scheduled[0]();
      assert.equal(urls[1].revoked,'blob:starter-download');
    }finally{dom.window.HTMLAnchorElement.prototype.click=originalClick}
  }finally{dom.window.close();}
});

test('failed starter download keeps code readable and restores enabled controls',async()=>{
  const {dom,doc}=createPage();
  try{
    doc.querySelector('button[data-usage="aurora-threads"]').click();
    dom.window.fetch=async()=>({ok:false,status:503});
    const download=doc.getElementById('scene-discovery-usage-download');
    download.click();
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(download.disabled,false);
    assert.equal(download.hasAttribute('aria-busy'),false);
    assert.equal(download.textContent,'Starterpaket (.zip)');
    assert.match(doc.getElementById('scene-discovery-feedback').textContent,/Starterpaket konnte nicht erstellt werden/);
    assert.equal(doc.getElementById('scene-discovery-usage').hidden,false);
    assert.match(doc.getElementById('scene-discovery-usage-text').textContent,/scene: 'aurora-threads'/);
  }finally{dom.window.close();}
});

test('starter export keeps scene identity even if user switches scenes mid-download',async()=>{
  const {dom,doc}=createPage();
  try{
    doc.querySelector('button[data-usage="aurora-threads"]').click();
    let resolveResponse;
    const engine=readFileSync(new URL('../web/motion-engine.js',import.meta.url),'utf8');
    let fetches=0;
    dom.window.fetch=()=>{
      fetches++;
      return new Promise(resolve=>resolveResponse=resolve);
    };
    dom.window.URL.createObjectURL=()=> 'blob:captured';
    dom.window.URL.revokeObjectURL=()=>{};
    dom.window.setTimeout=()=>1;
    const originalClick=dom.window.HTMLAnchorElement.prototype.click;
    let name=null;
    dom.window.HTMLAnchorElement.prototype.click=function(){name=this.download};
    try{
      const download=doc.getElementById('scene-discovery-usage-download');
      download.click();
      assert.equal(download.disabled,true);
      assert.equal(download.getAttribute('aria-busy'),'true');
      download.click();
      assert.equal(fetches,1,'a second click cannot start a duplicate ZIP');
      doc.querySelector('button[data-usage="mercury-droplets"]').click();
      resolveResponse({ok:true,text:async()=>engine});
      await new Promise(resolve=>setTimeout(resolve,0));
      assert.equal(name,'red-morph-aurora-threads-starter.zip',
        'download label remains tied to the scene selected at click time');
      assert.match(doc.getElementById('scene-discovery-feedback').textContent,/Starterpaket für Aurora Threads/);
      assert.match(doc.getElementById('scene-discovery-usage-text').textContent,/mercury-droplets/,
        'changing the visible scene remains possible during export');
      assert.equal(download.disabled,false);
    }finally{dom.window.HTMLAnchorElement.prototype.click=originalClick}
  }finally{dom.window.close();}
});
