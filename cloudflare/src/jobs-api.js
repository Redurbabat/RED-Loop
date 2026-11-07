import {ApiError,CAPABILITIES,LIMITS,SERVICE_VERSION,authenticate,readBoundedText,validArtifactName} from './cloud-common.js';
import {providerInfo} from './providers.js';
export async function dispatchJobRequest(engine,{method,path,body,idempotencyKey}) {
  if(path==='/api/v1/jobs') {
    if(method==='GET')return {status:200,body:{jobs:await engine.listJobs()}};
    if(method==='POST')return {status:200,body:{job:await engine.create(body,idempotencyKey)}};
    throw new ApiError(405,'Für Aufträge sind GET und POST vorgesehen.');
  }
  const match=path.match(/^\/api\/v1\/jobs\/([0-9a-f-]{36})(?:\/(pause|resume|stop)|\/artifacts\/([^/]+))?$/i);
  if(!match)throw new ApiError(404,'API-Pfad nicht gefunden.');
  const [,id,action,encodedName]=match;
  if(action){if(method!=='POST')throw new ApiError(405,'Diese Aktion benötigt POST.');return {status:200,body:{job:await engine.action(id,action)}};}
  if(method!=='GET')throw new ApiError(405,'Dieser Pfad benötigt GET.');
  const detail=await engine.getJob(id);
  if(encodedName){let name;try{name=decodeURIComponent(encodedName);}catch{throw new ApiError(400,'Ungültiger Dateiname.');}if(!validArtifactName(name))throw new ApiError(400,'Ungültiger Dateiname.');const artifact=detail.artifacts.find(file=>file.name===name);if(!artifact)throw new ApiError(404,'Datei nicht gefunden.');return {status:200,artifact};}
  return {status:200,body:detail};
}
export async function handleCloudAPI(request,env) {
  try {
    await authenticate(request,env.RED_LOOP_TOKEN);
    const url=new URL(request.url);
    if(url.search)throw new ApiError(400,'API-Parameter gehören in den JSON-Auftrag, nicht in die URL.');
    if(url.pathname==='/api/v1/status'){
      if(request.method!=='GET')throw new ApiError(405,'Status benötigt GET.');
      const info=providerInfo(env);return Response.json({service:'red-loop',version:SERVICE_VERSION,provider:info.provider,configured:info.configured,capabilities:[...CAPABILITIES],model:info.model});
    }
    let body;
    if(request.method==='POST'){
      if(url.pathname==='/api/v1/jobs'&&!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))throw new ApiError(400,'Aufträge benötigen application/json.');
      const text=await readBoundedText(request,LIMITS.requestBytes);
      if(text){try{body=JSON.parse(text);}catch{throw new ApiError(400,'Ungültiges JSON.');}}
    }
    if(!env.JOBS?.getByName)throw new ApiError(503,'Der persistente Auftragsdienst ist noch nicht verfügbar.');
    // A single user's workspace is the coordination atom, not a public global
    // multi-tenant singleton. Only this authenticated Worker can invoke its RPC.
    const result=await env.JOBS.getByName('red-loop-single-user-v1').handle({method:request.method,path:url.pathname,body,idempotencyKey:request.headers.get('idempotency-key')});
    if(result.artifact)return new Response(result.artifact.content,{status:result.status,headers:{'content-type':'text/plain; charset=utf-8','content-disposition':'attachment; filename="'+result.artifact.name+'"'}});
    return Response.json(result.body,{status:result.status});
  } catch(error) {
    const status=error instanceof ApiError?error.status:503;
    return Response.json({error:error instanceof ApiError?error.message:'Der Auftragsdienst ist vorübergehend nicht verfügbar.'},{status,headers:status===401?{'www-authenticate':'Bearer'}:{}});
  }
}
