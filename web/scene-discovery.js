/**
 * RED Morph homepage discovery: a fast index of the original motion studies.
 * Uses local metadata only, never requests cloud jobs or sends search terms.
 */
import {scenes} from './motion-engine.js';
import {motionFavoritesStorageKey,readMotionFavorites} from './motion-favorites.js';

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

export function initMotionDiscovery(doc=document){
  const results=doc.getElementById('scene-discovery-results');
  if(!results)return null;
  const win=doc.defaultView;
  const search=doc.getElementById('scene-discovery-search');
  const filterRoot=doc.getElementById('scene-discovery-filters');
  const count=doc.getElementById('scene-discovery-count');
  const empty=doc.getElementById('scene-discovery-empty');
  const reset=doc.getElementById('scene-discovery-reset');
  const stored=(()=>{try{return win.localStorage}catch{return null}})();
  let savedIds=new Set(readMotionFavorites(stored,sceneIds));
  let category='Alle';

  function render(){
    const focusedScene=doc.activeElement?.closest?.('#scene-discovery-results a[data-scene]')?.dataset.scene;
    const matches=findMotionScenes(scenes,{query:search.value,category,favorites:savedIds});
    const cards=matches.map(scene=>{
      const index=scenes.findIndex(item=>item.id===scene.id)+1;
      const link=doc.createElement('a');
      link.className='scene-discovery-card';
      link.href=motionSceneHref(scene.id);
      link.dataset.scene=scene.id;
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
      end.textContent=savedIds.has(scene.id)?'★':'↗';
      if(savedIds.has(scene.id))link.setAttribute('aria-label',scene.name+', gemerkt, '+scene.category);
      link.append(ordinal,details,end);
      return link;
    });
    results.replaceChildren(...cards);
    count.textContent=matches.length===1?'1 Komponente gefunden':matches.length+' Komponenten gefunden';
    empty.hidden=matches.length!==0;
    for(const button of filterRoot.querySelectorAll('button[data-category]')){
      button.setAttribute('aria-pressed',String(button.dataset.category===category));
      if(button.dataset.category==='Gemerkte'){
        button.textContent='★ Gemerkte ('+savedIds.size+')';
      }
    }
    if(focusedScene){
      const replacement=cards.find(card=>card.dataset.scene===focusedScene);
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
  return {render,get category(){return category},get favorites(){return new Set(savedIds)}};
}

if(typeof document!=='undefined')initMotionDiscovery(document);
