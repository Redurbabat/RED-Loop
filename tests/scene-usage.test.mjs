import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scenes} from '../web/motion-engine.js';
import {defaultMotionSettings,formatMotionUsage} from '../web/motion-presets.js';

test('homepage integration examples use canonical defaults for all original studies',()=>{
  assert.equal(scenes.length,12);
  const snippets=new Map();
  for(const scene of scenes){
    const snippet=formatMotionUsage({scene:scene.id,...defaultMotionSettings});
    assert.match(snippet,new RegExp("scene: '"+scene.id+"'"));
    assert.match(snippet,/density: 58, depth: 58, speed: 42, hue: 340/);
    assert.match(snippet,/createMotionEngine/);
    assert.match(snippet,/engine.setPlaying\(!engine.running\)/);
    assert.match(snippet,/engine.destroy\(\)/);
    assert.doesNotMatch(snippet,/token=|access_key|password/i);
    snippets.set(scene.id,snippet);
  }
  assert.equal(new Set(snippets.values()).size,scenes.length);
});

test('homepage code inspector uses the existing Motion Studio formatter without duplicating the template',()=>{
  const js=readFileSync(new URL('../web/scene-discovery.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
  assert.match(js,/import \{defaultMotionSettings,formatMotionUsage\} from '\.\/motion-presets\.js'/);
  assert.match(js,/usageText\.textContent=formatMotionUsage\(\{scene:scene\.id,\.\.\.defaultMotionSettings\}\)/);
  assert.match(js,/usageSource\.focus\(\)/);
  assert.match(js,/usagePanel\.hidden=false/);
  assert.match(js,/usagePanel\.hidden=true/);
  assert.match(js,/entry\.append\(link,bookmark,actions\)/);
  assert.match(js,/usageButton\.setAttribute\('aria-controls','scene-discovery-usage'\)/);
  assert.match(html,/id="scene-discovery-usage"[^>]*role="region"/);
  assert.match(html,/id="scene-discovery-usage-source"[^>]*tabindex="0"/);
  assert.match(html,/id="scene-discovery-usage-copy"/);
});

test('clipboard failures never claim success and preserve selectable code',()=>{
  const script=readFileSync(new URL('../web/scene-discovery.js',import.meta.url),'utf8');
  assert.match(script,/await win\.navigator\.clipboard\.writeText\(snippet\)/);
  assert.match(script,/feedback\.textContent='Einbau-Code für '\+label\+' kopiert'/);
  assert.match(script,/catch\{\s*usageSource\.focus\(\);\s*feedback\.textContent='Kopieren nicht verfügbar/);
  assert.doesNotMatch(script,/usageText\.innerHTML/);
});
