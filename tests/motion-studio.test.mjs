import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMotionEngine,scenes} from '../web/motion-engine.js';

test('six unique original materials with descriptive metadata',()=>{
  assert.equal(scenes.length,6);
  assert.equal(new Set(scenes.map(item=>item.id)).size,6);
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
  assert.match(html,/id="ui-loop-code-panel"/);
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