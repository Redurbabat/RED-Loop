import {readFile, readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import xcode from 'xcode';
import YAML from 'yaml';
import {unzipSync} from 'fflate';
async function walk(dir) { return (await Promise.all((await readdir(dir,{withFileTypes:true})).map(e=>e.isDirectory()?walk(`${dir}/${e.name}`):`${dir}/${e.name}`))).flat(); }
const files=(await Promise.all(['web','cloudflare','userscripts','scripts','tests'].map(walk))).flat();
for(const file of files.filter(f=>/\.(mjs|js)$/.test(f))){const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});assert.equal(r.status,0,`${file}: ${r.stderr}`);}
for(const file of (await walk('ios')).filter(f=>f.endsWith('.json'))) JSON.parse(await readFile(file,'utf8'));
const p=xcode.project('ios/REDLoop.xcodeproj/project.pbxproj'); p.parseSync();
assert.equal(Object.keys(p.pbxNativeTargetSection()).filter(k=>!k.endsWith('_comment')).length,3);
const manifest=JSON.parse(await readFile('ios/REDLoopExtension/Resources/manifest.json','utf8'));
assert.equal(manifest.manifest_version,3);assert.ok(!manifest.host_permissions.includes('<all_urls>'));
assert.equal(await readFile('userscripts/red-loop.user.js','utf8'),await readFile('ios/REDLoopExtension/Resources/red-loop.user.js','utf8'),'Run npm run build to sync the content script');
YAML.parse(await readFile('codemagic.yaml','utf8'));YAML.parse(await readFile('.github/workflows/validate.yml','utf8'));
console.log('JavaScript syntax, JSON, YAML, Xcode project structure and shared extension source checked. This is not an iOS build.');
const zip=unzipSync(await readFile('dist/red-loop-browser-extension.zip'));
assert.ok(zip['manifest.json'] && zip['popup.html'] && zip['icon.png']);
assert.equal(new TextDecoder().decode(zip['red-loop.user.js']),await readFile('userscripts/red-loop.user.js','utf8'));
console.log('Windows ZIP checked: manifest at root, required resources present, canonical content script.');
