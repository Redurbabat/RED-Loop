import {scenes,createMotionEngine} from './motion-engine.js';
import {defaultMotionSettings,readMotionPreset,serializeMotionPreset,formatMotionUsage} from './motion-presets.js';

const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];
const defaults=defaultMotionSettings;
const sceneIds=scenes.map(item=>item.id);
const initialPreset=readMotionPreset(location.search,sceneIds);
const favoriteIds=new Set();
let active=scenes.find(item=>item.id===initialPreset.scene)||scenes[0];
let category='Alle',search='',sourceText='',view='preview';
const searchInput=$('#ui-loop-search');
const status=$('#ui-loop-animation-status');
const play=$('#ui-loop-play');
const mql=window.matchMedia('(prefers-reduced-motion: reduce)');

const engine=createMotionEngine($('#ui-loop-canvas'),{onStateChange:running=>{
  play.setAttribute('aria-pressed',String(running));
  play.textContent=running?'Ⅱ Animation pausieren':'▶ Animation starten';
  status.textContent=running?'Animation aktiv':'Bewegung pausiert';
  $('#ui-loop-state').textContent=running?'LIVE ANIMATION':'STATIC PREVIEW';
}});

function notify(message){
  const toast=$('#ui-loop-toast');toast.textContent=message;toast.hidden=false;
  clearTimeout(notify.timeout);notify.timeout=setTimeout(()=>{toast.hidden=true},3000);
}
async function copy(text,label){
  try {
    if(!navigator.clipboard?.writeText)throw new Error('No clipboard API');
    await navigator.clipboard.writeText(text);notify(label+' kopiert');
  } catch {notify('Kopieren nicht erlaubt. Bitte Text manuell markieren.');}
}

function createButton(scene){
  const button=document.createElement('button');
  button.type='button';button.className='ui-loop-scene-item';
  button.dataset.scene=scene.id;
  button.setAttribute('aria-current',scene.id===active.id?'true':'false');
  const icon=document.createElement('span');icon.className='ui-loop-scene-icon';icon.setAttribute('aria-hidden','true');
  icon.textContent={'spectral-fold':'✧','chromatic-current':'≈','orbit-wake':'◎','satin-ridges':'≋','signal-matrix':'⊞','red-resonance':'◉','glass-filament':'⌁','iris-caustics':'◌','prism-veil':'◇','vector-bloom':'✺'}[scene.id];
  const body=document.createElement('span');body.className='ui-loop-scene-body';
  const title=document.createElement('strong');title.textContent=scene.name;
  const subtitle=document.createElement('small');subtitle.textContent=scene.category;
  body.append(title,subtitle);
  const arrow=document.createElement('span');arrow.className='ui-loop-scene-arrow';arrow.setAttribute('aria-hidden','true');arrow.textContent='↗';
  button.append(icon,body,arrow);
  button.addEventListener('click',()=>selectScene(scene.id,true));
  return button;
}
function updateCatalog(){
  const filtered=scenes.filter(item=>(category==='Alle'||item.category===category)&&
    [item.name,item.category,item.description,...item.tags].join(' ').toLocaleLowerCase('de').includes(search.toLocaleLowerCase('de')));
  const root=$('#ui-loop-scene-list');
  root.replaceChildren(...filtered.map(createButton));
  if(!filtered.length){const empty=document.createElement('p');empty.className='ui-loop-no-results';empty.textContent='Keine passenden Komponenten.';root.append(empty);}
  $('#ui-loop-result-count').textContent=String(filtered.length).padStart(2,'0');
  $$('#ui-loop-filters button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.category===category)));
}
function currentPreset(){return {scene:active.id,...engine.settings};}
function presetUrl(){
  const url=new URL(location.href);
  url.search=serializeMotionPreset(currentPreset(),url.search);
  return url;
}
function updateAddress(mode='replaceState'){
  history[mode]({scene:active.id},'',presetUrl());
}
function refreshUsage(){
  const snippet=formatMotionUsage(currentPreset());
  $('#ui-loop-usage-source').textContent=snippet;
  return snippet;
}
function applySettings(values){
  engine.configure(values);
  for(const [key,value] of Object.entries(defaults)){
    const input=$('#ui-loop-'+key);
    input.value=String(values[key]??value);
    $('#ui-loop-'+key+'-output').textContent=String(input.value)+({depth:'%',speed:'%',hue:'°'}[key]||'');
  }
  $$('.ui-loop-swatches button').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.hue)===Number($('#ui-loop-hue').value))));
  refreshUsage();
}
function selectScene(id,historyChange=false){
  const next=scenes.find(item=>item.id===id);
  if(!next)return;
  active=next;engine.setPlaying(false);engine.configure({scene:id});
  $('#ui-loop-crumb').textContent=next.name;
  $('#ui-loop-title').replaceChildren();
  const words=next.name.split(' ');
  $('#ui-loop-title').append(document.createTextNode(words.slice(0,-1).join(' ')+' '));
  const italic=document.createElement('em');italic.textContent=words.at(-1)+'.';$('#ui-loop-title').append(italic);
  $('#ui-loop-category').textContent=next.category.toUpperCase()+' / LIVE EXPERIMENT';
  $('#ui-loop-description').textContent=next.description;
  $('#ui-loop-stage-title').textContent=next.name;
  $('#ui-loop-stage-index').textContent=String(scenes.indexOf(next)+1).padStart(2,'0')+' / '+String(scenes.length).padStart(2,'0');
  const fav=favoriteIds.has(id);
  $('#ui-loop-favorite').setAttribute('aria-pressed',String(fav));
  $('#ui-loop-favorite').setAttribute('aria-label',fav?'Aus Favoriten entfernen':'Zu Favoriten hinzufügen');
  $('#ui-loop-favorite').textContent=(fav?'★':'☆')+(fav?' Gemerkt':' Merken');
  $('#ui-loop-canvas').setAttribute('aria-label',next.description+' Einstellungen über die Regler unterhalb.');
  refreshUsage();
  if(historyChange)updateAddress('pushState');
  updateCatalog();
}

function initializeFilters(){
  const categories=['Alle',...new Set(scenes.map(item=>item.category))];
  const filters=$('#ui-loop-filters');
  for(const name of categories){const button=document.createElement('button');button.type='button';button.dataset.category=name;button.textContent=name;button.addEventListener('click',()=>{category=name;updateCatalog()});filters.append(button);}
  updateCatalog();
}
searchInput.addEventListener('input',()=>{search=searchInput.value.trim();updateCatalog();});
searchInput.addEventListener('keydown',event=>{if(event.key==='Escape'){searchInput.value='';search='';updateCatalog();if(!compactViewport.matches)searchInput.blur();}});
window.addEventListener('keydown',event=>{
  const typing=event.target instanceof Element&&Boolean(event.target.closest('input,textarea,select,[contenteditable="true"]'));
  if((event.key==='/'&&!typing&&!event.ctrlKey&&!event.metaKey)||(event.key.toLowerCase()==='k'&&(event.metaKey||event.ctrlKey))){event.preventDefault();setCatalogOpen(true);searchInput.focus();searchInput.select();}
  if(event.key==='Escape')setCatalogOpen(false);
});
window.addEventListener('popstate',()=>{const preset=readMotionPreset(location.search,sceneIds);applySettings(preset);selectScene(preset.scene);});

for(const key of ['density','depth','speed','hue']){
  const input=$('#ui-loop-'+key),output=$('#ui-loop-'+key+'-output');
  input.addEventListener('input',()=>{
    const value=Number(input.value);
    output.textContent=String(value)+({depth:'%',speed:'%',hue:'°'}[key]||'');
    engine.configure({[key]:value});
    $$('.ui-loop-swatches button').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.hue)===Number($('#ui-loop-hue').value))));
    refreshUsage();
  });
  input.addEventListener('change',()=>updateAddress());
}
function reset(){
  engine.setPlaying(false);
  applySettings(defaults);
  updateAddress();
  notify('Einstellungen zurückgesetzt');
}
$('#ui-loop-reset').addEventListener('click',reset);
play.addEventListener('click',()=>{
  if(mql.matches){notify('Animation ist durch die Systemeinstellung reduziert.');return;}
  engine.setPlaying(!engine.running);
});
$$('.ui-loop-swatches button').forEach(button=>button.addEventListener('click',()=>{
  $('#ui-loop-hue').value=button.dataset.hue;
  $('#ui-loop-hue').dispatchEvent(new Event('input',{bubbles:true}));
  $('#ui-loop-hue').dispatchEvent(new Event('change',{bubbles:true}));
}));
$('#ui-loop-favorite').addEventListener('click',()=>{
  if(favoriteIds.has(active.id))favoriteIds.delete(active.id);else favoriteIds.add(active.id);
  selectScene(active.id);notify(favoriteIds.has(active.id)?'In dieser Sitzung gemerkt':'Aus Merkliste entfernt');
});
$('#ui-loop-copy-link').addEventListener('click',()=>copy(presetUrl().toString(),'Voreinstellungslink'));
$('#ui-loop-save-image').addEventListener('click',async()=>{
  const button=$('#ui-loop-save-image');
  button.disabled=true;
  engine.setPlaying(false);
  try {
    const blob=await new Promise(resolve=>$('#ui-loop-canvas').toBlob(resolve,'image/png'));
    if(!blob)throw new Error('PNG not available');
    const objectUrl=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=objectUrl;
    link.download='red-loop-'+active.id+'.png';
    document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(objectUrl),30000);
    notify('PNG zum Herunterladen vorbereitet');
  } catch {notify('PNG-Export fehlgeschlagen. Bitte später erneut versuchen.');}
  finally {button.disabled=false;}
});

$$('.ui-loop-device-buttons button').forEach(button=>button.addEventListener('click',()=>{
  const device=button.dataset.device;
  const permittedDevices=['macbook','windows','tablet','iphone','android'];
  if(!permittedDevices.includes(device))return;
  $('#ui-loop-stage').dataset.device=device;
  $('#ui-loop-dim').textContent=device.toUpperCase();
  $$('.ui-loop-device-buttons button').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
  window.requestAnimationFrame(engine.resize);
}));

function updateView(next){
  view=next;
  for(const name of ['preview','code','usage']){
    $('#ui-loop-'+name+'-panel').hidden=next!==name;
    $('#ui-loop-tab-'+name).setAttribute('aria-pressed',String(next===name));
  }
  if(next!=='preview')engine.setPlaying(false);
  else window.requestAnimationFrame(engine.resize);
}
$('#ui-loop-tab-preview').addEventListener('click',()=>updateView('preview'));
$('#ui-loop-tab-code').addEventListener('click',async()=>{
  updateView('code');
  if(sourceText)return;
  try {const response=await fetch('/motion-engine.js');if(!response.ok)throw new Error('Load failed');sourceText=await response.text();$('#ui-loop-code-source').textContent=sourceText;}
  catch {$('#ui-loop-code-source').textContent='Der Quellcode konnte nicht geladen werden. Bitte die Seite erneut laden.';}
});
$('#ui-loop-tab-usage').addEventListener('click',()=>updateView('usage'));
$('#ui-loop-copy-source').addEventListener('click',()=>sourceText?copy(sourceText,'Quellcode'):notify('Quellcode ist noch nicht verfügbar'));
$('#ui-loop-copy-usage').addEventListener('click',()=>copy(refreshUsage(),'Einbaubeispiel'));

function updateMotionPreference(){
  $('#ui-loop-motion-pref').textContent=mql.matches?'Reduziert':'Standard';
  play.disabled=mql.matches;
  if(mql.matches){engine.setPlaying(false);status.textContent='Bewegung systemseitig reduziert';}
  else if(!engine.running)status.textContent='Bewegung pausiert';
}
mql.addEventListener('change',updateMotionPreference);
updateMotionPreference();
initializeFilters();applySettings(initialPreset);selectScene(initialPreset.scene);

window.addEventListener('pagehide',()=>engine.setPlaying(false));
const catalogButton=$('#ui-loop-mobile-catalog');
const catalogSidebar=$('#ui-loop-sidebar');
const compactViewport=window.matchMedia('(max-width: 850px)');
function setCatalogOpen(open){
  const next=Boolean(open)&&compactViewport.matches;
  catalogSidebar.classList.toggle('ui-loop-sidebar--open',next);
  catalogSidebar.inert=compactViewport.matches&&!next;
  catalogButton.setAttribute('aria-expanded',String(next));
  if(!next&&compactViewport.matches&&catalogSidebar.contains(document.activeElement))catalogButton.focus();
}
catalogButton.addEventListener('click',()=>setCatalogOpen(catalogButton.getAttribute('aria-expanded')!=='true'));
$('#ui-loop-scene-list').addEventListener('click',()=>setCatalogOpen(false));
compactViewport.addEventListener('change',()=>setCatalogOpen(false));
setCatalogOpen(false);