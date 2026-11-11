import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ensureReleaseIdentity,prepareRelease} from '../scripts/release-auto.mjs';
import {verifyRelease} from '../scripts/signed-script.mjs';

const source=version=>[
  '// ==UserScript==','// @version '+version,'// ==/UserScript==',
  "(()=>{const a='red-loop-root';const b='__RED_LOOP_HOST__';const c='rl-start rl-stop';void a;void b;void c;})();"
].join('\n');
async function setup(){const root=await mkdtemp(join(tmpdir(),'rl-release-auto-'));await mkdir(join(root,'userscripts'));await writeFile(join(root,'userscripts','red-loop.user.js'),source('0.5.0'));return root;}

test('one step generates a private P-256 key, public trust anchor and signed sequence 1',async()=>{
  const root=await setup();const result=await prepareRelease(root);
  assert.equal(result.sequence,1);assert.equal(result.status,'signed');
  const [key,manifest,script]=await Promise.all([readFile(join(root,'release','release-public.pem'),'utf8'),readFile(join(root,'red-loop-signed-release','red-loop-webview.manifest.json'),'utf8'),readFile(join(root,'red-loop-signed-release','red-loop-webview.js'))]);
  assert.match(key,/BEGIN PUBLIC KEY/);assert.equal(JSON.parse(manifest).sequence,1);
  assert.ok(verifyRelease({script,manifest:JSON.parse(manifest),publicKey:key}));
  const info=await stat(join(root,'release-secrets','release-private.pem'));
  if(process.platform!=='win32') assert.equal(info.mode & 0o077,0);
});
test('identical source is a no-op; changed source increments the sequence and preserves key',async()=>{
  const root=await setup();await prepareRelease(root);
  const before=await readFile(join(root,'release-secrets','release-private.pem'),'utf8');
  assert.equal((await prepareRelease(root)).status,'unchanged');
  await writeFile(join(root,'userscripts','red-loop.user.js'),source('0.5.1'));
  const updated=await prepareRelease(root);assert.equal(updated.sequence,2);assert.equal(updated.status,'signed');
  assert.equal((await ensureReleaseIdentity(root)).state.lastSequence,2);
  assert.equal(await readFile(join(root,'release-secrets','release-private.pem'),'utf8'),before);
});
test('changed trust anchor is rejected and never silently overwritten',async()=>{
  const root=await setup();await prepareRelease(root);
  await writeFile(join(root,'release','release-public.pem'),'incorrect');
  await assert.rejects(prepareRelease(root),/Tracked public release key changed/);
});
test('corrupt state or partial output fail closed without reusing sequence',async()=>{
  const root=await setup();await prepareRelease(root);
  await writeFile(join(root,'red-loop-signed-release','red-loop-webview.manifest.json'),'not-json');
  await assert.rejects(prepareRelease(root),/Previous signed manifest is corrupt/);
  await writeFile(join(root,'release-secrets','release-state.json'),'{}');
  await assert.rejects(ensureReleaseIdentity(root),/Release state is invalid/);
});
