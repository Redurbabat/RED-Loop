import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Loop} from '../web/loop.js';
const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
test('start is explicit, duplicate start rejected, count bounded', async () => {
  const loop = new Loop(()=>{},3); assert.equal(loop.state.count,0); assert.equal(loop.state.status,'ready');
  loop.configure(2); assert.equal(loop.start(),true); assert.equal(loop.start(),false);
  await wait(35); assert.equal(loop.state.count,2); assert.equal(loop.state.status,'completed');
  assert.equal(loop.state.messages.length,4);
});
test('stop cancels pending work and resume respects remaining limit', async () => {
  const loop = new Loop(()=>{},10); loop.configure(2); loop.start(); loop.stop(); await wait(20);
  assert.equal(loop.state.count,0); assert.equal(loop.state.status,'stopped');
  loop.start(); await wait(50); assert.equal(loop.state.count,2);
});
test('reset while active cancels stale callbacks', async () => {
  const loop = new Loop(()=>{},10); loop.start(); loop.reset(); await wait(25);
  assert.equal(loop.state.count,0); assert.equal(loop.state.status,'ready'); assert.equal(loop.state.messages.length,0);
});
test('limits 1–50, invalid and fractional input', () => {
  const loop = new Loop(); for (const n of [1,50]) assert.equal(loop.configure(n),true);
  for (const n of [0,51,-1,1.5,NaN,Infinity]) {assert.equal(loop.configure(n),false); assert.equal(loop.state.status,'error');}
});
for (const scenario of ['error','draft']) test(`${scenario} fails closed without sending`, async () => {
  const loop = new Loop(()=>{},2); loop.configure(5,scenario); loop.start(); await wait(25);
  assert.equal(loop.state.status,'error'); assert.equal(loop.state.count,0); assert.ok(loop.state.events[0].message);
});
test('cannot change limit while running', () => {
  const loop = new Loop(); loop.start(); assert.equal(loop.configure(50),false); assert.equal(loop.state.limit,5); loop.stop();
});
