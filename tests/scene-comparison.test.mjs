import test from 'node:test';
import assert from 'node:assert/strict';
import {scenes} from '../web/motion-engine.js';
import {toggleMotionComparison,motionSceneHref} from '../web/scene-discovery.js';

const allowed=scenes.map(scene=>scene.id);

test('comparison picks two known original scenes without modifying the input',()=>{
  const initial=['aurora-threads'];
  const pair=toggleMotionComparison(initial,'mercury-droplets',allowed);
  assert.deepEqual(pair,['aurora-threads','mercury-droplets']);
  assert.deepEqual(initial,['aurora-threads']);
  assert.equal(pair.length,2);
  for(const id of pair)assert.ok(motionSceneHref(id));
});

test('selecting a third scene replaces the oldest while keeping the latest',()=>{
  const pair=['aurora-threads','mercury-droplets'];
  assert.deepEqual(toggleMotionComparison(pair,'prism-veil',allowed),
    ['mercury-droplets','prism-veil']);
  assert.deepEqual(pair,['aurora-threads','mercury-droplets']);
});

test('reselecting an existing scene removes it and can clear the comparison',()=>{
  const pair=['aurora-threads','mercury-droplets'];
  assert.deepEqual(toggleMotionComparison(pair,'mercury-droplets',allowed),['aurora-threads']);
  assert.deepEqual(toggleMotionComparison(['aurora-threads'],'aurora-threads',allowed),[]);
});

test('unknown and stale scene IDs cannot become comparison links',()=>{
  assert.deepEqual(toggleMotionComparison([],'../../private',allowed),[]);
  assert.deepEqual(toggleMotionComparison([],'mercury-droplets&token=SECRET',allowed),[]);
  assert.deepEqual(toggleMotionComparison(['removed-scene','aurora-threads','aurora-threads'],
    'mercury-droplets',allowed),['aurora-threads','mercury-droplets']);
  assert.deepEqual(toggleMotionComparison(['mercury-droplets'],null,allowed),
    ['mercury-droplets']);
});

test('comparison has no browser storage dependency and works with a reduced catalog',()=>{
  const restricted=['spectral-fold','mercury-droplets'];
  assert.deepEqual(toggleMotionComparison(['aurora-threads','spectral-fold'],
    'mercury-droplets',restricted),['spectral-fold','mercury-droplets']);
  assert.deepEqual(toggleMotionComparison(null,'spectral-fold',restricted),
    ['spectral-fold']);
});
