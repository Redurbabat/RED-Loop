/**
 * Dependency-free original RED Morph starter download.
 * ZIP uses the "stored" method; no third-party compression or CDN needed.
 */
import {scenes} from './motion-engine.js';
import {defaultMotionSettings,normalizeMotionSettings,formatMotionUsage} from './motion-presets.js';

const knownScenes=new Set(scenes.map(scene=>scene.id));
const encoder=new TextEncoder();
const MAX_FILE_BYTES=512000;
const MAX_ARCHIVE_BYTES=2000000;

function escapeMarkup(value){
  return String(value).replace(/[&<>"']/g,char=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  }[char]));
}

export function createMotionStarterFiles(sceneId,engineSource,settings=defaultMotionSettings){
  if(!knownScenes.has(sceneId))throw new Error('Unknown motion scene');
  if(typeof engineSource!=='string'
    ||engineSource.length>MAX_FILE_BYTES
    ||!engineSource.includes('export const scenes')
    ||!engineSource.includes('export function createMotionEngine')){
    throw new Error('Motion engine source is missing or invalid');
  }
  const scene=scenes.find(item=>item.id===sceneId);
  const title=escapeMarkup(scene.name);
  const detail=escapeMarkup(scene.description);
  // The same canonical snippet is used by the Motion Studio and homepage.
  const normalized=normalizeMotionSettings(settings);
  const usage=formatMotionUsage({scene:sceneId,...normalized})
    .replace(/<\/script/gi,'<\\/script');
  const html=`<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>${title} · RED Morph Starter</title>
  <style>
    :root{color-scheme:dark;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;background:#0a0e18;color:#f2f3f8}
    *{box-sizing:border-box}
    body{margin:0;min-height:100svh;display:grid;place-items:center;padding:clamp(18px,5vw,56px)}
    main{width:min(920px,100%);display:grid;gap:18px}
    h1{margin:0;font-size:clamp(28px,6vw,52px);font-weight:560;letter-spacing:-.05em}
    p{margin:0;color:#c3c8d4;line-height:1.65}
    .surface{padding:clamp(10px,2vw,18px);border-radius:24px;border:1px solid #ffffff22;background:linear-gradient(140deg,#171d2d,#0d1321)}
    canvas{display:block;width:100%;height:clamp(245px,52vw,480px);border-radius:17px;outline-offset:4px;touch-action:pan-y;background:#080d17}
    button{min-height:48px;justify-self:start;padding:12px 22px;border:1px solid #ffffff44;border-radius:12px;background:#202a3c;color:#fff;font:600 14px/1.4 ui-sans-serif,system-ui,sans-serif;cursor:pointer}
    button:hover{background:#2d3a51}
    button:focus-visible,canvas:focus-visible{outline:3px solid #e6b5d5}
    .note{font-size:12px;max-width:620px}
    @media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;animation:none!important;transition:none!important}}
  </style>
</head>
<body>
  <main>
    <header><h1>${title}</h1><p>${detail}</p></header>
    <div class="surface">
      <canvas id="preview" tabindex="0" aria-label="${title} — Vorschau, mit Pfeiltasten steuerbar">
        Dein Browser unterstützt Canvas nicht.
      </canvas>
    </div>
    <button id="play" type="button" aria-pressed="false">Animation starten</button>
    <p class="note">Die Szene startet pausiert. Mit dem Button beginnt die Animation; bei reduzierter Bewegung bleibt sie pausiert. Die Pfeiltasten steuern den fokussierten Canvas.</p>
  </main>
  <script type="module">
${usage}
    const playButton=document.querySelector('#play');
    playButton.addEventListener('click',()=>{
      playButton.setAttribute('aria-pressed',String(engine.running));
      playButton.textContent=engine.running?'Animation pausieren':'Animation starten';
    });
    addEventListener('pagehide',()=>engine.destroy(),{once:true});
  </script>
</body>
</html>
`;
  const readme=`# RED Morph Starter: ${scene.name}

This package contains the original RED Morph Canvas engine and one responsive,
keyboard-accessible example using ${scene.id}.

Selected scene settings: density=${normalized.density}, depth=${normalized.depth},
speed=${normalized.speed}, hue=${normalized.hue}.

Files
- index.html — original example, paused until the Play button is clicked.
- motion-engine.js — the unmodified RED Morph engine, including all 12 studies.

## Run it

Because index.html uses an ES module import, open it via a local HTTP server
rather than double-clicking file:// in a browser.

From this directory, run:

    python3 -m http.server 8000

Then open http://localhost:8000 in a modern browser.

You can also use any other static web server. No npm install, cloud account,
external assets, CDN, or runtime dependencies are required.

## Embed it in your site

Use the CSS, <canvas id="preview">, <button id="play"> and module snippet from
index.html. Keep motion-engine.js alongside it, or adjust the relative import.
The example is responsive, respects prefers-reduced-motion and cleans up its
engine on pagehide. Scene: ${scene.id}.
`;
  return [
    {name:'index.html',content:html},
    {name:'motion-engine.js',content:engineSource},
    {name:'README.md',content:readme},
  ];
}

function crc32(data){
  let crc=0xffffffff;
  for(const byte of data){
    crc^=byte;
    for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}

/** ZIP32, no compression. Ordinary file viewers can open the archive. */
export function buildStoredZip(files){
  if(!Array.isArray(files)||!files.length||files.length>20)throw new Error('Invalid ZIP file list');
  const used=new Set();
  const entries=files.map(file=>{
    const name=file?.name;
    if(typeof name!=='string'||! /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(name)||used.has(name)
      ||typeof file.content!=='string')throw new Error('Unsafe or duplicate ZIP entry');
    used.add(name);
    const nameBytes=encoder.encode(name);
    const bytes=encoder.encode(file.content);
    if(bytes.length>MAX_FILE_BYTES)throw new Error('ZIP entry too large');
    return {nameBytes,bytes,crc:crc32(bytes)};
  });
  const localBytes=entries.reduce((n,e)=>n+30+e.nameBytes.length+e.bytes.length,0);
  const centralBytes=entries.reduce((n,e)=>n+46+e.nameBytes.length,0);
  const size=localBytes+centralBytes+22;
  if(size>MAX_ARCHIVE_BYTES)throw new Error('ZIP archive too large');
  const output=new Uint8Array(size),view=new DataView(output.buffer);
  let cursor=0;
  const u16=(at,value)=>view.setUint16(at,value,true);
  const u32=(at,value)=>view.setUint32(at,value,true);
  for(const entry of entries){
    entry.offset=cursor;
    u32(cursor,0x04034b50);u16(cursor+4,20);u16(cursor+6,0x0800);
    u16(cursor+8,0);u16(cursor+10,0);u16(cursor+12,33); // stored, 1980-01-01
    u32(cursor+14,entry.crc);u32(cursor+18,entry.bytes.length);u32(cursor+22,entry.bytes.length);
    u16(cursor+26,entry.nameBytes.length);u16(cursor+28,0);cursor+=30;
    output.set(entry.nameBytes,cursor);cursor+=entry.nameBytes.length;
    output.set(entry.bytes,cursor);cursor+=entry.bytes.length;
  }
  const centralStart=cursor;
  for(const entry of entries){
    u32(cursor,0x02014b50);u16(cursor+4,20);u16(cursor+6,20);u16(cursor+8,0x0800);
    u16(cursor+10,0);u16(cursor+12,0);u16(cursor+14,33);
    u32(cursor+16,entry.crc);u32(cursor+20,entry.bytes.length);u32(cursor+24,entry.bytes.length);
    u16(cursor+28,entry.nameBytes.length);u16(cursor+30,0);u16(cursor+32,0);
    u16(cursor+34,0);u16(cursor+36,0);u32(cursor+38,0);u32(cursor+42,entry.offset);
    cursor+=46;output.set(entry.nameBytes,cursor);cursor+=entry.nameBytes.length;
  }
  u32(cursor,0x06054b50);u16(cursor+4,0);u16(cursor+6,0);
  u16(cursor+8,entries.length);u16(cursor+10,entries.length);
  u32(cursor+12,cursor-centralStart);u32(cursor+16,centralStart);u16(cursor+20,0);
  cursor+=22;
  if(cursor!==size)throw new Error('ZIP size mismatch');
  return output;
}
