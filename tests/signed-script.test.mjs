import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {signRelease, verifyRelease, scriptBytes, manifestMessage} from '../scripts/signed-script.mjs';

const fixture = version => ['// ==UserScript==','// @version '+version,'// ==/UserScript==','(() => {',"const root='red-loop-root';","const host='__RED_LOOP_HOST__';","const buttons='rl-start rl-stop';",'void root;void host;void buttons;','})();'].join('\n');
const keys = () => generateKeyPairSync('ec', {namedCurve:'prime256v1', privateKeyEncoding:{type:'pkcs8',format:'pem'}, publicKeyEncoding:{type:'spki',format:'pem'}});

test('P-256 release signatures pin exact script bytes and enforce minimum sequence/version',()=>{
  const {privateKey,publicKey}=keys();
  const release=signRelease({script:fixture('0.5.1'),privateKey,sequence:3});
  assert.ok(verifyRelease({...release,publicKey,minimumSequence:3,minimumVersion:'0.5.0'}));
  assert.equal(verifyRelease({...release,publicKey,minimumSequence:4}),false);
  assert.equal(verifyRelease({...release,publicKey,minimumVersion:'0.6.0'}),false);
  assert.equal(verifyRelease({...release,script:fixture('0.5.2'),publicKey}),false);
  assert.equal(verifyRelease({...release,script:'// injected\n'+fixture('0.5.1'),publicKey}),false);
  assert.equal(verifyRelease({...release,publicKey:keys().publicKey}),false);
});

test('modified or unsigned release metadata is rejected',()=>{
  const {privateKey,publicKey}=keys();
  const release=signRelease({script:fixture('0.6.0'),privateKey,sequence:5});
  for(const patch of [{sequence:4},{version:'0.6.1'},{sha256:'a'.repeat(64)},{signature:'abc'},{format:'other'},{unexpected:true}]){
    let accepted=false;
    try{accepted=verifyRelease({...release,manifest:{...release.manifest,...patch},publicKey});}catch{}
    assert.equal(accepted,false,JSON.stringify(patch));
  }
});

test('invalid formats, keys, versions, scripts and sequence fail closed',()=>{
  const {privateKey,publicKey}=keys();
  for(const version of ['1.2.x','01.2.3','1.2','1000000000.2.3']) assert.throws(()=>scriptBytes(fixture(version)));
  assert.throws(()=>scriptBytes('x'.repeat(262145)));
  assert.throws(()=>scriptBytes('<html>not a userscript</html>'));
  assert.throws(()=>signRelease({script:fixture('1.0.0'),privateKey,sequence:0}));
  assert.throws(()=>manifestMessage({version:'1.0.0',sequence:-1,sha256:'0'.repeat(64)}));
  const release=signRelease({script:fixture('1.0.0'),privateKey,sequence:1});
  assert.throws(()=>verifyRelease({...release,publicKey,minimumSequence:0}));
});

test('CLI signs locally and verifies with public key without leaking private key',async()=>{
  const {privateKey,publicKey}=keys();
  const dir=await mkdtemp(join(tmpdir(),'red-loop-sign-test-'));
  const privatePath=join(dir,'private.pem'),publicPath=join(dir,'public.pem'),scriptPath=join(dir,'script.js'),outPath=join(dir,'out');
  await Promise.all([writeFile(privatePath,privateKey),writeFile(publicPath,publicKey),writeFile(scriptPath,fixture('1.2.3'))]);
  const tool=new URL('../scripts/signed-script.mjs',import.meta.url).pathname;
  const signed=spawnSync(process.execPath,[tool,'--sign','--script',scriptPath,'--private-key',privatePath,'--sequence','17','--out',outPath],{encoding:'utf8'});
  assert.equal(signed.status,0,signed.stderr);
  assert.equal(signed.stdout.includes('PRIVATE KEY'),false);
  const manifest=JSON.parse(await readFile(join(outPath,'red-loop-webview.manifest.json'),'utf8'));
  assert.equal(manifest.sequence,17);
  const command=[tool,'--verify','--script',join(outPath,'red-loop-webview.js'),'--manifest',join(outPath,'red-loop-webview.manifest.json'),'--public-key',publicPath];
  const valid=spawnSync(process.execPath,[...command,'--min-sequence','17'],{encoding:'utf8'});
  assert.equal(valid.status,0,valid.stderr);
  const stale=spawnSync(process.execPath,[...command,'--min-sequence','18'],{encoding:'utf8'});
  assert.notEqual(stale.status,0);
});
