import test from 'node:test';
import assert from 'node:assert/strict';
import {createMotionEngine} from '../web/motion-engine.js';

test('PNG export flushes latest scene and device size before the next RAF',()=>{
  const names=['window','document','ResizeObserver','requestAnimationFrame','cancelAnimationFrame'];
  const old=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  const set=(name,value)=>Object.defineProperty(globalThis,name,{value,configurable:true,writable:true});
  let width=480,height=300,draws=0,transforms=0,next=0;
  const queue=new Map(),listeners=new Map();
  const ctx=new Proxy({},{
    get(target,key){
      if(key==='createRadialGradient')return ()=>({addColorStop(){}});
      if(key==='fill'||key==='stroke')return ()=>{draws++};
      if(key==='setTransform')return ()=>{transforms++};
      return target[key]??(()=>{});
    },
    set(target,key,value){target[key]=value;return true}
  });
  const canvas={
    width:0,height:0,
    getContext:()=>ctx,
    getBoundingClientRect:()=>({left:0,top:0,width,height}),
    addEventListener:(event,listener)=>listeners.set(event,listener),
    removeEventListener:event=>listeners.delete(event),
  };
  try{
    set('window',{devicePixelRatio:2,matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}})});
    set('document',{hidden:false,addEventListener(){},removeEventListener(){}});
    set('ResizeObserver',class{observe(){}disconnect(){}});
    set('requestAnimationFrame',callback=>{const id=++next;queue.set(id,callback);return id});
    set('cancelAnimationFrame',id=>queue.delete(id));

    const engine=createMotionEngine(canvas);
    assert.equal(draws,0,'initial preview frame is queued but not yet drawn');
    assert.ok(queue.size>0);
    engine.configure({scene:'signal-matrix',hue:195});
    assert.equal(draws,0,'scene and color edits have not rendered before export');
    assert.equal(engine.renderForExport(),true);
    assert.ok(draws>0,'export renders synchronously');
    assert.equal(engine.settings.scene,'signal-matrix');
    assert.deepEqual([canvas.width,canvas.height],[960,600]);
    assert.equal(queue.size,0,'queued stale render is cancelled after export');
    assert.equal(engine.running,false,'export leaves animation paused');

    width=220;height=350;
    engine.configure({scene:'vector-bloom',hue:255});
    const before=draws;
    assert.equal(engine.renderForExport(),true);
    assert.ok(draws>before,'second export draws the new scene');
    assert.deepEqual([canvas.width,canvas.height],[440,700],'latest device size is encoded');
    assert.equal(engine.settings.hue,255);
    assert.equal(queue.size,0);
    assert.ok(transforms>=3,'transform follows updated pixel density');

    assert.equal(engine.setPlaying(true),true);
    assert.equal(engine.renderForExport(),false,'running animation must pause before export');
    engine.setPlaying(false);
    assert.equal(engine.renderForExport(),true);

    width=0;
    assert.equal(engine.renderForExport(),false,'hidden or zero-size canvas cannot be exported');
    engine.destroy();
    assert.equal(engine.renderForExport(),false,'destroyed engine cannot export');
    assert.equal(queue.size,0);
    assert.equal(listeners.size,0);
  }finally{
    for(const [name,descriptor] of old){
      if(descriptor)Object.defineProperty(globalThis,name,descriptor);
      else delete globalThis[name];
    }
  }
});
