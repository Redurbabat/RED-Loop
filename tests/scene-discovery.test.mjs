import test from 'node:test';
import assert from 'node:assert/strict';
import {scenes} from '../web/motion-engine.js';
import {findMotionScenes,motionSceneHref} from '../web/scene-discovery.js';

test('homepage indexes the complete source catalog with no duplicate scenes',()=>{
  const result=findMotionScenes(scenes);
  assert.equal(result.length,12);
  assert.equal(new Set(result.map(scene=>scene.id)).size,12);
  assert.deepEqual(result.map(scene=>scene.id),scenes.map(scene=>scene.id));
});

test('multiword queries search names, categories, descriptions and tags',()=>{
  assert.deepEqual(findMotionScenes(scenes,{query:'Glas'}).map(scene=>scene.id),
    ['glass-filament','prism-veil']);
  assert.deepEqual(findMotionScenes(scenes,{query:'Caustics IRIS'}).map(scene=>scene.id),
    ['iris-caustics']);
  assert.deepEqual(findMotionScenes(scenes,{query:'partikel 3D'}).map(scene=>scene.id),
    ['spectral-fold']);
  assert.deepEqual(findMotionScenes(scenes,{query:'no-such-effect'}),[]);
  assert.deepEqual(findMotionScenes(scenes,{query:'  '}),scenes);
});

test('category filters combine with search and saved-only collection',()=>{
  assert.equal(findMotionScenes(scenes,{category:'Material'}).length,4);
  assert.deepEqual(findMotionScenes(scenes,{category:'Lichtfelder',query:'iris'}).map(x=>x.id),['iris-caustics']);
  assert.deepEqual(findMotionScenes(scenes,{category:'Gemerkte',favorites:new Set(['vector-bloom','spectral-fold'])}).map(x=>x.id),
    ['spectral-fold','vector-bloom']);
  assert.deepEqual(findMotionScenes(scenes,{category:'Gemerkte'}),[]);
});

test('favorites appear first without changing source metadata',()=>{
  const original=scenes.map(scene=>scene.id);
  const result=findMotionScenes(scenes,{favorites:new Set(['vector-bloom','glass-filament'])});
  assert.deepEqual(result.slice(0,2).map(scene=>scene.id),['glass-filament','vector-bloom']);
  assert.deepEqual(scenes.map(scene=>scene.id),original);
});

test('direct links allow only known scene IDs and never copy unrelated query data',()=>{
  assert.equal(motionSceneHref('vector-bloom'),'/motion-studio.html?scene=vector-bloom');
  assert.equal(motionSceneHref('iris-caustics'),'/motion-studio.html?scene=iris-caustics');
  for(const invalid of ['unknown-scene',null,'vector-bloom&token=SECRET','javascript:alert(1)','../private']){
    assert.equal(motionSceneHref(invalid),null);
  }
});
