import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const starter=readFileSync(new URL('../scripts/windows-chat-test.ps1',import.meta.url),'utf8');
const launcher=readFileSync(new URL('../RED-Loop-Windows-Test.cmd',import.meta.url),'utf8');

test('Windows launcher uses its checkout and preserves git state',()=>{
  assert.match(starter,/Resolve-Path \(Join-Path \$PSScriptRoot '\.\.'\)/);
  assert.doesNotMatch(starter,/\bgit\s+(?:pull|reset|checkout|switch|clean)\b/i);
  assert.match(launcher,/cd \/d "%~dp0"/i);
  assert.match(launcher,/powershell\.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\\windows-chat-test\.ps1"/i);
});
test('Windows extension preflight checks build, test, manifest and SHA-256',()=>{
  assert.match(starter,/Get-Command npm\.cmd/);
  assert.match(starter,/& \$npm\.Source run build/);
  assert.match(starter,/& \$npm\.Source run check/);
  assert.match(starter,/& \$npm\.Source test/);
  assert.match(starter,/Get-FileHash -LiteralPath \$packagedScript -Algorithm SHA256/);
  assert.match(starter,/Get-FileHash -LiteralPath \$canonicalScript -Algorithm SHA256/);
  assert.match(starter,/ConvertFrom-Json/);
  assert.match(starter,/https:\/\/chatgpt\.com\/\*/);
});
test('Windows preflight skips live actions in CI and never starts ChatGPT messages',()=>{
  assert.match(starter,/\[switch\]\$NoBrowser/);
  assert.match(starter,/\[switch\]\$SkipTests/);
  assert.match(starter,/if \(\$NoBrowser\)/);
  assert.match(starter,/Start-Process -FilePath explorer\.exe/);
  assert.match(starter,/Start-Process -FilePath \$edge -ArgumentList 'edge:\/\/extensions\/'/);
  assert.match(starter,/Start-Process -FilePath \$edge -ArgumentList 'https:\/\/chatgpt\.com\/'/);
  assert.doesNotMatch(starter,/Invoke-WebRequest|DownloadString|Start-Process.*(?:npm|git)/i);
});
