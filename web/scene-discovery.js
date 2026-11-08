/**
 * RED Morph homepage discovery: a fast index of the original motion studies.
 * Uses local metadata only, never requests cloud jobs or sends search terms.
 */
import {scenes} from './motion-engine.js';
import {motionFavoritesStorageKey,readMotionFavorites,saveMotionFavorites} from './motion-favorites.js';
import {observeStaticMotionThumbnails} from './motion-thumbnails.js';
import {defaultMotionSettings,formatMotionUsage} from './motion-presets.js';

const categories=['Alle','Gemerkte',...new Set(scenes.map(scene=>scene.category))];
const sceneIds=scenes.map(scene=>scene.id);

function normalize(value){
  return String(value??'').toLocaleLowerCase('de').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g,'').replace(/ß/g,'ss').trim();
}

export function findMotionScenes(items,{query='',category='Alle',favorites=[]}={}){
  const saved=new Set(favorites);
  const terms=normalize(query).split(/\s+/).filter(Boolean);
  return items.filter(item=>{
    if(category==='Gemerkte'&&!saved.has(item.id))return false;
    if(category!=='Alle'&&category!=='Gemerkte'&&item.category!==category)return false;
    const haystack=normalize([item.name,item.category,item.description,...item.tags].join(' '));
    return terms.every(term=>haystack.includes(term));
  }).sort((a,b)=>Number(saved.has(b.id))-Number(saved.has(a.id)));
}

export function motionSceneHref(sceneId){
  if(!sceneIds.includes(sceneId))return null;
  return '/motion-studio.html?scene='+encodeURIComponent(sceneId);
}

/** Keep at most two unique, known scenes. A third pick replaces the oldest. */
export function toggleMotionComparison(current,sceneId,availableIds=sceneIds){
  const allowed=new Set(availableIds);
  const unique=[...new Set(Array.isArray(current)?current:[])]
    .filter(id=>allowed.has(id)).slice(-2);
  if(!allowed.has(sceneId))return unique;
  if(unique.includes(sceneId))return unique.filter(id=>id!==sceneId);
  return [...unique.slice(-1),sceneId];
}

export function initMotionDiscovery(doc=document){
  const results=doc.getElementById('scene-discovery-results');
  if(!results)return null;
  const win=doc.defaultView;
  const search=doc.getElementById('scene-discovery-search');
  const filterRoot=doc.getElementById('scene-discovery-filters');
  const count=doc.getElementById('scene-discovery-count');
  const empty=doc.getElementById('scene-discovery-empty');
  const reset=doc.getElementById('scene-discovery-reset');
  const feedback=doc.getElementById('scene-discovery-feedback');
  const comparison=doc.getElementById('scene-discovery-comparison');
  const comparisonItems=doc.getElementById('scene-discovery-comparison-items');
  const comparisonCount=doc.getElementById('scene-discovery-comparison-count');
  const comparisonClear=doc.getElementById('scene-discovery-comparison-clear');
  const usagePanel=doc.getElementById('scene-discovery-usage');
  const usageScene=doc.getElementById('scene-discovery-usage-scene');
  const usageText=doc.getElementById('scene-discovery-usage-text');
  const usageSource=doc.getElementById('scene-discovery-usage-source');
  const usageCopy=doc.getElementById('scene-discovery-usage-copy');
  const usageClose=doc.getElementById('scene-discovery-usage-close');
  const stored=(()=>{try{return win.localStorage}catch{return null}})();
  let savedIds=new Set(readMotionFavorites(stored,sceneIds));
  let category='Alle';
  let stopObservingThumbnails=()=>{};
  let stopObservingComparison=()=>{};
  let comparedIds=[];
  let openUsageScene=null;
  
  function updateUsageControls(){
    for(const button of results.querySelectorAll('button[data-usage]')){
      button.setAttribute('aria-expanded',String(button.dataset.usage===openUsageScene));
    }
  }
  function showUsage(sceneId){
    const scene=scenes.find(item=>item.id===sceneId);
    if(!scene)return;
    openUsageScene=scene.id;
    usageScene.textContent=scene.name;
    // Use the exact same canonical integration snippet as Motion Studio.
    usageText.textContent=formatMotionUsage({scene:scene.id,...defaultMotionSettings});
    usagePanel.hidden=false;
    updateUsageControls();
    usageSource.focus();
    feedback.textContent='Einbau-Code für '+scene.name+' geöffnet';
  }
  function closeUsage(){
    const previous=openUsageScene;
    openUsageScene=null;
    usagePanel.hidden=true;
    updateUsageControls();
    const origin=[...results.querySelectorAll('button[data-usage]')]
      .find(button=>button.dataset.usage===previous);
    (origin||search).focus();
    feedback.textContent='Einbau-Code geschlossen';
  }
  usageClose.addEventListener('click',closeUsage);
  usageCopy.addEventListener('click',async()=>{
    const snippet=usageText.textContent;
    const label=usageScene.textContent;
    if(!openUsageScene||!snippet)return;
    try{
      if(!win.navigator?.clipboard?.writeText)throw new Error('Clipboard API unavailable');
      await win.navigator.clipboard.writeText(snippet);
      feedback.textContent='Einbau-Code für '+label+' kopiert';
    }catch{
      usageSource.focus();
      feedback.textContent='Kopieren nicht verfügbar. Bitte den Code manuell markieren.';
    }
  });

  // Compare remains independent of active filters and saved bookmarks.
  // Changing a selection never rebuilds the gallery or redraws its thumbnails.
  function renderComparison(){
    stopObservingComparison();
    comparison.hidden=comparedIds.length===0;
    comparisonCount.textContent=comparedIds.length+' / 2';
    const entries=comparedIds.map(id=>{
      const scene=scenes.find(item=>item.id===id);
      const entry=doc.createElement('div');
      entry.className='scene-comparison-item';
      const preview=doc.createElement('div');
      preview.className='scene-comparison-preview';
      preview.setAttribute('aria-hidden','true');
      const canvas=doc.createElement('canvas');
      canvas.dataset.scene=scene.id;
      canvas.setAttribute('aria-hidden','true');
      preview.append(canvas);
      const link=doc.createElement('a');
      link.className='scene-comparison-link';
      link.href=motionSceneHref(scene.id);
      link.textContent=scene.name+' ↗';
      const categoryText=doc.createElement('span');
      categoryText.className='scene-comparison-category';
      categoryText.textContent=scene.category;
      const remove=doc.createElement('button');
      remove.type='button';
      remove.dataset.removeCompare=scene.id;
      remove.textContent='Entfernen';
      remove.setAttribute('aria-label',scene.name+' aus Vergleich entfernen');
      remove.addEventListener('click',()=>{
        comparedIds=toggleMotionComparison(comparedIds,scene.id,sceneIds);
        renderComparison();
        const corresponding=[...results.querySelectorAll('button[data-compare]')]
          .find(item=>item.dataset.compare===scene.id);
        (corresponding||search).focus();
        feedback.textContent=scene.name+' aus Vergleich entfernt';
      });
      entry.append(preview,categoryText,link,remove);
      return entry;
    });
    if(comparedIds.length===1){
      const placeholder=doc.createElement('p');
      placeholder.className='scene-comparison-placeholder';
      placeholder.textContent='Wähle unten ein zweites Motiv zum direkten Vergleich.';
      entries.push(placeholder);
    }
    comparisonItems.replaceChildren(...entries);
    if(comparedIds.length)stopObservingComparison=observeStaticMotionThumbnails(comparisonItems,{win});
    else stopObservingComparison=()=>{};
    for(const button of results.querySelectorAll('button[data-compare]')){
      const selected=comparedIds.includes(button.dataset.compare);
      const scene=scenes.find(item=>item.id===button.dataset.compare);
      button.setAttribute('aria-pressed',String(selected));
      button.setAttribute('aria-label',scene.name+(selected?' aus Vergleich entfernen':' zum Vergleich hinzufügen'));
      button.textContent=selected?'✓ Im Vergleich':'↔ Vergleichen';
    }
  }

  comparisonClear.addEventListener('click',()=>{
    comparedIds=[];
    renderComparison();
    search.focus();
    feedback.textContent='Vergleichsauswahl gelöscht';
  });

  function render(){
    const focusedScene=doc.activeElement?.closest?.('#scene-discovery-results a[data-scene]')?.dataset.scene;
    const focusedBookmark=doc.activeElement?.closest?.('#scene-discovery-results button[data-bookmark]')?.dataset.bookmark;
    const focusedUsage=doc.activeElement?.closest?.('#scene-discovery-results button[data-usage]')?.dataset.usage;
    const matches=findMotionScenes(scenes,{query:search.value,category,favorites:savedIds});
    const cards=matches.map(scene=>{
      const index=scenes.findIndex(item=>item.id===scene.id)+1;
      const entry=doc.createElement('div');
      entry.className='scene-discovery-entry';
      entry.dataset.scene=scene.id;
      const link=doc.createElement('a');
      link.className='scene-discovery-card';
      link.href=motionSceneHref(scene.id);
      link.dataset.scene=scene.id;
      const preview=doc.createElement('span');
      preview.className='scene-discovery-card-preview';
      preview.setAttribute('aria-hidden','true');
      const canvas=doc.createElement('canvas');
      canvas.dataset.scene=scene.id;
      canvas.setAttribute('aria-hidden','true');
      preview.append(canvas);
      const ordinal=doc.createElement('span');
      ordinal.className='scene-discovery-index';
      ordinal.textContent=String(index).padStart(2,'0');
      ordinal.setAttribute('aria-hidden','true');
      const details=doc.createElement('span');
      details.className='scene-discovery-card-body';
      const categoryLine=doc.createElement('small');
      categoryLine.className='scene-discovery-card-category';
      categoryLine.textContent=scene.category;
      const title=doc.createElement('strong');
      title.textContent=scene.name;
      const description=doc.createElement('span');
      description.className='scene-discovery-card-description';
      description.textContent=scene.description;
      details.append(categoryLine,title,description);
      const end=doc.createElement('span');
      end.className='scene-discovery-card-end';
      end.setAttribute('aria-hidden','true');
      end.textContent='↗';
      if(savedIds.has(scene.id))link.setAttribute('aria-label',scene.name+', gemerkt, '+scene.category);
      const content=doc.createElement('span');
      content.className='scene-discovery-card-content';
      content.append(ordinal,details,end);
      link.append(preview,content);
      const bookmarked=savedIds.has(scene.id);
      const bookmark=doc.createElement('button');
      bookmark.type='button';
      bookmark.className='scene-discovery-bookmark';
      bookmark.dataset.bookmark=scene.id;
      bookmark.setAttribute('aria-pressed',String(bookmarked));
      bookmark.setAttribute('aria-label',bookmarked
        ?scene.name+' aus Favoriten entfernen'
        :scene.name+' zu Favoriten hinzufügen');
      bookmark.textContent=bookmarked?'★':'☆';
      bookmark.addEventListener('click',()=>{
        if(savedIds.has(scene.id))savedIds.delete(scene.id);
        else savedIds.add(scene.id);
        const persisted=saveMotionFavorites(stored,savedIds,sceneIds);
        const isSaved=savedIds.has(scene.id);
        feedback.textContent=isSaved
          ?(persisted?scene.name+' lokal gemerkt':scene.name+' in dieser Sitzung gemerkt')
          :scene.name+' aus Favoriten entfernt';
        render();
      });
      const compare=doc.createElement('button');
      compare.type='button';
      compare.className='scene-discovery-compare-toggle';
      compare.dataset.compare=scene.id;
      const chosen=comparedIds.includes(scene.id);
      compare.setAttribute('aria-pressed',String(chosen));
      compare.setAttribute('aria-label',scene.name+(chosen?' aus Vergleich entfernen':' zum Vergleich hinzufügen'));
      compare.textContent=chosen?'✓ Im Vergleich':'↔ Vergleichen';
      compare.addEventListener('click',()=>{
        const before=comparedIds;
        comparedIds=toggleMotionComparison(comparedIds,scene.id,sceneIds);
        const replaced=before.length===2&&!before.includes(scene.id)?before[0]:null;
        feedback.textContent=replaced
          ?scene.name+' ersetzt '+scenes.find(item=>item.id===replaced).name+' im Vergleich'
          :scene.name+(comparedIds.includes(scene.id)?' für Vergleich ausgewählt':' aus Vergleich entfernt');
        renderComparison();
      });
      const usageButton=doc.createElement('button');
      usageButton.type='button';
      usageButton.className='scene-discovery-usage-toggle';
      usageButton.dataset.usage=scene.id;
      usageButton.setAttribute('aria-controls','scene-discovery-usage');
      usageButton.setAttribute('aria-expanded',String(openUsageScene===scene.id));
      usageButton.setAttribute('aria-label',scene.name+' Einbau-Code anzeigen');
      usageButton.textContent='⌘ Einbau-Code';
      usageButton.addEventListener('click',()=>showUsage(scene.id));
      const actions=doc.createElement('div');
      actions.className='scene-discovery-actions';
      actions.append(compare,usageButton);
      // All card actions are siblings of the scene link.
      entry.append(link,bookmark,actions);
      return entry;
    });
    // Disconnect observation of detached canvases before replacing results.
    stopObservingThumbnails();
    results.replaceChildren(...cards);
    stopObservingThumbnails=observeStaticMotionThumbnails(results,{win});
    count.textContent=matches.length===1?'1 Komponente gefunden':matches.length+' Komponenten gefunden';
    empty.hidden=matches.length!==0;
    for(const button of filterRoot.querySelectorAll('button[data-category]')){
      button.setAttribute('aria-pressed',String(button.dataset.category===category));
      if(button.dataset.category==='Gemerkte'){
        button.textContent='★ Gemerkte ('+savedIds.size+')';
      }
    }
    if(focusedScene){
      const replacement=cards.find(card=>card.dataset.scene===focusedScene)
        ?.querySelector('a[data-scene]');
      (replacement||search).focus();
    }else if(focusedBookmark){
      const replacement=cards.find(card=>card.dataset.scene===focusedBookmark)
        ?.querySelector('button[data-bookmark]');
      (replacement||search).focus();
    }else if(focusedUsage){
      const replacement=cards.find(card=>card.dataset.scene===focusedUsage)
        ?.querySelector('button[data-usage]');
      (replacement||search).focus();
    }
    return cards;
  }

  for(const name of categories){
    const button=doc.createElement('button');
    button.type='button';
    button.dataset.category=name;
    button.textContent=name;
    button.setAttribute('aria-pressed',String(name===category));
    button.addEventListener('click',()=>{category=name;render()});
    filterRoot.append(button);
  }

  search.addEventListener('input',render);
  search.addEventListener('keydown',event=>{
    if(event.altKey||event.ctrlKey||event.metaKey)return;
    const cards=[...results.querySelectorAll('a[data-scene]')];
    if(event.key==='ArrowDown'&&cards.length){
      event.preventDefault();
      cards[0].focus();
    }else if(event.key==='Enter'&&search.value.trim()&&cards.length){
      event.preventDefault();
      cards[0].click();
    }
  });
  results.addEventListener('keydown',event=>{
    if(event.altKey||event.ctrlKey||event.metaKey)return;
    if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
    const cards=[...results.querySelectorAll('a[data-scene]')];
    const index=cards.indexOf(event.target);
    if(index<0)return;
    event.preventDefault();
    const next=event.key==='Home'?cards[0]:event.key==='End'?cards.at(-1)
      :event.key==='ArrowUp'?(cards[index-1]||search)
      :(cards[index+1]||search);
    next.focus();
  });
  reset.addEventListener('click',()=>{
    search.value='';
    category='Alle';
    render();
    search.focus();
  });
  win.addEventListener('storage',event=>{
    if(!stored||event.storageArea!==stored)return;
    if(event.key!==motionFavoritesStorageKey&&event.key!==null)return;
    const next=new Set(readMotionFavorites(stored,sceneIds));
    if(next.size===savedIds.size&&[...next].every(id=>savedIds.has(id)))return;
    savedIds=next;
    render();
  });

  render();
  return {render,get category(){return category},get favorites(){return new Set(savedIds)},get comparison(){return [...comparedIds]},get usageScene(){return openUsageScene}};
}

if(typeof document!=='undefined')initMotionDiscovery(document);
