import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMotionEngine,scenes} from '../web/motion-engine.js';

test('ten unique original materials with descriptive metadata',()=>{
  assert.equal(scenes.length,10);
  assert.equal(new Set(scenes.map(item=>item.id)).size,10);
  for(const scene of scenes){
    assert.ok(scene.name && scene.category && scene.description.length>25);
    assert.ok(Array.isArray(scene.tags) && scene.tags.length>=3);
  }
});

test('studio HTML has core landmarks, accessible controls and no inline scripts',()=>{
  const html=readFileSync(new URL('../web/motion-studio.html',import.meta.url),'utf8');
  assert.match(html,/<main\b[^>]*id="ui-loop-content"/);
  assert.match(html,/<nav\b[^>]*aria-label="Motion-Komponenten"/);
  assert.match(html,/<canvas\b[^>]*role="img"/);
  assert.match(html,/id="ui-loop-play"/);
  assert.match(html,/id="ui-loop-search"/);
  assert.match(html,/id="ui-loop-backdrop"[^>]+tabindex="-1" hidden/);
  assert.match(html,/id="ui-loop-sidebar-close"/);
  assert.match(html,/id="ui-loop-code-panel"/);
  assert.match(html,/id="ui-loop-save-image"/);
  assert.match(html,/id="ui-loop-result-count">10/);
    for(const mode of ['macbook','windows','tablet','iphone','android']) assert.match(html,new RegExp('data-device="'+mode+'"'));
  assert.doesNotMatch(html,/<script(?![^>]*src=)[^>]*>/i);
});

test('render engine is idle by default, clamps settings, and respects reduced motion',()=>{
  const old={window:globalThis.window,document:globalThis.document,ResizeObserver:globalThis.ResizeObserver,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};
  const windowEvents=new Map(),documentEvents=new Map(),mediaEvents=new Map();
  const media={matches:false,addEventListener:(k,fn)=>mediaEvents.set(k,fn),removeEventListener:k=>mediaEvents.delete(k)};
  const context=new Proxy({}, {get(target,key){
    if(key==='createRadialGradient')return ()=>({addColorStop(){}});
    return target[key]??(()=>{});
  },set(target,key,value){target[key]=value;return true;}});
  const canvas={width:0,height:0,getContext:()=>context,getBoundingClientRect:()=>({width:480,height:300,left:0,top:0}),addEventListener(){},removeEventListener(){}};
  const pending=new Map();let n=0;
  globalThis.window={devicePixelRatio:2,matchMedia:()=>media,addEventListener:(k,fn)=>windowEvents.set(k,fn),removeEventListener:k=>windowEvents.delete(k)};
  globalThis.document={hidden:false,addEventListener:(k,fn)=>documentEvents.set(k,fn),removeEventListener:k=>documentEvents.delete(k)};
  globalThis.ResizeObserver=class {observe(){} disconnect(){}};
  globalThis.requestAnimationFrame=callback=>{const id=++n;pending.set(id,callback);return id};
  globalThis.cancelAnimationFrame=id=>pending.delete(id);
  try{
    const engine=createMotionEngine(canvas);
    assert.equal(engine.running,false);
    assert.deepEqual([canvas.width,canvas.height],[960,600]);
    engine.configure({density:110,depth:-8,speed:300,hue:499,scene:'signal-matrix'});
    assert.equal(engine.settings.density,90);
    assert.equal(engine.settings.depth,0);
    assert.equal(engine.settings.speed,100);
    assert.equal(engine.settings.hue,360);
    assert.equal(engine.settings.scene,'signal-matrix');
    assert.equal(engine.setPlaying(true),true);
    assert.equal(engine.running,true);
    media.matches=true;
    mediaEvents.get('change')();
    assert.equal(engine.running,false);
    assert.equal(engine.setPlaying(true),false);
    media.matches=false;
    assert.equal(engine.setPlaying(true),true);
    globalThis.document.hidden=true;
    documentEvents.get('visibilitychange')();
    assert.equal(engine.running,false);
    engine.destroy();
    assert.equal(documentEvents.size,0);
    assert.equal(mediaEvents.size,0);
  } finally {
    for(const [name,value] of Object.entries(old)){
      if(value===undefined)delete globalThis[name];else globalThis[name]=value;
    }
  }
});

test('all studies draw at idle, observe safe memory cap and release queued frames',()=>{
  const old={window:globalThis.window,document:globalThis.document,ResizeObserver:globalThis.ResizeObserver,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};
  let width=480,height=300,drawCalls=0,serial=0;const raf=new Map();
  const listeners=new Map();
  const context=new Proxy({}, {get(target,key){
    if(key==='createRadialGradient')return ()=>({addColorStop(){}});
    if(key==='fill'||key==='stroke')return ()=>{drawCalls++};
    return target[key]??(()=>{});
  },set(target,key,value){target[key]=value;return true;}});
  const canvas={width:0,height:0,getContext:()=>context,getBoundingClientRect:()=>({width,height,left:0,top:0}),addEventListener:(k,fn)=>listeners.set(k,fn),removeEventListener:k=>listeners.delete(k)};
  globalThis.window={devicePixelRatio:3,matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}})};
  globalThis.document={hidden:false,addEventListener(){},removeEventListener(){}};
  globalThis.ResizeObserver=class {observe(){} disconnect(){}};
  globalThis.requestAnimationFrame=fn=>{const id=++serial;raf.set(id,fn);return id};
  globalThis.cancelAnimationFrame=id=>raf.delete(id);
  function next(){const snapshot=[...raf];raf.clear();for(const [,fn] of snapshot)fn(1000)}
  try {
    const engine=createMotionEngine(canvas);
    assert.equal(engine.running,false);
    for(const scene of scenes){engine.configure({scene:scene.id});next();}
    assert.ok(drawCalls>100,'drawing work occurred for every scene');
    assert.equal(engine.settings.scene,'vector-bloom');
    listeners.get('pointermove')({clientX:180,clientY:100});next();
    listeners.get('pointerleave')();next();
    listeners.get('pointercancel')();next();
    width=2600;height=1600;engine.resize();
    assert.ok(canvas.width*canvas.height<=1605000,'large canvases stay near 1.6MP budget');
    engine.destroy();
    assert.equal(raf.size,0,'no pending animation frame survives destroy');
    assert.equal(listeners.size,0,'pointer event listeners are removed');
  } finally {
    for(const [name,value] of Object.entries(old)){if(value===undefined)delete globalThis[name];else globalThis[name]=value}
  }
});

test('compact catalog uses inert state and returns focus after closing',()=>{
  const script=readFileSync(new URL('../web/motion-studio.js',import.meta.url),'utf8');
  assert.match(script,/catalogSidebar\.inert=compactViewport\.matches&&!next/);
  assert.match(script,/catalogSidebar\.contains\(document\.activeElement\)/);
  assert.match(script,/compactViewport\.addEventListener\('change'/);
  assert.match(script,/catalogSidebar\.setAttribute\('role','dialog'\)/);
  assert.match(script,/catalogSidebar\.setAttribute\('aria-modal','true'\)/);
  assert.match(script,/catalogBackdrop\.hidden=!next/);
  assert.match(script,/sibling\.inert=next/);
  assert.match(script,/event\.key!=='Tab'/);
});

test('cross-platform preview modes and new material variants are independently named',()=>{
  const html=readFileSync(new URL('../web/motion-studio.html',import.meta.url),'utf8');
  for(const mode of ['iphone','android','macbook','windows']){
    assert.match(html,new RegExp('data-device="'+mode+'"'));
  }
  assert.ok(scenes.find(scene=>scene.id==='prism-veil'&&scene.category==='Material'));
  assert.ok(scenes.find(scene=>scene.id==='vector-bloom'&&scene.category==='Lichtfelder'));
});
