import {mkdir, cp, copyFile} from 'node:fs/promises';
await mkdir('dist', {recursive:true});
await cp('web', 'dist', {recursive:true});
await mkdir('ios/REDLoopExtension/Resources', {recursive:true});
await copyFile('userscripts/red-loop.user.js', 'ios/REDLoopExtension/Resources/red-loop.user.js');
await copyFile('userscripts/red-loop.user.js', 'dist/red-loop.user.js');
console.log('Web assets and Safari extension content script prepared.');
