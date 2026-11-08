import test from 'node:test';
import assert from 'node:assert/strict';
import {scenes} from '../web/motion-engine.js';
import {createMotionStarterFiles,buildStoredZip} from '../web/motion-starter.js';
import {readFileSync} from 'node:fs';

const originalEngine=readFileSync(new URL('../web/motion-engine.js',import.meta.url),'utf8');
const decoder=new TextDecoder();
function unpackStoredZip(zip){
  const view=new DataView(zip.buffer,zip.byteOffset,zip.byteLength);
  const read16=at=>view.getUint16(at,true),read32=at=>view.getUint32(at,true);
  const end=zip.length-22;
  assert.equal(read32(end),0x06054b50,'ZIP end-of-central-directory signature');
  const total=read16(end+10),offset=read32(end+16);
  assert.equal(read16(end+8),total);
  assert.equal(read32(end+12),end-offset);
  const contents=new Map();
  let cursor=offset;
  for(let i=0;i<total;i++){
    assert.equal(read32(cursor),0x02014b50,'central directory signature');
    assert.equal(read16(cursor+10),0,'archive uses supported stored method');
    const size=read32(cursor+24);
    const nameLength=read16(cursor+28),extra=read16(cursor+30),comment=read16(cursor+32);
    const localOffset=read32(cursor+42);
    const name=decoder.decode(zip.subarray(cursor+46,cursor+46+nameLength));
    assert.equal(read32(localOffset),0x04034b50,'local file signature');
    assert.equal(read32(localOffset+18),size,'local and central directory sizes agree');
    assert.equal(read16(localOffset+8),0,'local method is stored');
    const localNameLength=read16(localOffset+26),localExtra=read16(localOffset+28);
    const bytes=zip.subarray(localOffset+30+localNameLength+localExtra,
      localOffset+30+localNameLength+localExtra+size);
    assert.equal(bytes.length,size);
    contents.set(name,decoder.decode(bytes));
    cursor+=46+nameLength+extra+comment;
  }
  assert.equal(cursor,end,'central directory has no trailing or missing data');
  return contents;
}

test('starter contains only three expected UTF-8 files and exact original engine',()=>{
  const files=createMotionStarterFiles('mercury-droplets',originalEngine);
  assert.deepEqual(files.map(file=>file.name),['index.html','motion-engine.js','README.md']);
  assert.equal(files[1].content,originalEngine,'download contains unmodified engine');
  const zip=buildStoredZip(files);
  assert.ok(zip instanceof Uint8Array);
  const unpacked=unpackStoredZip(zip);
  assert.deepEqual([...unpacked.keys()],['index.html','motion-engine.js','README.md']);
  assert.equal(unpacked.get('motion-engine.js'),originalEngine);
  assert.equal(unpacked.get('index.html'),files[0].content);
  assert.equal(unpacked.get('README.md'),files[2].content);
  assert.match(unpacked.get('README.md'),/python3 -m http\.server 8000/);
  assert.match(unpacked.get('README.md'),/http:\/\/localhost:8000/);
});

test('every scene produces a distinct but valid canonical starter',()=>{
  assert.equal(scenes.length,12);
  for(const scene of scenes){
    const files=createMotionStarterFiles(scene.id,originalEngine);
    const html=files[0].content;
    assert.match(html,new RegExp("scene: '"+scene.id+"'"));
    assert.match(html,/density: 58, depth: 58, speed: 42, hue: 340/);
    assert.match(html,/import \{ createMotionEngine \} from '\.\/motion-engine\.js';/);
    assert.match(html,/<canvas id="preview"[^>]*tabindex="0"/);
    assert.match(html,/<button id="play" type="button" aria-pressed="false">/);
    assert.match(html,/engine\.destroy\(\)/);
    assert.match(html,/prefers-reduced-motion/);
    assert.equal(unpackStoredZip(buildStoredZip(files)).get('motion-engine.js'),originalEngine);
  }
});

test('invalid scene IDs or server HTML cannot become starter projects',()=>{
  for(const scene of [null,'invalid','../private','aurora-threads&token=secret']){
    assert.throws(()=>createMotionStarterFiles(scene,originalEngine),/Unknown motion scene/);
  }
  assert.throws(()=>createMotionStarterFiles('spectral-fold','<!DOCTYPE html>404'),/source is missing or invalid/);
  assert.throws(()=>createMotionStarterFiles('spectral-fold',''),/source is missing or invalid/);
});

test('ZIP32 rejects traversals, duplicates, non-text entries and oversized files',()=>{
  for(const name of ['../secret.txt','/private','nested/file.js','a\\b.js','', '.hidden']){
    assert.throws(()=>buildStoredZip([{name,content:'test'}]),/Unsafe or duplicate ZIP entry/);
  }
  assert.throws(()=>buildStoredZip([{name:'one.txt',content:'x'},{name:'one.txt',content:'y'}]),/Unsafe or duplicate ZIP entry/);
  assert.throws(()=>buildStoredZip([{name:'x.txt',content:123}]),/Unsafe or duplicate ZIP entry/);
  assert.throws(()=>buildStoredZip([{name:'x.txt',content:'X'.repeat(512001)}]),/ZIP entry too large/);
  assert.throws(()=>buildStoredZip([]),/Invalid ZIP file list/);
});

test('UTF-8 filenames and content round-trip through stored ZIP',()=>{
  const files=[{name:'README.md',content:'Glas, Licht, Ästhetik — 静的'}];
  const unpacked=unpackStoredZip(buildStoredZip(files));
  assert.equal(unpacked.get('README.md'),files[0].content);
});

test('generated HTML module initializes, toggles playback and cleans up on pagehide',()=>{
  const html=createMotionStarterFiles('aurora-threads',originalEngine)[0].content;
  const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script,'starter includes its actual executable module');
  const runnable=script.replace(
    /^import \{ createMotionEngine \} from '\.\/motion-engine\.js';\s*/m,'');
  assert.doesNotMatch(runnable,/^import /m,'module source only imports the bundled engine');
  let configured=null,playing=false,destroyed=false,cleanup=null;
  const engine={
    get running(){return playing},
    configure(values){configured=values},
    setPlaying(value){playing=!!value},
    destroy(){destroyed=true},
  };
  const play={textContent:'Animation starten',attrs:{},listeners:[],
    setAttribute(key,value){this.attrs[key]=value},
    addEventListener(key,fn){if(key==='click')this.listeners.push(fn)},
    click(){for(const fn of this.listeners)fn()},
  };
  const canvas={};
  const doc={querySelector:key=>key==='#preview'?canvas:key==='#play'?play:null};
  new Function('document','createMotionEngine','addEventListener',runnable)(
    doc,received=>{assert.equal(received,canvas);return engine},
    (key,fn)=>{if(key==='pagehide')cleanup=fn});
  assert.deepEqual(configured,{scene:'aurora-threads',density:58,depth:58,speed:42,hue:340});
  assert.equal(playing,false,'startup remains paused');
  play.click();
  assert.equal(playing,true);
  assert.equal(play.attrs['aria-pressed'],'true');
  assert.equal(play.textContent,'Animation pausieren');
  play.click();
  assert.equal(playing,false);
  assert.equal(play.attrs['aria-pressed'],'false');
  assert.equal(play.textContent,'Animation starten');
  assert.equal(typeof cleanup,'function');
  cleanup();
  assert.equal(destroyed,true);
});
