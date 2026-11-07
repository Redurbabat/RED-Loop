// Explicit, bounded live acceptance. Never run as part of CI or print credentials.
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';

const connectionFile=process.argv[2],reportFile=process.argv[3];
if(!connectionFile||!reportFile)throw new Error('Usage: node scripts/cloud-smoke.mjs <private-connection.json> <local-report.json>');
let connection;
try {connection=JSON.parse((await readFile(connectionFile,'utf8')).replace(/^\uFEFF/,''));}
catch {throw new Error('Private connection file could not be read.');}
const origin=new URL(connection.server);
if(origin.protocol!=='https:'||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/'||typeof connection.token!=='string'||connection.token.length<32)throw new Error('Invalid HTTPS connection configuration.');
const results={startedAt:new Date().toISOString(),server:origin.origin,checks:[],jobs:[]};
async function request(path,{method='GET',body,key,auth=true}={}) {
  const response=await fetch(new URL(path,origin),{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{...(auth?{authorization:'Bearer '+connection.token}:{}),...(body?{'content-type':'application/json'}:{}),...(key?{'idempotency-key':key}:{})},body:body?JSON.stringify(body):undefined});
  const text=await response.text();let value;try {value=JSON.parse(text);}catch {/* artifact text */}
  return {status:response.status,value,text,noStore:response.headers.get('cache-control')?.includes('no-store')===true};
}
function check(name,condition){results.checks.push({name,passed:!!condition});if(!condition)throw new Error('Live check failed: '+name);}
try {
  const unauth=await request('/api/v1/jobs',{auth:false});check('unauthenticated API rejected',unauth.status===401&&unauth.noStore);
  const status=await request('/api/v1/status');check('configured AI binding',status.status===200&&status.value.configured===true&&status.noStore);results.provider=status.value.provider;results.version=status.value.version;
  const draft={title:'Begrenzter Cloud-Livetest',prompt:'Erstelle als einzige Datei pruefung.txt den Text RED Loop Cloud Test erfolgreich. Antworte danach abgeschlossen. Keine Recherche, keine externen Aktionen und keine weiteren Schritte.',maxSteps:2,maxDurationMinutes:2};
  const key=randomUUID();
  const created=await request('/api/v1/jobs',{method:'POST',body:draft,key});check('create job',created.status===201||created.status===200);const jobId=created.value.job.id;results.jobs.push(jobId);
  const repeated=await request('/api/v1/jobs',{method:'POST',body:draft,key});check('idempotency prevents duplicate job',repeated.value?.job?.id===jobId);
  const conflict=await request('/api/v1/jobs',{method:'POST',body:{...draft,title:'Geänderte Anfrage'},key});check('idempotency conflict rejected',conflict.status===409);
  // No browser or app is running this job; the server alarm must finish it.
  const deadline=Date.now()+120000;let detail;
  do {
    detail=await request('/api/v1/jobs/'+encodeURIComponent(jobId));
    if(!['queued','running'].includes(detail.value?.job?.status))break;
    await new Promise(resolve=>setTimeout(resolve,3000));
  }while(Date.now()<deadline);
  results.jobStatus=detail.value?.job?.status;results.stepCount=detail.value?.job?.stepCount;
  if(results.jobStatus!=='completed')results.failure=detail.value?.job?.error||detail.value?.job?.summary;
  check('real AI finishes without client scheduling',results.jobStatus==='completed');
  const artifact=detail.value.artifacts.find(item=>item.name==='pruefung.txt');check('requested artifact persisted',!!artifact);
  const download=await request('/api/v1/jobs/'+encodeURIComponent(jobId)+'/artifacts/pruefung.txt');check('private artifact download',download.status===200&&download.noStore&&download.text.includes('RED Loop Cloud Test erfolgreich'));
  const denied=await request('/api/v1/jobs/'+encodeURIComponent(jobId)+'/artifacts/pruefung.txt',{auth:false});check('artifact requires authentication',denied.status===401);
  const control=await request('/api/v1/jobs',{method:'POST',body:{title:'Steuerungs-Livetest',prompt:'Schreibe eine kurze Testnotiz als Datei test.txt.',maxSteps:1,maxDurationMinutes:1},key:randomUUID()});check('control job created',[200,201].includes(control.status));const controlId=control.value.job.id;results.jobs.push(controlId);
  const pause=await request('/api/v1/jobs/'+controlId+'/pause',{method:'POST'});check('pause persists',pause.value?.job?.status==='paused');
  const resume=await request('/api/v1/jobs/'+controlId+'/resume',{method:'POST'});check('resume persists',resume.value?.job?.status==='queued');
  const stop=await request('/api/v1/jobs/'+controlId+'/stop',{method:'POST'});check('stop persists',stop.value?.job?.status==='stopped');
  const stopped=await request('/api/v1/jobs/'+controlId);check('stopped state survives next request',stopped.value?.job?.status==='stopped');
  results.passed=true;
}catch(error){results.passed=false;results.error=error instanceof Error?error.message:'Live check failed';process.exitCode=1;}
finally {results.finishedAt=new Date().toISOString();await writeFile(reportFile,JSON.stringify(results,null,2));console.log(JSON.stringify({passed:results.passed,version:results.version,provider:results.provider,checks:results.checks.length,status:results.jobStatus,error:results.error},null,2));}
