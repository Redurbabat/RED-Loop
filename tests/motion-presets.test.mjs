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
test('serialization round-trips values while preserving unrelated query parameters',()=>{
  const preset={scene:'iris-caustics',density:32,depth:87,speed:20,hue:195};
  const query=serializeMotionPreset(preset,'?source=library&scene=spectral-fold');
  assert.equal(new URLSearchParams(query).get('source'),'library');
  assert.deepEqual(readMotionPreset('?'+query,ids),preset);
});
test('normalization rounds slider parameters and snippet uses current values',()=>{
  assert.deepEqual(normalizeMotionSettings({density:33.8,depth:1.2,speed:19.7,hue:255.1}),{density:34,depth:1,speed:20,hue:255});
  const source=formatMotionUsage({scene:'glass-filament',density:34,depth:1,speed:20,hue:255});
  assert.match(source,/scene: 'glass-filament', density: 34, depth: 1, speed: 20, hue: 255/);
  assert.doesNotMatch(formatMotionUsage({scene:"evil';foo()",...defaultMotionSettings}),/foo\(\)/);
});
