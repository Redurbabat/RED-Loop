import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeCanvasPng} from '../web/motion-export.js';

const png=()=>new Blob(['png bytes'],{type:'image/png'});

test('PNG encoding requests PNG format and returns the original blob',async()=>{
  const image=png();
  const requested=[];
  const result=await encodeCanvasPng({
    toBlob(callback,format){requested.push(format);callback(image);}
  },100);
  assert.equal(result,image);
  assert.deepEqual(requested,['image/png']);
});

test('PNG encoding rejects unsupported, null, and wrong-format results',async()=>{
  await assert.rejects(encodeCanvasPng(null),/not supported/);
  await assert.rejects(encodeCanvasPng({}),/not supported/);
  await assert.rejects(encodeCanvasPng({toBlob(callback){callback(null)}},100),/no image/);
  await assert.rejects(encodeCanvasPng({
    toBlob(callback){callback(new Blob(['not a png'],{type:'image/jpeg'}));}
  },100),/unexpected image format/);
});

test('PNG encoding recovers from synchronous browser errors',async()=>{
  await assert.rejects(encodeCanvasPng({
    toBlob(){throw new Error('SecurityError: canvas is tainted');}
  },100),/SecurityError/);
});

test('PNG encoding settles after a bounded wait without a callback',async()=>{
  let release;
  const promise=encodeCanvasPng({
    toBlob(callback){release=callback;}
  },15);
  await assert.rejects(promise,/timed out/);
  assert.equal(typeof release,'function');
  // A late callback must be harmless and never re-open the settled promise.
  release(png());
  release(null);
});

test('PNG encoding ignores duplicate callbacks after success',async()=>{
  const image=png();
  const actual=await encodeCanvasPng({
    toBlob(callback){callback(image);callback(null);}
  },100);
  assert.equal(actual,image);
});
