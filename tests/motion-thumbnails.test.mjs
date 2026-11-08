import test from 'node:test';
import assert from 'node:assert/strict';
import {
  paintStaticMotionThumbnail,observeStaticMotionThumbnails,
} from '../web/motion-thumbnails.js';

function createCanvas(scene='spectral-fold',width=220,height=105){
  return {
    dataset:{scene},
    getContext(){return {}},
    getBoundingClientRect(){return {width,height}},
  };
}

test('static thumbnail draws the requested canonical scene exactly once and destroys its engine',()=>{
  const canvas=createCanvas('glass-filament');
  let creates=0,configures=0,draws=0,destroys=0;
  const mockEngine=()=>{
    creates++;
    return {
      configure(value){configures++;assert.deepEqual(value,{scene:'glass-filament'})},
      renderForExport(){draws++;return true},
      destroy(){destroys++},
    };
  };
  assert.equal(paintStaticMotionThumbnail(canvas,'glass-filament',mockEngine),true);
  assert.deepEqual([creates,configures,draws,destroys],[1,1,1,1]);
});

test('unsupported, unrecognized or throwing engines cannot break component links',()=>{
  const canvas=createCanvas();
  let creates=0,destroys=0;
  const factory=()=>{
    creates++;
    return {configure(){throw new Error('WebGL unavailable')},destroy(){destroys++}};
  };
  assert.equal(paintStaticMotionThumbnail(null,'spectral-fold',factory),false);
  assert.equal(paintStaticMotionThumbnail({},'spectral-fold',factory),false);
  assert.equal(paintStaticMotionThumbnail(canvas,'not-a-real-scene',factory),false);
  assert.equal(creates,0);
  assert.equal(paintStaticMotionThumbnail(canvas,'spectral-fold',factory),false);
  assert.equal(destroys,1,'failing engine is still destroyed');
  const noPaint=()=>({configure(){},renderForExport(){return false},destroy(){destroys++}});
  assert.equal(paintStaticMotionThumbnail(canvas,'spectral-fold',noPaint),false);
  assert.equal(destroys,2);
});

test('IntersectionObserver lazily paints visible cards only once and disconnects when filtered',()=>{
  const first=createCanvas('spectral-fold');
  const second=createCanvas('vector-bloom');
  const canvases=[first,second];
  const seen=[],unobserved=[];
  let observer;
  class FakeObserver {
    constructor(callback,options){
      this.callback=callback;
      this.options=options;
      this.disconnected=false;
      observer=this;
    }
    observe(canvas){seen.push(canvas)}
    unobserve(canvas){unobserved.push(canvas)}
    disconnect(){this.disconnected=true}
  }
  const paints=[];
  const root={querySelectorAll(){return canvases}};
  const dispose=observeStaticMotionThumbnails(root,{
    win:{IntersectionObserver:FakeObserver},
    paint(canvas,id){paints.push(id);return true},
  });
  assert.deepEqual(seen,canvases,'register both thumbnails');
  assert.deepEqual(paints,[],'do not eagerly draw an offscreen scene');
  observer.callback([{target:first,isIntersecting:true},{target:second,isIntersecting:false}]);
  assert.deepEqual(paints,['spectral-fold']);
  assert.equal(first.dataset.previewReady,'true');
  assert.deepEqual(unobserved,[first],'completed preview no longer observed');
  observer.callback([{target:first,isIntersecting:true},{target:second,isIntersecting:true}]);
  assert.deepEqual(paints,['spectral-fold','vector-bloom'],'visible scene drawn exactly once');
  dispose();
  assert.equal(observer.disconnected,true,'filter changes clean up observer');
});

test('legacy browsers paint visible canvases once without IntersectionObserver',()=>{
  const first=createCanvas('iris-caustics');
  const hidden=createCanvas('prism-veil',0,0);
  const root={querySelectorAll(){return [first,hidden]}};
  const paints=[];
  const options={win:{},paint(canvas,id){paints.push(id);return true}};
  observeStaticMotionThumbnails(root,options)();
  assert.deepEqual(paints,['iris-caustics']);
  assert.equal(first.dataset.previewReady,'true');
  assert.equal(hidden.dataset.previewReady,undefined,'hidden canvas is never allocated');
});

test('failed painting can retry when card becomes visible again',()=>{
  const canvas=createCanvas('signal-matrix');
  const root={querySelectorAll(){return [canvas]}};
  let tries=0;
  observeStaticMotionThumbnails(root,{win:{},paint(){return ++tries>1}})();
  assert.equal(canvas.dataset.previewReady,undefined);
  observeStaticMotionThumbnails(root,{win:{},paint(){return ++tries>1}})();
  assert.equal(canvas.dataset.previewReady,'true');
  assert.equal(tries,2);
});
