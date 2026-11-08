import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultMotionSettings, normalizeMotionSettings, readMotionPreset, serializeMotionPreset, formatMotionUsage } from '../web/motion-presets.js';

const ids=['spectral-fold','glass-filament','iris-caustics'];
test('URL presets keep selection and clamp all settings',()=>{
  const actual=readMotionPreset('?scene=glass-filament&density=999&depth=-10&speed=65&hue=370',ids);
  assert.deepEqual(actual,{scene:'glass-filament',density:90,depth:0,speed:65,hue:360});
});
test('untrusted and empty preset values fall back to safe defaults',()=>{
  const actual=readMotionPreset('?scene=unknown&density=NaN&depth=&speed=Infinity&hue=abc',ids);
  assert.deepEqual(actual,{scene:'spectral-fold',...defaultMotionSettings});
});
test('serialization round-trips only public visual settings, excluding unrelated query data',()=>{
  const preset={scene:'iris-caustics',density:32,depth:87,speed:20,hue:195};
  const query=serializeMotionPreset(preset);
  const params=new URLSearchParams(query);
  assert.deepEqual([...params.keys()],['scene','density','depth','speed','hue']);
  assert.deepEqual(readMotionPreset('?'+query,ids),preset);
});

test('shared presets cannot inherit tokens or arbitrary query values',()=>{
  const incoming='?scene=glass-filament&density=70&token=secret&state=callback&redirect=other';
  const safePreset=readMotionPreset(incoming,ids);
  const shared=serializeMotionPreset(safePreset);
  assert.equal(shared.includes('token'),false);
  assert.equal(shared.includes('secret'),false);
  assert.equal(shared.includes('callback'),false);
  assert.equal(shared.includes('redirect'),false);
  assert.deepEqual([...new URLSearchParams(shared).keys()],['scene','density','depth','speed','hue']);
  assert.equal(serializeMotionPreset({scene:"x';alert(1)",density:50}), 'scene=spectral-fold&density=50&depth=58&speed=42&hue=340');
});
test('normalization rounds slider parameters and snippet uses current values',()=>{
  assert.deepEqual(normalizeMotionSettings({density:33.8,depth:1.2,speed:19.7,hue:255.1}),{density:34,depth:1,speed:20,hue:255});
  const source=formatMotionUsage({scene:'glass-filament',density:34,depth:1,speed:20,hue:255});
  assert.match(source,/scene: 'glass-filament', density: 34, depth: 1, speed: 20, hue: 255/);
  assert.doesNotMatch(formatMotionUsage({scene:"evil';foo()",...defaultMotionSettings}),/foo\(\)/);
});
