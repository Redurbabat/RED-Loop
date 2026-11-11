import {mkdir, cp, copyFile, readFile, writeFile, stat, rm} from 'node:fs/promises';
import {verifyRelease} from './signed-script.mjs';
import {zipSync} from 'fflate';
await mkdir('dist', {recursive:true});
await cp('web', 'dist', {recursive:true});
await mkdir('ios/REDLoopExtension/Resources', {recursive:true});
await copyFile('userscripts/red-loop.user.js', 'ios/REDLoopExtension/Resources/red-loop.user.js');
await copyFile('userscripts/red-loop.user.js', 'dist/red-loop.user.js');
// Same canonical script for the in-app ChatGPT view: served by the Worker so a
// layout fix needs a deploy, bundled so the app also works without the server.
await mkdir('ios/REDLoop/Resources', {recursive:true});
await copyFile('userscripts/red-loop.user.js', 'ios/REDLoop/Resources/red-loop-webview.js');
await copyFile('userscripts/red-loop.user.js', 'dist/red-loop-webview.js');
// Optional signed release. Never publish an unverified or mismatched manifest.
// Always discard any stale manifest from an earlier build in the same folder.
await rm('dist/red-loop-webview.manifest.json',{force:true});
const releaseManifest = 'release/red-loop-webview.manifest.json';
const releasePublic = 'release/release-public.pem';
const present = async file => {try {await stat(file);return true;} catch (error) {if(error.code==='ENOENT')return false;throw error;}};
if(await present(releaseManifest)) {
  if(!await present(releasePublic)) throw new Error('Signed release public key missing.');
  const [canonical, rawManifest, publicKey] = await Promise.all([
    readFile('userscripts/red-loop.user.js'),readFile(releaseManifest),readFile(releasePublic)
  ]);
  if(rawManifest.length > 4096) throw new Error('Signed manifest is too large.');
  const manifest = JSON.parse(rawManifest.toString('utf8'));
  if(!verifyRelease({script:canonical,manifest,publicKey})) throw new Error('Release signature or canonical script verification failed. Run npm run release:auto before deployment.');
  await copyFile(releaseManifest,'dist/red-loop-webview.manifest.json');
}

// Only the PUBLIC key is bundled. No key means signed downloads remain disabled.
await rm('android/app/src/main/assets/release-public.pem',{force:true});
if (await present(releasePublic)) {
  await copyFile(releasePublic,'android/app/src/main/assets/release-public.pem');
}
// The Android app bundles the same script and shares the iOS app icon.
await mkdir('android/app/src/main/assets', {recursive:true});
await mkdir('android/app/src/main/res/mipmap-xxhdpi', {recursive:true});
await copyFile('userscripts/red-loop.user.js', 'android/app/src/main/assets/red-loop-webview.js');
await copyFile('ios/REDLoop/Assets.xcassets/AppIcon.appiconset/AppIcon.png', 'android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png');
const extensionDirectory = 'extensions/chromium';
await mkdir(extensionDirectory, {recursive:true});
const extensionFiles = {
  'manifest.json': 'ios/REDLoopExtension/Resources/manifest.json',
  'red-loop.user.js': 'userscripts/red-loop.user.js',
  'icon.png': 'ios/REDLoopExtension/Resources/icon.png',
  'popup.css': 'ios/REDLoopExtension/Resources/popup.css',
  'popup.html': 'extensions/popup-windows.html',
  'INSTALLATION-WINDOWS.txt': 'extensions/INSTALLATION-WINDOWS.txt'
};
const zip = {};
for (const [name, source] of Object.entries(extensionFiles)) {
  const bytes = await readFile(source); zip[name] = bytes;
  await writeFile(`${extensionDirectory}/${name}`, bytes);
}
await writeFile('dist/red-loop-browser-extension.zip', zipSync(zip, {level:9}));
console.log('Web, Safari extension, unpacked Windows extension and downloadable ZIP prepared.');
