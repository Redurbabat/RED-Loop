import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

// A separate, disposable Chromium process avoids Playwright's default focus
// emulation. Never connect this helper to a user's browser or profile.
export async function withNaturalVisibility(chromium,extension,use) {
  const tempRoot=path.resolve(tmpdir());
  const profile=await mkdtemp(path.join(tempRoot,'red-loop-visibility-'));
  const child=spawn(chromium.executablePath(),[
    '--remote-debugging-port=0','--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','--enable-automation',
    '--disable-background-networking',`--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,'about:blank'
  ],{windowsHide:true,stdio:['ignore','ignore','pipe']});
  let startupError,browser,launchLog='';
  child.stderr.on('data',data=>{launchLog=(launchLog+data.toString()).slice(-3000);});
  child.on('error',error=>{startupError=error;});
  const exited=new Promise(resolve=>child.once('exit',resolve));
  try {
    let port;
    const deadline=Date.now()+30000;
    while(Date.now()<deadline) {
      if(startupError) throw startupError;
      if(child.exitCode!==null) throw new Error(`Visibility test Chromium exited: ${child.exitCode}`);
      try {port=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0].trim();break;}
      catch(error) {if(error.code!=='ENOENT') throw error;await delay(100);}
    }
    if(!/^\d+$/.test(port||'') || Number(port)<1 || Number(port)>65535) throw new Error('Visibility test debugger did not start: '+launchLog);
    browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`,{noDefaults:true});
    await use(browser.contexts()[0]);
  } finally {
    if(browser) {
      try {await (await browser.newBrowserCDPSession()).send('Browser.close');} catch {}
    }
    if(child.exitCode===null && child.signalCode===null) {
      await Promise.race([exited,delay(4000)]);
      if(child.exitCode===null && child.signalCode===null) child.kill();
      await Promise.race([exited,delay(4000)]);
    }
    if(browser) await browser.close().catch(()=>{});
    const resolved=path.resolve(profile);
    if(!resolved.startsWith(tempRoot+path.sep+'red-loop-visibility-')) throw new Error('Unsafe visibility profile cleanup target');
    await rm(resolved,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
}
