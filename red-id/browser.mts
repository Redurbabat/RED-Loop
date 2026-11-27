/** Explicit, opt-in browser identity. Tokens stay in this instance's memory.
 * No storage, cookies, automatic background refresh or redirects. */
export type BrowserIdentity={version:2;app:string;id:string;name:string;scopes:string[];expiresAt:string};
type Session={accessToken:string;refreshToken:string;expiresAt:string;refreshExpiresAt:string};
type Proof={verifier:string;challenge:string;until:number};
export class RedBrowserError extends Error {
  readonly status:number;
  constructor(status:number){super('RED ID HTTP '+status);this.status=status;}
}
const APPS=new Set(['red-ion','red-fit','red-poly','red-bit','red-loop','red-efz','red-kurd','red-uhr','red-yt','stran','babat-red']);
const record=(v:unknown):Record<string,unknown>=>{if(typeof v!=='object'||v===null||Array.isArray(v))throw Error('Invalid RED response');return v as Record<string,unknown>;};
const string=(v:unknown):string=>{if(typeof v!=='string')throw Error('Invalid RED response');return v;};
const expiry=(v:unknown):string=>{const s=string(v);if(!Number.isFinite(Date.parse(s)))throw Error('Invalid RED date');return s;};
const b64=(v:Uint8Array)=>btoa(String.fromCharCode(...v)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
export function createRedBrowserIdentity(origin:string,app:string,fetcher:typeof fetch=fetch){
 const url=new URL(origin);
 if(url.protocol!=='https:'||url.origin!==origin||!APPS.has(app))throw Error('Exact trusted HTTPS origin and app required');
 let session:Session|null=null,proof:Proof|null=null,busy=false,disposed=false;
 let active:AbortController|null=null;
 const assertLive=()=>{if(disposed)throw Error('Identity instance closed');};
 async function exclusive<T>(action:()=>Promise<T>):Promise<T>{
  assertLive();if(busy)throw Error('Request in progress');busy=true;
  try{return await action();}finally{busy=false;}
 }
 async function request(path:string,body?:object,token?:string){
  assertLive();
  const controller=new AbortController();active=controller;
  const timer=setTimeout(()=>controller.abort(),15000);
  try{
   const response=await fetcher(origin+'/red-id/v2/'+path,{method:body||path==='logout'?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:controller.signal,credentials:'omit',cache:'no-store',redirect:'error'});
   assertLive();if(!response.ok)throw new RedBrowserError(response.status);
   const value:unknown=await response.json();assertLive();return record(value);
  }finally{clearTimeout(timer);if(active===controller)active=null;}
 }
 const checkBase=(v:Record<string,unknown>)=>{
  if(v.version!==2||v.app!==app||!Array.isArray(v.scopes)||v.scopes.length!==1||v.scopes[0]!=='identity:read')throw Error('Unexpected RED identity');
 };
 function accept(v:Record<string,unknown>):Session{
  assertLive();checkBase(v);
  const accessToken=string(v.accessToken),refreshToken=string(v.refreshToken),expiresAt=expiry(v.expiresAt),refreshExpiresAt=expiry(v.refreshExpiresAt);
  if(!/^redat_[a-f0-9]{64}$/.test(accessToken)||!/^redrt_[a-f0-9]{64}$/.test(refreshToken)||Date.parse(expiresAt)>Date.parse(refreshExpiresAt))throw Error('Invalid RED credentials');
  return {accessToken,refreshToken,expiresAt,refreshExpiresAt};
 }
 async function rotate(old:Session){
  try{session=accept(await request('refresh',{app,refreshToken:old.refreshToken}));return session;}
  catch(e){if(e instanceof RedBrowserError&&e.status===401)session=null;throw e;}
 }
 async function current(){
  if(!session)throw new RedBrowserError(401);
  return Date.parse(session.expiresAt)<=Date.now()+30000?rotate(session):session;
 }
 async function identity():Promise<BrowserIdentity>{
  let s=await current(),v:Record<string,unknown>;
  try{v=await request('me',undefined,s.accessToken);}
  catch(e){if(!(e instanceof RedBrowserError)||e.status!==401)throw e;s=await rotate(s);v=await request('me',undefined,s.accessToken);}
  checkBase(v);return {version:2,app,id:string(v.id),name:string(v.name),scopes:['identity:read'],expiresAt:expiry(v.expiresAt)};
 }
 return {
  begin:()=>exclusive(async()=>{
   if(session)throw Error('Disconnect the existing session first');
   const verifier=b64(crypto.getRandomValues(new Uint8Array(32)));
   const challenge=b64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
   assertLive();proof={verifier,challenge,until:Date.now()+300000};
   return JSON.stringify({kind:'red-pair',version:1,app,challenge});
  }),
  cancel:()=>{if(!busy)proof=null;},
  claim:()=>exclusive(async()=>{
   if(!proof||proof.until<=Date.now()){proof=null;throw Error('Pairing expired');}
   session=accept(await request('claim-login',{app,verifier:proof.verifier}));
   proof=null;return identity();
  }),
  me:()=>exclusive(identity),
  logout:()=>exclusive(async()=>{
   try{const s=await current();await request('logout',undefined,s.accessToken);}
   finally{session=null;proof=null;}
  }),
  dispose:()=>{disposed=true;active?.abort();session=null;proof=null;}
 };
}
export type RedBrowserClient=ReturnType<typeof createRedBrowserIdentity>;
