import {mkdir, cp, copyFile, readFile, writeFile} from 'node:fs/promises';
import {zipSync} from 'fflate';
await mkdir('dist', {recursive:true});
await cp('web', 'dist', {recursive:true});
await mkdir('ios/REDLoopExtension/Resources', {recursive:true});
await copyFile('userscripts/red-loop.user.js', 'ios/REDLoopExtension/Resources/red-loop.user.js');
await copyFile('userscripts/red-loop.user.js', 'dist/red-loop.user.js');
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
