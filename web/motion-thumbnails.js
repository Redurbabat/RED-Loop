/**
 * Static, lazy previews of RED Morph's original Canvas studies.
 * The canonical motion engine produces the pixels; no animation is started.
 */
import {createMotionEngine,scenes} from './motion-engine.js';

const validSceneIds=new Set(scenes.map(scene=>scene.id));

export function paintStaticMotionThumbnail(canvas,sceneId,createEngine=createMotionEngine){
  if(!canvas||typeof canvas.getContext!=='function'||!validSceneIds.has(sceneId))return false;
  let engine;
  try{
    engine=createEngine(canvas);
    engine.configure({scene:sceneId});
    // Forces one current static frame; any deferred render is cancelled.
    return engine.renderForExport()===true;
  }catch{
    // Canvas 2D and ResizeObserver support vary across embedded browsers.
    // The card still retains its CSS-only optical background and text link.
    return false;
  }finally{
    // No playing engines, RAF callbacks, global listeners or observers remain.
    try{engine?.destroy()}catch{}
  }
}

/**
 * Render each visible thumbnail once. Return cleanup for rerendered result sets.
 * Browser without IntersectionObserver falls back to immediate static frames.
 */
export function observeStaticMotionThumbnails(root,{win=root?.ownerDocument?.defaultView,paint=paintStaticMotionThumbnail}={}){
  if(!root)return ()=>{};
  const previews=[...root.querySelectorAll('canvas[data-scene]')];
  const paintOnce=canvas=>{
    if(canvas.dataset.previewReady==='true')return;
    // Invisible/zero-size canvases must not create engines or allocations.
    const rect=canvas.getBoundingClientRect?.();
    if(!rect||rect.width<=0||rect.height<=0)return;
    if(paint(canvas,canvas.dataset.scene))canvas.dataset.previewReady='true';
  };
  if(typeof win?.IntersectionObserver!=='function'){
    for(const canvas of previews)paintOnce(canvas);
    return ()=>{};
  }
  const observer=new win.IntersectionObserver(entries=>{
    for(const entry of entries){
      if(entry.isIntersecting) {
        paintOnce(entry.target);
        // Once a static bitmap is drawn, it needs no further observation.
        if(entry.target.dataset.previewReady==='true')observer.unobserve(entry.target);
      }
    }
  },{rootMargin:'120px 0px',threshold:0});
  for(const canvas of previews)observer.observe(canvas);
  return ()=>observer.disconnect();
}
