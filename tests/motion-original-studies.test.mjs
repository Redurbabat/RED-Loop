import test from 'node:test';
import assert from 'node:assert/strict';
import {createMotionEngine,scenes} from '../web/motion-engine.js';

const studies=['aurora-threads','mercury-droplets'];

function withMockCanvas(run){
  const names=['window','document','ResizeObserver','requestAnimationFrame','cancelAnimationFrame'];
  const old=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  const install=(name,value)=>Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});
  const canvasEvents=new Map(),documentEvents=new Map(),mediaEvents=new Map(),frames=new Map();
  let nextId=0,observerDisconnected=false,rect={width:320,height:184};
  let operations=[],paintStyle={};
  const ctx=new Proxy({},{
    get(target,key){
      if(key==='createRadialGradient')return (...coords)=>{
        operations.push(['gradient',...coords]);
        return {addColorStop(position,color){operations.push(['stop',position,color])}};
      };
      if(['lineTo','moveTo','ellipse','arc','quadraticCurveTo'].includes(key))return (...args)=>operations.push([key,...args]);
      if(['fill','stroke','fillRect','setTransform'].includes(key))return (...args)=>operations.push([key,...args,paintStyle[key==='stroke'?'strokeStyle':'fillStyle']]);
      return target[key]??(()=>{});
    },
    set(target,key,value){paintStyle[key]=value;target[key]=value;return true},
  });
  const canvas={
    width:0,height:0,
    getContext:()=>ctx,
    getBoundingClientRect:()=>({left:0,top:0,...rect}),
    addEventListener:(name,fn)=>canvasEvents.set(name,fn),
    removeEventListener:name=>canvasEvents.delete(name),
  };
  const media={matches:false,addEventListener:(name,fn)=>mediaEvents.set(name,fn),removeEventListener:name=>mediaEvents.delete(name)};
  try{
    install('window',{devicePixelRatio:2,matchMedia:()=>media});
    install('document',{hidden:false,addEventListener:(name,fn)=>documentEvents.set(name,fn),removeEventListener:name=>documentEvents.delete(name)});
    install('ResizeObserver',class{observe(){}disconnect(){observerDisconnected=true}});
    install('requestAnimationFrame',fn=>{const id=++nextId;frames.set(id,fn);return id});
    install('cancelAnimationFrame',id=>frames.delete(id));
    const engine=createMotionEngine(canvas);
    try{return run({
      engine,canvas,canvasEvents,media,
      snapshot(){return operations},
      reset(){operations=[]},
      setRect(value){rect=value},
    });}
    finally{
      engine.destroy();
      assert.equal(frames.size,0,'no outstanding animation frames');
      assert.equal(canvasEvents.size,0,'no leftover canvas handlers');
      assert.equal(documentEvents.size,0,'no leftover document listeners');
      assert.equal(mediaEvents.size,0,'no leftover reduced-motion listeners');
      assert.equal(observerDisconnected,true,'ResizeObserver disconnected');
    }
  }finally{
    for(const [name,descriptor] of old){
      if(descriptor)Object.defineProperty(globalThis,name,descriptor);
      else delete globalThis[name];
    }
  }
}

test('two distinct original studies have complete metadata and safe catalog identifiers',()=>{
  assert.equal(scenes.length,12);
  assert.equal(new Set(scenes.map(scene=>scene.id)).size,12);
  for(const id of studies){
    const scene=scenes.find(scene=>scene.id===id);
    assert.ok(scene,'catalog metadata for '+id);
    assert.ok(scene.name.length>8);
    assert.ok(scene.description.length>45);
    assert.ok(scene.tags.length>=3);
    assert.match(id,/^[a-z]+(?:-[a-z]+)*$/);
  }
  assert.equal(scenes.find(scene=>scene.id==='aurora-threads').category,'Lichtfelder');
  assert.equal(scenes.find(scene=>scene.id==='mercury-droplets').category,'Material');
});

test('Aurora Threads and Mercury Droplets render different finite original geometry',()=>{
  withMockCanvas(({engine,canvas,snapshot,reset})=>{
    const traces={};
    for(const scene of studies){
      reset();
      engine.configure({scene,density:58,depth:62,hue:340});
      assert.equal(engine.renderForExport(),true);
      assert.deepEqual([canvas.width,canvas.height],[640,368]);
      const trace=snapshot();
      assert.ok(trace.length>150,'many optical operations for '+scene);
      for(const op of trace){
        assert.equal(op.slice(1).filter(x=>typeof x==='number').every(Number.isFinite),true,
          'finite coordinates for '+scene);
      }
      traces[scene]={
        pathCount:trace.filter(op=>op[0]==='lineTo').length,
        ellipseCount:trace.filter(op=>op[0]==='ellipse').length,
        gradients:trace.filter(op=>op[0]==='gradient').length,
      };
      assert.equal(engine.running,false,'no automatic playback');
    }
    assert.ok(traces['aurora-threads'].pathCount>1000,'Aurora has woven light lines');
    assert.equal(traces['aurora-threads'].ellipseCount,0);
    assert.ok(traces['mercury-droplets'].ellipseCount>30,'Mercury has glossy ellipse droplets');
    assert.ok(traces['mercury-droplets'].gradients>15,'Mercury uses independent metallic gradients');
  });
});

test('new studies respond to pointer and tuning changes without autoplay',()=>{
  withMockCanvas(({engine,canvasEvents,reset,snapshot,media})=>{
    for(const scene of studies){
      engine.configure({scene,depth:45,density:48,hue:220});
      reset();
      assert.equal(engine.renderForExport(),true);
      const neutral=JSON.stringify(snapshot());
      canvasEvents.get('pointermove')({clientX:280,clientY:140});
      reset();
      assert.equal(engine.renderForExport(),true);
      assert.notEqual(JSON.stringify(snapshot()),neutral,scene+' responds to pointer position');
      engine.configure({depth:90,hue:340});
      reset();
      assert.equal(engine.renderForExport(),true);
      assert.notEqual(JSON.stringify(snapshot()),neutral,scene+' responds to material settings');
      canvasEvents.get('pointerleave')();
      assert.equal(engine.running,false);
      media.matches=true;
      assert.equal(engine.setPlaying(true),false,'prefers-reduced-motion blocks animation');
      media.matches=false;
    }
  });
});
