import test from 'node:test';
import assert from 'node:assert/strict';
import {
  motionFavoritesStorageKey, readMotionFavorites, saveMotionFavorites,
  syncMotionFavoritesFromStorageEvent,
} from '../web/motion-favorites.js';

const scenes=['spectral-fold','glass-filament','vector-bloom','iris-caustics'];
function createStorage(){
  const entries=new Map();
  return {
    getItem:key=>entries.get(key)??null,
    setItem:(key,value)=>{entries.set(key,String(value));},
    removeItem:key=>{entries.delete(key);},
    entries,
  };
}

test('bookmarks survive a new studio instance and remain local',()=>{
  const storage=createStorage();
  assert.deepEqual(readMotionFavorites(storage,scenes),[]);
  assert.equal(saveMotionFavorites(storage,new Set(['glass-filament','vector-bloom']),scenes),true);
  assert.deepEqual(JSON.parse(storage.getItem(motionFavoritesStorageKey)),['glass-filament','vector-bloom']);
  // Simulate a new tab / refreshed module reading the same origin storage.
  const newSession=new Set(readMotionFavorites(storage,scenes));
  assert.deepEqual([...newSession],['glass-filament','vector-bloom']);
  newSession.delete('glass-filament');
  assert.equal(saveMotionFavorites(storage,newSession,scenes),true);
  assert.deepEqual(readMotionFavorites(storage,scenes),['vector-bloom']);
  newSession.clear();
  assert.equal(saveMotionFavorites(storage,newSession,scenes),true);
  assert.equal(storage.getItem(motionFavoritesStorageKey),null,'empty bookmarks remove the storage key');
});

test('unknown, duplicate and malformed entries are discarded',()=>{
  const storage=createStorage();
  storage.setItem(motionFavoritesStorageKey,JSON.stringify([
    'vector-bloom','not-an-effect','vector-bloom',null,17,{id:'glass-filament'},'glass-filament',
  ]));
  assert.deepEqual(readMotionFavorites(storage,scenes),['vector-bloom','glass-filament']);
  assert.equal(saveMotionFavorites(storage,['invalid','spectral-fold','spectral-fold',19],scenes),true);
  assert.deepEqual(JSON.parse(storage.getItem(motionFavoritesStorageKey)),['spectral-fold']);
  storage.setItem(motionFavoritesStorageKey,JSON.stringify({favorites:['vector-bloom']}));
  assert.deepEqual(readMotionFavorites(storage,scenes),[]);
  storage.setItem(motionFavoritesStorageKey,'{not valid JSON');
  assert.deepEqual(readMotionFavorites(storage,scenes),[]);
});

test('storage-disabled and quota-failed browsers retain in-memory functionality',()=>{
  const blocked={getItem(){throw new Error('SecurityError')},setItem(){throw new Error('QuotaExceededError')},removeItem(){throw new Error('SecurityError')}};
  assert.deepEqual(readMotionFavorites(null,scenes),[]);
  assert.equal(saveMotionFavorites(null,new Set(scenes),scenes),false);
  assert.deepEqual(readMotionFavorites(blocked,scenes),[]);
  assert.equal(saveMotionFavorites(blocked,new Set(scenes),scenes),false);
  assert.equal(saveMotionFavorites(blocked,new Set(),scenes),false);
  const memory=new Set(['glass-filament']);
  assert.deepEqual([...memory],['glass-filament'],'failed persistence never clears in-memory favorites');
});

test('stored favorites never include query parameters, settings or unrelated data',()=>{
  const storage=createStorage();
  const ids=new Set(['iris-caustics']);
  assert.equal(saveMotionFavorites(storage,ids,scenes),true);
  const raw=storage.getItem(motionFavoritesStorageKey);
  assert.equal(raw,'["iris-caustics"]');
  for(const prohibited of ['density','hue','speed','token','search','query']) {
    assert.equal(raw.includes(prohibited),false);
  }
});

test('cross-tab storage events update known favorites without writing back',()=>{
  const storage=createStorage();
  const favorites=new Set(['spectral-fold']);
  const event={
    key:motionFavoritesStorageKey,
    storageArea:storage,
    newValue:JSON.stringify(['vector-bloom','glass-filament','vector-bloom','not-a-scene']),
  };
  assert.equal(syncMotionFavoritesFromStorageEvent(event,storage,scenes,favorites),true);
  assert.deepEqual([...favorites],['vector-bloom','glass-filament']);
  assert.equal(storage.entries.size,0,'the receiving tab does not write to storage');
  assert.equal(syncMotionFavoritesFromStorageEvent(event,storage,scenes,favorites),false,'an unchanged event does not trigger re-render');
});

test('cross-tab sync ignores unrelated keys and different storage areas',()=>{
  const storage=createStorage();
  const anotherStorage=createStorage();
  const favorites=new Set(['iris-caustics']);
  const incoming=JSON.stringify(['vector-bloom']);
  assert.equal(syncMotionFavoritesFromStorageEvent({
    key:'unrelated.setting',storageArea:storage,newValue:incoming,
  },storage,scenes,favorites),false);
  assert.equal(syncMotionFavoritesFromStorageEvent({
    key:motionFavoritesStorageKey,storageArea:anotherStorage,newValue:incoming,
  },storage,scenes,favorites),false);
  assert.equal(syncMotionFavoritesFromStorageEvent({
    key:motionFavoritesStorageKey,storageArea:storage,newValue:incoming,
  },null,scenes,favorites),false);
  assert.equal(syncMotionFavoritesFromStorageEvent(null,storage,scenes,favorites),false);
  assert.deepEqual([...favorites],['iris-caustics']);
});

test('browser storage clearing and removed last bookmark update other tabs',()=>{
  const storage=createStorage();
  const favorites=new Set(['iris-caustics','vector-bloom']);
  assert.equal(syncMotionFavoritesFromStorageEvent({
    key:motionFavoritesStorageKey,storageArea:storage,newValue:null,
  },storage,scenes,favorites),true);
  assert.equal(favorites.size,0,'removeItem event clears bookmarks');
  favorites.add('spectral-fold');
  assert.equal(syncMotionFavoritesFromStorageEvent({
    key:null,storageArea:storage,newValue:null,
  },storage,scenes,favorites),true);
  assert.equal(favorites.size,0,'localStorage.clear event clears bookmarks');
});

test('malformed and unknown remote favorite IDs never enter the catalog',()=>{
  const storage=createStorage();
  const favorites=new Set(['iris-caustics']);
  assert.equal(syncMotionFavoritesFromStorageEvent({
    key:motionFavoritesStorageKey,storageArea:storage,newValue:'{malformed',
  },storage,scenes,favorites),true);
  assert.equal(favorites.size,0);
  assert.equal(syncMotionFavoritesFromStorageEvent({
    key:motionFavoritesStorageKey,storageArea:storage,
    newValue:JSON.stringify([null,'vector-bloom','old-removed-scene',42,'vector-bloom']),
  },storage,scenes,favorites),true);
  assert.deepEqual([...favorites],['vector-bloom']);
});
