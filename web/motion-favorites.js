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
