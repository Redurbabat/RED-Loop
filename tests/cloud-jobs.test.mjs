import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/src/index.js';
import {ApiError,CapabilityError,LIMITS,bytes} from '../cloudflare/src/cloud-common.js';
import {JobEngine} from '../cloudflare/src/job-engine.js';
import {dispatchJobRequest} from '../cloudflare/src/jobs-api.js';
import {ProviderError,createProvider} from '../cloudflare/src/providers.js';
import {documentationURL,fetchDocumentation} from '../cloudflare/src/research.js';

class MemoryStore {
  constructor(){this.rows=new Map();this.alarm=null;this.flushes=0;this.maxRecordBytes=0;}
  get(key){return structuredClone(this.rows.get(key));}
  list(prefix){return [...this.rows].filter(([key])=>key.startsWith(prefix)).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>({key,value:structuredClone(value)}));}
  put(key,value){const size=bytes(JSON.stringify(value));assert.ok(size<=LIMITS.recordBytes);this.maxRecordBytes=Math.max(this.maxRecordBytes,size);this.rows.set(key,structuredClone(value));}
  delete(key){this.rows.delete(key);}
  transaction(callback){const saved=structuredClone(this.rows);try{return callback();}catch(error){this.rows=saved;throw error;}}
  async setAlarm(time){this.alarm=time;}
  async deleteAlarm(){this.alarm=null;}
  async flush(){this.flushes++;}
}
const input={title:'Technical document',prompt:'Write a useful technical text document.',maxSteps:3,maxDurationMinutes:60};
const result=(status='continue',extra={})=>({status,summary:'A concrete text step was completed.',output:'A concrete documented result created by this model step.',artifacts:[],researchUrls:[],needsCapability:null,...extra});
const key=index=>'test-idempotency-key-'+index;
async function fixture(run=async()=>({result:result()}),options={}) {
  const store=options.store||new MemoryStore();let now=Date.UTC(2026,10,7),sequence=0,calls=0;
  const provider={info:{provider:'test',configured:options.configured!==false},run:async(...args)=>{calls++;return run(...args);}};
  const engine=new JobEngine(store,provider,{now:()=>now,uuid:()=>`00000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`,research:options.research,requestTimeoutMs:options.requestTimeoutMs});
  await engine.ready;
  return {engine,store,provider,get calls(){return calls;},advance:ms=>{now+=ms;},now:()=>now};
}
async function waitFor(condition){for(let i=0;i<100&&!condition();i++)await new Promise(resolve=>setImmediate(resolve));assert.ok(condition(),'async claim did not start');}
function environment(engine){return {RED_LOOP_TOKEN:'test-only-token-not-a-real-secret-0000000000',AI:{run:async()=>{}},JOBS:{getByName:()=>({handle:async payload=>{try{return await dispatchJobRequest(engine,payload);}catch(error){return {status:error instanceof ApiError?error.status:500,body:{error:error instanceof ApiError?error.message:'Internal error'}};}}})}};}
function request(path,{method='GET',body,token='test-only-token-not-a-real-secret-0000000000',idempotency=key(1)}={}){const headers={};if(token)headers.authorization='Bearer '+token;if(body!==undefined)headers['content-type']='application/json';if(idempotency)headers['idempotency-key']=idempotency;return new Request('https://test'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});}

test('every private API authenticates before status, mutations, routing or DO access',async()=>{
  let accesses=0;const env={RED_LOOP_TOKEN:'test-only-token-not-a-real-secret-0000000000',JOBS:{getByName(){accesses++;throw new Error();}}};
  for(const path of ['/api/v1/status','/api/v1/jobs','/api/v1/jobs/00000000-0000-4000-8000-000000000001/stop','/api/v1/unknown'])for(const token of ['', 'wrong']){const response=await worker.fetch(request(path,{token,method:path.endsWith('/stop')?'POST':'GET'}),env);assert.equal(response.status,401);assert.equal(response.headers.get('cache-control'),'no-store');}
  assert.equal(accesses,0);assert.equal((await worker.fetch(request('/api/v1/status'),{})).status,503);
});

test('status contract reports actual binding configuration and no secret',async()=>{
  const f=await fixture();const env=environment(f.engine);const response=await worker.fetch(request('/api/v1/status'),env);const body=await response.json();
  assert.equal(body.service,'red-loop');assert.equal(body.version,'0.4.0');assert.equal(body.provider,'workers-ai');assert.equal(body.configured,true);assert.ok(body.capabilities.includes('persistent_jobs'));assert.equal(JSON.stringify(body).includes(env.RED_LOOP_TOKEN),false);
  delete env.AI;assert.equal((await (await worker.fetch(request('/api/v1/status'),env)).json()).configured,false);
});

test('HTTP create/list/detail/actions/download preserve the client contract',async()=>{
  const f=await fixture(async()=>({result:result('completed',{artifacts:[{name:'answer.md',content:'# Real generated text'}]})}));const env=environment(f.engine);
  const created=await worker.fetch(request('/api/v1/jobs',{method:'POST',body:input}),env);assert.equal(created.status,200);const {job}=await created.json();assert.equal(typeof job.summary,'string');assert.equal(job.status,'queued');assert.equal(typeof job.maxSteps,'number');assert.ok(f.store.alarm);
  await f.engine.alarm();const detail=await (await worker.fetch(request('/api/v1/jobs/'+job.id),env)).json();assert.equal(detail.job.status,'completed');assert.equal(detail.steps.length,1);assert.equal(detail.artifacts[0].name,'answer.md');
  const download=await worker.fetch(request('/api/v1/jobs/'+job.id+'/artifacts/answer.md'),env);assert.equal(await download.text(),'# Real generated text');assert.match(download.headers.get('content-disposition'),/attachment/);assert.match(download.headers.get('content-type'),/text\/plain/);
  assert.equal((await (await worker.fetch(request('/api/v1/jobs'),env)).json()).jobs.length,1);assert.equal((await worker.fetch(request('/api/v1/jobs/'+job.id+'/artifacts/missing.txt'),env)).status,404);
});

test('Idempotency-Key prevents simultaneous duplicate starts and rejects changed payload',async()=>{
  const f=await fixture();const [a,b]=await Promise.all([f.engine.create(input,key(1)),f.engine.create(input,key(1))]);assert.equal(a.id,b.id);assert.equal((await f.engine.listJobs()).length,1);
  await assert.rejects(f.engine.create({...input,prompt:'Different work'},key(1)),error=>error.status===409);await assert.rejects(f.engine.create(input,''),error=>error.status===400);assert.equal(f.calls,0);
});

test('input, request-size, identifier and saved-job limits fail explicitly',async()=>{
  const f=await fixture();for(const value of [{...input,maxSteps:51},{...input,maxSteps:0},{...input,maxDurationMinutes:481},{...input,title:'x'.repeat(121)},{...input,prompt:'x'.repeat(20001)},{...input,extra:'ignored?' }])await assert.rejects(f.engine.create(value,key(1)),error=>error.status===400);
  const env=environment(f.engine);const huge=await worker.fetch(request('/api/v1/jobs',{method:'POST',body:{...input,prompt:'x'.repeat(LIMITS.requestBytes+1)}}),env);assert.equal(huge.status,413);
  for(let i=0;i<LIMITS.jobs;i++)await f.engine.create(input,key(i));await assert.rejects(f.engine.create(input,key(99)),error=>error.status===409);assert.equal(f.calls,0);
});

test('claim and separate step record are durable before any model request',async()=>{
  let f;f=await fixture(async()=>{const job=f.store.list('job:')[0].value;assert.ok(job.inflight);assert.equal(job.stepCount,1);assert.equal(f.store.list('step:')[0].value.status,'running');assert.ok(f.store.flushes>0);return {result:result('completed')};});
  const job=await f.engine.create(input,key(1));await f.engine.alarm();const detail=await f.engine.getJob(job.id);assert.equal(detail.job.status,'completed');assert.equal(detail.artifacts[0].name,'result.md');assert.equal(detail.steps[0].status,'completed');assert.equal(f.store.alarm,null);
});

test('one active model call survives overlapping alarm attempts and pause discards its result',async()=>{
  let finish;const f=await fixture(()=>new Promise(resolve=>{finish=resolve;}));const job=await f.engine.create(input,key(1));const pending=f.engine.alarm();await waitFor(()=>f.calls===1);
  await f.engine.alarm();assert.equal(f.calls,1);await f.engine.action(job.id,'pause');await assert.rejects(f.engine.action(job.id,'resume'),error=>error.status===409);
  finish({result:result('completed',{artifacts:[{name:'late.txt',content:'Must not be committed'}]})});await pending;
  const detail=await f.engine.getJob(job.id);assert.equal(detail.job.status,'paused');assert.equal(detail.steps[0].status,'discarded');assert.equal(detail.artifacts.length,0);assert.equal(f.store.alarm,null);
  assert.equal((await f.engine.action(job.id,'resume')).status,'queued');assert.ok(f.store.alarm);
});

test('stop wins against a running provider even when it ignores cancellation',async()=>{
  let finish;const f=await fixture(()=>new Promise(resolve=>{finish=resolve;}));const job=await f.engine.create(input,key(1));const pending=f.engine.alarm();await waitFor(()=>f.calls===1);await f.engine.action(job.id,'stop');finish({result:result('completed')});await pending;
  const detail=await f.engine.getJob(job.id);assert.equal(detail.job.status,'stopped');assert.equal(detail.steps[0].status,'discarded');assert.equal(detail.artifacts.length,0);await assert.rejects(f.engine.action(job.id,'resume'),error=>error.status===409);await f.engine.alarm();assert.equal(f.calls,1);
});

test('new engine recovers uncertain claims as needs_input without a paid retry',async()=>{
  let finish;const f=await fixture(()=>new Promise(resolve=>{finish=resolve;}));const job=await f.engine.create(input,key(1));const pending=f.engine.alarm();await waitFor(()=>f.calls===1);
  const recovered=await fixture(async()=>{throw new Error('Never retry automatically');},{store:f.store});const detail=await recovered.engine.getJob(job.id);assert.equal(detail.job.status,'needs_input');assert.equal(detail.steps[0].status,'interrupted');assert.match(detail.job.error,/Keine automatische Wiederholung/);await recovered.engine.alarm();assert.equal(recovered.calls,0);
  finish({result:result('completed')});await pending;
});

test('separate persisted steps resume after eviction and stop at step limit',async()=>{
  const f=await fixture();const job=await f.engine.create({...input,maxSteps:2,prompt:'文'.repeat(20000)},key(1));await f.engine.alarm();
  const next=await fixture(async()=>({result:result('continue',{output:'文'.repeat(12000)})}),{store:f.store});await next.engine.alarm();await next.engine.alarm();const detail=await next.engine.getJob(job.id);
  assert.equal(detail.job.status,'limit_reached');assert.equal(detail.job.stepCount,2);assert.equal(detail.steps.length,2);assert.equal(next.calls,1);assert.equal(Object.hasOwn(f.store.get('job:'+job.id),'steps'),false);assert.ok(f.store.maxRecordBytes<LIMITS.recordBytes);
});

test('expired runtime prevents a call and late results cannot complete the job',async()=>{
  const before=await fixture();const job=await before.engine.create({...input,maxDurationMinutes:1},key(1));before.advance(60001);await before.engine.alarm();assert.equal(before.calls,0);assert.equal((await before.engine.getJob(job.id)).job.status,'limit_reached');
  let finish;const during=await fixture(()=>new Promise(resolve=>{finish=resolve;}));const second=await during.engine.create({...input,maxDurationMinutes:1},key(2));const pending=during.engine.alarm();await waitFor(()=>during.calls===1);during.advance(60001);finish({result:result('completed')});await pending;const detail=await during.engine.getJob(second.id);assert.equal(detail.job.status,'limit_reached');assert.equal(detail.steps[0].status,'discarded');assert.equal(detail.artifacts.length,0);
});

test('missing configuration or an unavailable capability cannot become fake success',async()=>{
  const missing=await fixture(undefined,{configured:false});const first=await missing.engine.create(input,key(1));assert.equal(first.status,'needs_input');await missing.engine.alarm();assert.equal(missing.calls,0);
  const unsupported=await fixture(async()=>({result:result('completed',{needsCapability:'Cannot execute shell code or deploy an app.'})}));const second=await unsupported.engine.create(input,key(1));await unsupported.engine.alarm();assert.equal((await unsupported.engine.getJob(second.id)).job.status,'needs_input');
});

test('invalid model schemas, unsafe artifact names and unknown exceptions stop without retry or secret leakage',async()=>{
  for(const value of [result('completed',{artifacts:[{name:'../escape.txt',content:'x'}]}),result('completed',{output:'x'.repeat(LIMITS.stepOutput+1)}),{...result(),tool_calls:[]}]){
    const f=await fixture(async()=>({result:value}));const job=await f.engine.create(input,key(1));await f.engine.alarm();await f.engine.alarm();const detail=await f.engine.getJob(job.id);assert.equal(detail.job.status,'failed');assert.equal(detail.artifacts.length,0);assert.equal(f.calls,1);
  }
  const f=await fixture(async()=>{throw new Error('private upstream details must not escape');});const job=await f.engine.create(input,key(1));await f.engine.alarm();assert.equal(JSON.stringify(await f.engine.getJob(job.id)).includes('private upstream'),false);
});

test('known safe provider diagnostics and usage survive failures',async()=>{
  const f=await fixture(async()=>{throw new ProviderError('Safe JSON schema diagnostic',{total_tokens:5});});const job=await f.engine.create(input,key(1));await f.engine.alarm();const detail=await f.engine.getJob(job.id);assert.equal(detail.job.error,'Safe JSON schema diagnostic');assert.equal(detail.steps[0].usage.total_tokens,5);assert.equal(f.store.alarm,null);
});

test('an uncooperative provider has a hard local timeout, terminal job and no automatic or resume retry',async()=>{
  let finish,signal;const f=await fixture((context,options)=>{signal=options.signal;return new Promise(resolve=>{finish=resolve;});},{requestTimeoutMs:15});const job=await f.engine.create(input,key(1));
  await f.engine.alarm();const detail=await f.engine.getJob(job.id);assert.equal(detail.job.status,'failed');assert.match(detail.job.error,/beim Anbieter weiterlaufen/);assert.equal(signal.aborted,true);assert.equal(f.engine.active,null);assert.equal(f.store.get('meta:lease'),undefined);assert.equal(f.store.alarm,null);
  await assert.rejects(f.engine.action(job.id,'resume'),error=>error.status===409);await f.engine.alarm();assert.equal(f.calls,1);
  finish({result:result('completed',{artifacts:[{name:'late.txt',content:'Must remain discarded'}]})});await new Promise(resolve=>setImmediate(resolve));assert.equal((await f.engine.getJob(job.id)).artifacts.length,0);assert.equal((await f.engine.getJob(job.id)).job.status,'failed');
});

test('a durability flush failure prevents the model call and releases the local active claim',async()=>{
  const f=await fixture();const job=await f.engine.create(input,key(1));f.store.flush=async()=>{throw new Error('Storage unavailable');};await f.engine.alarm();
  assert.equal(f.calls,0);assert.equal(f.engine.active,null);assert.equal((await f.engine.getJob(job.id)).job.status,'failed');await f.engine.alarm();assert.equal(f.calls,0);
});

test('paused timeouts become terminal failures while an explicit stop still wins',async()=>{
  for(const [action,expected] of [['pause','failed'],['stop','stopped']]){
    const f=await fixture(()=>new Promise(()=>{}),{requestTimeoutMs:20});const job=await f.engine.create(input,key(1));const pending=f.engine.alarm();await waitFor(()=>f.calls===1);await f.engine.action(job.id,action);await pending;
    assert.equal((await f.engine.getJob(job.id)).job.status,expected);await assert.rejects(f.engine.action(job.id,'resume'),error=>error.status===409);assert.equal(f.engine.active,null);
  }
});

test('workspace limits atomically reject excess files while retaining prior artifacts',async()=>{
  let turn=0;const f=await fixture(async()=>({result:result('continue',{artifacts:Array.from({length:3},(_,i)=>({name:`file-${turn}-${i}.txt`,content:'saved text'}))})}));const job=await f.engine.create({...input,maxSteps:10},key(1));
  for(turn=0;turn<5;turn++)await f.engine.alarm();const detail=await f.engine.getJob(job.id);assert.equal(detail.job.status,'needs_input');assert.equal(detail.artifacts.length,12);assert.equal(detail.steps.at(-1).status,'failed');assert.equal(detail.artifacts.some(file=>file.name.startsWith('file-4-')),false);
});

test('documentation reads are executed once and supplied as persisted evidence on the next step',async()=>{
  const seen=[];let fetched=0;const f=await fixture(async context=>{seen.push(context);return {result:seen.length===1?result('continue',{researchUrls:['https://developers.cloudflare.com/workers/']}):result('completed')};},{research:async url=>{fetched++;return {url,text:'Verified public documentation excerpt.',truncated:false};}});
  const job=await f.engine.create(input,key(1));await f.engine.alarm();await f.engine.alarm();const detail=await f.engine.getJob(job.id);assert.equal(fetched,1);assert.equal(detail.job.status,'completed');assert.match(seen[1].workspace[0].content,/Verified public documentation/);assert.equal(detail.artifacts.some(file=>file.name==='research-1-1.txt'),true);
});

test('research denial becomes needs_input and cannot claim completion',async()=>{
  const f=await fixture(async()=>({result:result('continue',{researchUrls:['https://evil.example/']})}),{research:async()=>{throw new CapabilityError('Host not allowed');}});const job=await f.engine.create(input,key(1));await f.engine.alarm();assert.equal((await f.engine.getJob(job.id)).job.status,'needs_input');assert.equal(f.calls,1);
});

test('research prevents SSRF, redirects, non-text and oversized bodies',async()=>{
  for(const url of ['http://developers.cloudflare.com/','https://127.0.0.1/','https://[::1]/','https://developers.cloudflare.com.evil.example/','https://developers.cloudflare.com@127.0.0.1/','https://developers.cloudflare.com:8443/'])assert.throws(()=>documentationURL(url),CapabilityError);
  let calls=0;await assert.rejects(fetchDocumentation('https://developers.cloudflare.com/workers/',{fetchImpl:async()=>{calls++;return new Response(null,{status:302,headers:{location:'http://127.0.0.1/'}});}}),CapabilityError);assert.equal(calls,1);
  await assert.rejects(fetchDocumentation('https://developer.apple.com/documentation/',{fetchImpl:async()=>new Response('x',{headers:{'content-type':'image/png'}})}),CapabilityError);
  await assert.rejects(fetchDocumentation('https://docs.codemagic.io/',{fetchImpl:async()=>new Response('x'.repeat(LIMITS.researchBytes+1),{headers:{'content-type':'text/plain'}})}),CapabilityError);
  const document=await fetchDocumentation('https://developers.cloudflare.com/workers/',{fetchImpl:async()=>new Response('<script>bad()</script><p>Useful docs</p>',{headers:{'content-type':'text/html'}})});assert.match(document.text,/Useful docs/);assert.equal(document.text.includes('bad()'),false);
});

test('Workers AI uses the documented structured schema and accepts object/string output',async()=>{
  for(const response of [result('completed'),JSON.stringify(result('completed'))]){
    let called;const provider=createProvider({AI:{run:async(...args)=>{called=args;return {response,usage:{total_tokens:8}};}}});const generated=await provider.run({assignment:input},{signal:new AbortController().signal});
    assert.equal(called[0],'@cf/meta/llama-3.3-70b-instruct-fp8-fast');assert.equal(called[1].response_format.json_schema.type,'object');assert.equal(called[1].max_tokens,4096);assert.ok(called[2].signal);assert.equal(generated.result.status,'completed');assert.equal(generated.usage.total_tokens,8);
  }
});

test('OpenAI optional provider uses Responses format and raw output content, never SDK convenience fields',async()=>{
  let payload;const provider=createProvider({AI_PROVIDER:'openai',OPENAI_API_KEY:'not-a-real-key'},{fetchImpl:async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/responses');payload=JSON.parse(options.body);return Response.json({status:'completed',usage:{total_tokens:9},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(result('completed'))}]}]});}});
  const generated=await provider.run({assignment:input});assert.equal(payload.store,false);assert.equal(payload.text.format.type,'json_schema');assert.equal(payload.text.format.strict,true);assert.equal(generated.result.status,'completed');assert.equal(generated.usage.total_tokens,9);
  const incomplete=createProvider({AI_PROVIDER:'openai',OPENAI_API_KEY:'not-a-real-key'},{fetchImpl:async()=>Response.json({status:'incomplete',usage:{total_tokens:4},output_text:JSON.stringify(result('completed'))})});await assert.rejects(incomplete.run({}),error=>error instanceof ProviderError&&error.usage.total_tokens===4);
});
