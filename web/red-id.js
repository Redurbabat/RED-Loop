import {createRedBrowserIdentity,RedBrowserError} from './red-id-browser.js';
const el=id=>document.getElementById(id);
const origin=el('red-origin'),begin=el('red-begin'),request=el('red-request'),box=el('red-request-box'),account=el('red-account'),status=el('red-status');
const buttons=[begin,el('red-claim'),el('red-cancel'),el('red-check'),el('red-logout')];
let client=null,busy=false;
function reset(){client?.dispose();client=null;origin.disabled=false;request.value='';box.hidden=true;account.hidden=true;begin.hidden=false;el('red-name').textContent='';}
function connected(value){box.hidden=true;request.value='';account.hidden=false;begin.hidden=true;el('red-name').textContent='Konto: '+(value.name||value.id);status.textContent='RED ID verbunden. Keine Auftragsdaten übertragen.';}
async function run(action){if(busy)return;busy=true;buttons.forEach(b=>b.disabled=true);status.textContent='Anfrage läuft …';try{await action();}catch(e){status.textContent=e instanceof RedBrowserError&&e.status===401?'Noch nicht freigegeben oder Sitzung abgelaufen.':'Anfrage fehlgeschlagen. HTTPS, Serverfreigabe und Netz prüfen.';}finally{busy=false;buttons.forEach(b=>b.disabled=false);}}
begin.addEventListener('click',()=>void run(async()=>{
 if(!globalThis.isSecureContext||!crypto?.subtle)throw Error('Secure context required');
 if(client)reset();
 client=createRedBrowserIdentity(origin.value.trim(),'red-loop');origin.disabled=true;
 request.value=await client.begin();box.hidden=false;begin.hidden=true;status.textContent='Anfrage in RED ION vergleichen und freigeben.';
}));
el('red-claim').addEventListener('click',()=>void run(async()=>{if(client)connected(await client.claim());}));
el('red-check').addEventListener('click',()=>void run(async()=>{if(client)connected(await client.me());}));
el('red-cancel').addEventListener('click',()=>{if(!busy){reset();status.textContent='Kopplung abgebrochen.';}});
el('red-logout').addEventListener('click',()=>void run(async()=>{try{await client?.logout();status.textContent='RED ID getrennt.';}catch{status.textContent='Lokaler Zugang gelöscht; Serverzugang in RED ION widerrufen.';}finally{reset();}}));
window.addEventListener('pagehide',()=>reset());
