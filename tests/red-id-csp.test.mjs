import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/src/index.js';
test('RED identity page permits only an explicitly selected HTTPS origin; other pages stay locked',async()=>{
 const base='https://loop.example.test';
 const get=(path,home)=>worker.fetch(new Request(base+path),{REDION_HOME_ORIGIN:home,ASSETS:{fetch:async()=>new Response('test')}});
 const policy=async(path,home)=>(await get(path,home)).headers.get('content-security-policy');
 assert.match(await policy('/red-id.html','https://home.example.test'),/connect-src 'self' https:\/\/home\.example\.test;/);
 assert.match(await policy('/','https://home.example.test'),/connect-src 'self';/);
 assert.match(await policy('/red-id.html','https://home.example.test; script-src *'),/connect-src 'self';/);
 assert.match(await policy('/red-id.html','http://home.example.test'),/connect-src 'self';/);
});
