import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/src/index.js';
test('health endpoint and secure headers', async () => {
  const res = await worker.fetch(new Request('https://test/health'),{});
  assert.equal(res.status,200); assert.equal((await res.json()).storesConversations,false);
  assert.match(res.headers.get('content-security-policy'),/frame-ancestors 'none'/);
});
test('assets and missing paths retain status and security headers', async () => {
  const res = await worker.fetch(new Request('https://test/missing'),{ASSETS:{fetch:async()=>new Response('Missing',{status:404})}});
  assert.equal(res.status,404); assert.equal(res.headers.get('x-content-type-options'),'nosniff');
});
test('reject mutations and handle asset failures', async () => {
  assert.equal((await worker.fetch(new Request('https://test/',{method:'POST'}),{})).status,405);
  assert.equal((await worker.fetch(new Request('https://test/'),{ASSETS:{fetch:async()=>{throw new Error();}}})).status,503);
});
test('HEAD has no body', async () => { const res=await worker.fetch(new Request('https://test/health',{method:'HEAD'}),{}); assert.equal(await res.text(),''); });
