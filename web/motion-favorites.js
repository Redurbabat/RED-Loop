/**
 * RED Loop Motion Studio bookmarks. Local-only and versioned; never saves
 * search text, shared URL parameters, account data, or animation settings.
 */
export const motionFavoritesStorageKey='red-loop.motion-studio.favorites.v1';

function normalizeFavoriteIds(ids,availableSceneIds){
  if(!Array.isArray(ids))return [];
  const allowed=new Set(availableSceneIds);
  return [...new Set(ids.filter(id=>typeof id==='string'&&allowed.has(id)))];
}

/** A private-mode / denied-storage browser must not break the studio. */
export function readMotionFavorites(storage,availableSceneIds){
  try{
    if(!storage)return [];
    const stored=storage.getItem(motionFavoritesStorageKey);
    if(!stored)return [];
    return normalizeFavoriteIds(JSON.parse(stored),availableSceneIds);
  }catch{
    return [];
  }
}

/** Persist only currently available scene IDs. Returns false when storage is blocked. */
export function saveMotionFavorites(storage,ids,availableSceneIds){
  try{
    if(!storage)return false;
    const favorites=normalizeFavoriteIds([...ids],availableSceneIds);
    if(favorites.length)storage.setItem(motionFavoritesStorageKey,JSON.stringify(favorites));
    else storage.removeItem(motionFavoritesStorageKey);
    return true;
  }catch{
    return false;
  }
}

/**
 * Apply same-origin changes received from another tab. The browser's storage
 * event is not dispatched on the tab that made the change, so local clicks
 * continue to update their own in-memory Set as before.
 *
 * Returns true only when the visible bookmark membership changed.
 */
export function syncMotionFavoritesFromStorageEvent(event,storage,availableSceneIds,favoriteIds){
  if(!storage||!event||!favoriteIds||event.storageArea!==storage)return false;
  if(event.key!==motionFavoritesStorageKey&&event.key!==null)return false;
  let parsed=[];
  try{
    if(event.key!==null&&event.newValue!==null)parsed=JSON.parse(event.newValue);
  }catch{
    // Invalid values behave like an empty bookmark list at startup.
  }
  const incoming=normalizeFavoriteIds(parsed,availableSceneIds);
  if(incoming.length===favoriteIds.size&&incoming.every(id=>favoriteIds.has(id)))return false;
  favoriteIds.clear();
  for(const id of incoming)favoriteIds.add(id);
  return true;
}
