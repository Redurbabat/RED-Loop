import {DurableObject} from 'cloudflare:workers';
import {JobEngine} from './job-engine.js';
import {SqliteJobStore} from './sqlite-store.js';
import {createProvider} from './providers.js';
import {dispatchJobRequest} from './jobs-api.js';
import {ApiError} from './cloud-common.js';

export class RedLoopJobs extends DurableObject {
  constructor(ctx,env) {
    super(ctx,env);
    // Initialization only: no network/model request inside the input gate.
    this.ctx.blockConcurrencyWhile(async()=>{
      this.engine=new JobEngine(new SqliteJobStore(this.ctx.storage),createProvider(this.env));
      await this.engine.ready;
    });
  }
  async handle(payload) {
    try {return await dispatchJobRequest(this.engine,payload);}
    catch(error){if(error instanceof ApiError)return {status:error.status,body:{error:error.message}};return {status:500,body:{error:'Der Auftrag konnte nicht sicher verarbeitet werden.'}};}
  }
  async alarm() {await this.engine.alarm();}
}
