import {ApiError,CapabilityError,LIMITS,bytes,iso,validArtifactName} from './cloud-common.js';
import {fetchDocumentation} from './research.js';
import {ProviderError,ProviderTimeoutError} from './providers.js';
const jobKey=id=>'job:'+id;
const stepPrefix=id=>'step:'+id+':';
const stepKey=(id,index)=>stepPrefix(id)+String(index).padStart(3,'0');
const artifactPrefix=id=>'artifact:'+id+':';
const terminal=new Set(['completed','stopped','failed','limit_reached']);
export function publicJob(job) {
  const result={};for(const key of ['id','title','prompt','status','createdAt','updatedAt','stepCount','maxSteps','maxDurationMinutes','summary'])result[key]=job[key];
  if(job.error)result.error=job.error;result.verification=job.status==='completed'?'model_reported':null;return result;
}
export function validateJobInput(value) {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['title','prompt','maxSteps','maxDurationMinutes'].includes(key)))throw new ApiError(400,'Ungültiger Auftrag.');
  const {title,prompt,maxSteps,maxDurationMinutes}=value;
  if(typeof title!=='string'||!title.trim()||title.length>LIMITS.title||typeof prompt!=='string'||!prompt.trim()||prompt.length>LIMITS.prompt||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(title+prompt)||(typeof prompt.isWellFormed==='function'&&!prompt.isWellFormed()))throw new ApiError(400,'Titel (1–120) und Auftragstext (1–20000 Zeichen) prüfen.');
  if(!Number.isInteger(maxSteps)||maxSteps<1||maxSteps>LIMITS.steps||!Number.isInteger(maxDurationMinutes)||maxDurationMinutes<1||maxDurationMinutes>LIMITS.durationMinutes)throw new ApiError(400,'Schritte müssen 1–50 und Laufzeit 1–480 Minuten betragen.');
  return {title:title.trim(),prompt:prompt.trim(),maxSteps,maxDurationMinutes};
}
export function validateStepResult(value) {
  const keys=['status','summary','output','artifacts','researchUrls','needsCapability'];
  if(!value||typeof value!=='object'||Array.isArray(value)||keys.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>!keys.includes(key)))throw new Error('Das KI-Schrittformat ist ungültig.');
  if(!['continue','completed','needs_input'].includes(value.status)||typeof value.summary!=='string'||!value.summary.trim()||value.summary.length>LIMITS.summary||typeof value.output!=='string'||!value.output.trim()||value.output.length>LIMITS.stepOutput)throw new Error('Die KI-Schrittausgabe ist ungültig oder zu groß.');
  if(!Array.isArray(value.artifacts)||value.artifacts.length>3||!Array.isArray(value.researchUrls)||value.researchUrls.length>2||value.researchUrls.some(url=>typeof url!=='string'||url.length>2000))throw new Error('Die KI lieferte zu viele Dateien oder Recherche-URLs.');
  const names=new Set();
  for(const artifact of value.artifacts){if(!artifact||Object.keys(artifact).sort().join(',')!=='content,name'||!validArtifactName(artifact.name)||names.has(artifact.name)||typeof artifact.content!=='string'||bytes(artifact.content)>LIMITS.artifactBytes)throw new Error('Ein KI-Artefakt ist ungültig, doppelt oder zu groß.');names.add(artifact.name);}
  if(value.needsCapability!==null&&(typeof value.needsCapability!=='string'||!value.needsCapability.trim()||value.needsCapability.length>500))throw new Error('Die fehlende Fähigkeit ist ungültig.');
  if(value.researchUrls.length&&value.status!=='continue')throw new Error('Recherche muss vor einer Abschlussbehauptung ausgeführt werden.');
  return value;
}

// Provider-reported usage is intentionally partial: absent counters are UNKNOWN,
// not zero. Never interpret token counts as a monetary charge or a hard quota.
export function summarizeUsage(steps) {
  const totals={totalTokens:null,inputTokens:null,outputTokens:null,reportedSteps:0};
  const number=value=>Number.isSafeInteger(value)&&value>=0?value:null;
  for(const step of steps) {
    const usage=step.usage;
    if(!usage||typeof usage!=='object')continue;
    const input=number(usage.input_tokens)??number(usage.prompt_tokens);
    const output=number(usage.output_tokens)??number(usage.completion_tokens);
    const total=number(usage.total_tokens)??(input!==null||output!==null?(input??0)+(output??0):null);
    if(total===null&&input===null&&output===null)continue;
    totals.reportedSteps++;
    for(const [key,value] of [['totalTokens',total],['inputTokens',input],['outputTokens',output]]) {
      if(value!==null)totals[key]=Math.min(Number.MAX_SAFE_INTEGER,(totals[key]??0)+value);
    }
  }
  return totals;
}
// Keep only a digest of the last pure continuation output on the job record.
// Raw model output remains solely in its bounded per-step record.
async function outputDigest(value) {
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

export class JobEngine {
  constructor(store,provider,{now=Date.now,uuid=()=>crypto.randomUUID(),research=fetchDocumentation,requestTimeoutMs=45000}={}) {
    this.store=store;this.provider=provider;this.now=now;this.uuid=uuid;this.research=research;this.requestTimeoutMs=requestTimeoutMs;this.active=null;
    this.ready=this.recover();
  }
  jobs(){return this.store.list('job:').map(row=>row.value).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));}
  async recover() {
    // A durable claim surviving a process restart is an uncertain paid request.
    // Never automatically call the model for that same attempt again.
    this.store.transaction(()=>{
      for(const job of this.jobs())if(job.inflight){
        const error='Ein vorheriger KI-Schritt wurde unterbrochen; sein Ergebnis und Verbrauch sind unklar. Keine automatische Wiederholung. Bitte prüfen und ausdrücklich fortsetzen.';
        const step=this.store.get(stepKey(job.id,job.inflight.index));if(step)this.store.put(stepKey(job.id,step.index),{...step,status:'interrupted',summary:error});
        if(!terminal.has(job.status)&&job.status!=='paused')job.status='needs_input';job.error=error;job.summary=error;job.updatedAt=iso(this.now());job.revision++;job.inflight=null;this.store.put(jobKey(job.id),job);
      }
      this.store.delete('meta:lease');
    });
    await this.schedule();
  }
  async schedule() {
    const lease=this.store.get('meta:lease');
    const pending=this.jobs().filter(job=>['queued','running'].includes(job.status));
    if(lease)await this.store.setAlarm(this.now()+60000);
    else if(pending.length)await this.store.setAlarm(this.now()+1000);
    else await this.store.deleteAlarm();
  }
  async listJobs(){await this.ready;return this.jobs().reverse().map(publicJob);}
  requireJob(id){const job=this.store.get(jobKey(id));if(!job)throw new ApiError(404,'Auftrag nicht gefunden.');return job;}
  async getJob(id) {
    await this.ready;const job=this.requireJob(id);
    const steps=this.store.list(stepPrefix(id)).map(row=>row.value);
    return {job:publicJob(job),usage:summarizeUsage(steps),steps,artifacts:this.store.list(artifactPrefix(id)).map(row=>row.value)};
  }
  async create(input,idempotencyKey) {
    await this.ready;const value=validateJobInput(input);
    if(typeof idempotencyKey!=='string'||!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey))throw new ApiError(400,'Ein Idempotency-Key mit 16–128 Zeichen ist erforderlich.');
    const hash=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
    const [keyHash,fingerprint]=await Promise.all([hash(idempotencyKey),hash(JSON.stringify(value))]);
    const job=this.store.transaction(()=>{
      const previous=this.store.get('idempotency:'+keyHash);
      if(previous){if(previous.fingerprint!==fingerprint)throw new ApiError(409,'Dieser Idempotency-Key gehört zu einem anderen Auftrag.');return this.requireJob(previous.id);}
      if(this.jobs().length>=LIMITS.jobs)throw new ApiError(409,'Das Limit von 20 gespeicherten Aufträgen ist erreicht.');
      const timestamp=iso(this.now());const configured=this.provider.info.configured;
      const created={id:this.uuid(),...value,status:configured?'queued':'needs_input',createdAt:timestamp,updatedAt:timestamp,stepCount:0,summary:configured?'Auftrag gespeichert und eingeplant.':'KI-Zugang fehlt; bitte Dienst konfigurieren.',revision:0,inflight:null,deadlineAt:this.now()+value.maxDurationMinutes*60000};
      if(!configured)created.error=created.summary;
      this.store.put(jobKey(created.id),created);this.store.put('idempotency:'+keyHash,{id:created.id,fingerprint});return created;
    });
    await this.schedule();return publicJob(job);
  }
  async action(id,action) {
    await this.ready;
    const job=this.store.transaction(()=>{
      const job=this.requireJob(id);
      if(action==='stop'){
        if(!terminal.has(job.status)){job.status='stopped';job.summary='Vom Benutzer gestoppt.';job.revision++;}
      }else if(action==='pause'){
        if(!['queued','running','paused'].includes(job.status))throw new ApiError(409,'Dieser Auftrag kann nicht pausiert werden.');
        if(job.status!=='paused'){job.status='paused';job.summary='Vom Benutzer pausiert.';job.revision++;}
      }else if(action==='resume'){
        if(!['paused','needs_input'].includes(job.status))throw new ApiError(409,'Dieser Auftrag kann nicht fortgesetzt werden.');
        if(job.inflight)throw new ApiError(409,'Die vorherige Anfrage wird noch beendet. Bitte anschließend erneut fortsetzen.');
        if(!this.provider.info.configured)throw new ApiError(409,'Der KI-Zugang ist weiterhin nicht eingerichtet.');
        if(this.now()>=job.deadlineAt||job.stepCount>=job.maxSteps){job.status='limit_reached';job.summary='Schritt- oder Laufzeitlimit erreicht.';}
        else {job.status='queued';job.summary='Ausdrücklich zur Fortsetzung eingeplant.';delete job.error;}
        job.revision++;
      }else throw new ApiError(404,'Aktion nicht gefunden.');
      job.updatedAt=iso(this.now());this.store.put(jobKey(id),job);return job;
    });
    if(['pause','stop'].includes(action)&&this.active?.jobId===id)this.active.controller.abort();
    await this.schedule();return publicJob(job);
  }
  context(job) {
    const recent=this.store.list(stepPrefix(job.id)).map(row=>row.value).filter(step=>step.status==='completed').slice(-2).map(step=>({index:step.index,summary:step.summary,output:step.output.slice(-6000)}));
    let remaining=24000;const artifacts=this.store.list(artifactPrefix(job.id)).map(row=>{const content=row.value.content.slice(0,Math.max(0,remaining));remaining-=content.length;return {...row.value,content,truncated:content.length<row.value.content.length};});
    return {assignment:{title:job.title,prompt:job.prompt},step:job.stepCount,maxSteps:job.maxSteps,remainingSeconds:Math.max(0,Math.floor((job.deadlineAt-this.now())/1000)),recentSteps:recent,workspace:artifacts};
  }
  async alarm() {
    await this.ready;if(this.active)return;
    // A previous handler can fail during storage I/O without killing the whole
    // instance. Its leftover durable claim is uncertain, not a reason to spin
    // forever or issue another paid call.
    if(this.store.get('meta:lease')){await this.recover();return;}
    const claim=this.store.transaction(()=>{
      if(this.store.get('meta:lease'))return null;
      for(const job of this.jobs()){
        if(!['queued','running'].includes(job.status)||job.inflight)continue;
        if(this.now()>=job.deadlineAt||job.stepCount>=job.maxSteps){job.status='limit_reached';job.summary='Schritt- oder Laufzeitlimit erreicht.';job.updatedAt=iso(this.now());this.store.put(jobKey(job.id),job);continue;}
        const claim={id:this.uuid(),jobId:job.id,index:job.stepCount+1,revision:job.revision+1};
        job.status='running';job.stepCount=claim.index;job.revision=claim.revision;job.inflight=claim;job.updatedAt=iso(this.now());
        this.store.put(jobKey(job.id),job);this.store.put(stepKey(job.id,claim.index),{index:claim.index,createdAt:job.updatedAt,summary:'KI-Schritt gestartet; Ergebnis steht aus.',output:'',status:'running'});this.store.put('meta:lease',claim);
        return {claim,job};
      }
      return null;
    });
    if(!claim){await this.schedule();return;}
    const {job}=claim;const controller=new AbortController();this.active={jobId:job.id,controller,claimId:claim.claim.id};
    // Persist the claim and watchdog BEFORE any provider request. Alarm retries
    // after a crash see this claim and stop for human review, never rebill it.
    const deadline=AbortSignal.timeout(Math.max(1,job.deadlineAt-this.now()));
    const signal=AbortSignal.any([controller.signal,deadline]);
    let result,usage,error,outputHash;
    try {
      await this.store.setAlarm(this.now()+60000);await this.store.flush();
      const beforeCall=this.requireJob(job.id);
      if(beforeCall.revision!==claim.claim.revision||signal.aborted)throw new Error('Schritt wurde vor dem Modellaufruf angehalten.');
      let timer;
      const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{
        reject(new ProviderTimeoutError('Zeitlimit der KI-Anfrage erreicht. Die Anfrage kann beim Anbieter weiterlaufen und Kontingent verbrauchen. Keine automatische Wiederholung; dieser Auftrag kann nicht fortgesetzt werden.'));
        controller.abort();
      },Math.max(1,Math.min(this.requestTimeoutMs,job.deadlineAt-this.now())));});
      let model;
      try{model=await Promise.race([Promise.resolve().then(()=>{if(signal.aborted)throw new Error('Schritt angehalten.');return this.provider.run(this.context(job),{signal,requestId:claim.claim.id});}),timeout]);}
      finally{clearTimeout(timer);}
      usage=model.usage;result=validateStepResult(model.result);
      if(result.needsCapability)result={...result,status:'needs_input'};
      const researchArtifacts=[];
      for(let index=0;index<result.researchUrls.length;index++){
        const current=this.requireJob(job.id);if(current.revision!==claim.claim.revision||signal.aborted||this.now()>=current.deadlineAt)throw new Error('Schritt wurde angehalten.');
        const doc=await this.research(result.researchUrls[index],{signal});
        researchArtifacts.push({name:`research-${claim.claim.index}-${index+1}.txt`,content:`Source: ${doc.url}\nRetrieved: ${iso(this.now())}\nTruncated: ${doc.truncated}\n\n${doc.text}`});
      }
      result={...result,artifacts:[...result.artifacts,...researchArtifacts]};
      if(result.status==='continue'&&!result.artifacts.length&&!result.researchUrls.length)outputHash=await outputDigest(result.output.trim());
    }catch(caught){error=caught;usage=usage||caught?.usage;}
    try {
      this.store.transaction(()=>{
        const current=this.requireJob(job.id);const step=this.store.get(stepKey(job.id,claim.claim.index));
        const valid=current.status==='running'&&current.revision===claim.claim.revision&&current.inflight?.id===claim.claim.id;
        if(valid){
          if(this.now()>=current.deadlineAt){current.status='limit_reached';current.summary='Laufzeitlimit erreicht; verspätetes Ergebnis verworfen.';if(error instanceof ProviderTimeoutError)current.error=error.message;step.status='discarded';step.summary=current.summary;}
          else if(error){current.status=error instanceof CapabilityError?'needs_input':'failed';current.summary=error instanceof CapabilityError||error instanceof ProviderError?error.message:'KI-Schritt fehlgeschlagen. Keine automatische Wiederholung.';current.error=current.summary;step.status='failed';step.summary=current.summary;}
          else {
            const workspace=new Map(this.store.list(artifactPrefix(job.id)).map(row=>[row.value.name,row.value]));
            for(const artifact of result.artifacts){if(!validArtifactName(artifact.name)||bytes(artifact.content)>LIMITS.artifactBytes)throw new CapabilityError('Die Recherche- oder Datei-Ausgabe überschreitet die Workspace-Grenze.');workspace.set(artifact.name,artifact);}
            if(result.status==='completed'&&!result.artifacts.length)workspace.set('result.md',{name:'result.md',content:result.output});
            if(workspace.size>LIMITS.artifacts||[...workspace.values()].reduce((sum,artifact)=>sum+bytes(artifact.content),0)>LIMITS.workspaceBytes)throw new CapabilityError('Der Job-Workspace ist voll. Keine weiteren Dateien wurden gespeichert.');
            for(const artifact of workspace.values())this.store.put(artifactPrefix(job.id)+artifact.name,artifact);
            const repeated=Boolean(outputHash&&current.lastOutputDigest===outputHash);
            current.status=repeated?'needs_input':result.status==='continue'?'running':result.status;
            current.summary=repeated?'Wiederholter KI-Schritt ohne neue Dateien oder Recherche. Automatisch angehalten, um Kontingent zu schützen. Bitte Ergebnis prüfen.':result.summary;
            if(repeated)current.error=current.summary;else delete current.error;
            current.lastOutputDigest=outputHash??null;
            if(result.needsCapability)current.error=result.needsCapability;
            if(current.status==='running'&&current.stepCount>=current.maxSteps){current.status='limit_reached';current.summary=result.summary+' · Schrittlimit erreicht.';}
            step.status='completed';step.summary=current.summary;step.output=result.output;
          }
        }else if(error instanceof ProviderTimeoutError&&current.status==='paused') {current.status='failed';current.summary=error.message;current.error=error.message;step.status='failed';step.summary=error.message;}
        else {step.status='discarded';step.summary='Ergebnis nach Pause/Stopp verworfen.';}
        if(usage)step.usage=usage;
        if(current.inflight?.id===claim.claim.id)current.inflight=null;
        current.updatedAt=iso(this.now());this.store.put(stepKey(job.id,step.index),step);this.store.put(jobKey(job.id),current);
        if(this.store.get('meta:lease')?.id===claim.claim.id)this.store.delete('meta:lease');
      });
    }catch(commitError){
      // Validation/storage limits never leave a runnable paid claim behind.
      this.store.transaction(()=>{const current=this.requireJob(job.id);if(current.revision===claim.claim.revision&&current.status==='running'){current.status='needs_input';current.error=commitError instanceof CapabilityError?commitError.message:'Schrittergebnis konnte nicht sicher gespeichert werden. Bitte prüfen.';current.summary=current.error;}current.inflight=null;current.updatedAt=iso(this.now());this.store.put(jobKey(job.id),current);const step=this.store.get(stepKey(job.id,claim.claim.index));step.status='failed';step.summary=current.summary;this.store.put(stepKey(job.id,step.index),step);this.store.delete('meta:lease');});
    }finally{this.active=null;await this.schedule();}
  }
}
