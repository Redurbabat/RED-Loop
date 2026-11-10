import {test} from 'node:test';
import assert from 'node:assert/strict';
import {localEndpoint,validLocalStep,runLocalOllama} from '../scripts/ollama-local.mjs';

const value=(status,output,plan=['Plan step'])=>({status,summary:'Fixture result',output,plan,nextAction:null});
const fake=items=>{let index=0;const requests=[];return {requests,
  fetch:async(url,options)=>{
    requests.push({url,options});
    const item=items[index++];
    if(!item)throw new Error('Unexpected model request');
    return Response.json({message:{content:JSON.stringify(item)},prompt_eval_count:10,eval_count:5});
  }};};

test('Ollama endpoint must remain loopback, never an external service or URL with credentials',()=>{
  assert.equal(localEndpoint(),'http://127.0.0.1:11434');
  assert.equal(localEndpoint('http://127.0.0.1:11500/'),'http://127.0.0.1:11500');
  for(const input of ['https://127.0.0.1:11434/','http://10.0.0.1:11434/','http://localhost.evil.example:11434/','http://user:pass@127.0.0.1:11434/','http://127.0.0.1:11434/other','http://127.0.0.1:11434/?x=1']){
    assert.throws(()=>localEndpoint(input));
  }
});
test('Local task reports an AI-generated plan, steps and measured tokens without claiming verification',async()=>{
  const host=fake([value('continue','First result',['Investigate','Write']),value('completed','Final deliverable',['Investigate','Write'])]);
  const report=await runLocalOllama({model:'qwen3:8b',prompt:'Prepare a technical summary.',maxSteps:4,fetchImpl:host.fetch});
  assert.equal(report.status,'completed');assert.equal(report.verification,'model_reported');
  assert.equal(report.steps.length,2);assert.equal(report.reportedTokens.input,20);assert.equal(report.reportedTokens.output,10);
  assert.deepEqual(report.plan,['Investigate','Write']);
  assert.equal(host.requests.length,2);
  const request=JSON.parse(host.requests[0].options.body);
  assert.equal(host.requests[0].url,'http://127.0.0.1:11434/api/chat');
  assert.equal(request.stream,false);assert.equal(request.format.type,'object');
  assert.equal(host.requests[0].options.redirect,'error');
});
test('Repeated identical local work stops without third model call',async()=>{
  const host=fake([value('continue','Repeated'),value('continue','Repeated'),value('completed','Should not be used')]);
  const report=await runLocalOllama({model:'qwen3:8b',prompt:'Do a small task',fetchImpl:host.fetch});
  assert.equal(report.status,'needs_input');assert.equal(report.steps.length,2);
  assert.match(report.summary,/angehalten/);assert.equal(host.requests.length,2);
});
test('Invalid model output is stopped without automatic retry',async()=>{
  const host={calls:0,fetch:async()=>{host.calls++;return Response.json({message:{content:'not json'}});}};
  const report=await runLocalOllama({model:'qwen3:8b',prompt:'Task',fetchImpl:host.fetch});
  assert.equal(report.status,'needs_input');assert.equal(host.calls,1);
  assert.equal(report.steps.length,0);assert.equal(report.verification,null);
  assert.throws(()=>validLocalStep({...value('continue','x'),extra:'unexpected'}));
});
test('Model selection, prompt and step limits are bounded before any request',async()=>{
  for(const options of [{model:'',prompt:'x'},{model:'m',prompt:''},{model:'m',prompt:'x',maxSteps:51},{model:'evil model',prompt:'x'}]){
    await assert.rejects(runLocalOllama(options));
  }
});
