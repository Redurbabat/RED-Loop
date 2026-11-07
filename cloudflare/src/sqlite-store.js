import {LIMITS,bytes} from './cloud-common.js';
export class SqliteJobStore {
  constructor(storage) {
    this.storage=storage;
    storage.sql.exec('CREATE TABLE IF NOT EXISTS red_loop_records (record_key TEXT PRIMARY KEY, json_value TEXT NOT NULL)');
  }
  get(key){const row=this.storage.sql.exec('SELECT json_value FROM red_loop_records WHERE record_key = ?',key).toArray()[0];return row?JSON.parse(row.json_value):undefined;}
  list(prefix){return this.storage.sql.exec('SELECT record_key, json_value FROM red_loop_records WHERE record_key >= ? AND record_key < ? ORDER BY record_key',prefix,prefix+'\uffff').toArray().map(row=>({key:row.record_key,value:JSON.parse(row.json_value)}));}
  put(key,value){const text=JSON.stringify(value);if(bytes(text)>LIMITS.recordBytes)throw new Error('Durable record exceeds its storage budget.');this.storage.sql.exec('INSERT INTO red_loop_records (record_key,json_value) VALUES (?,?) ON CONFLICT(record_key) DO UPDATE SET json_value=excluded.json_value',key,text);}
  delete(key){this.storage.sql.exec('DELETE FROM red_loop_records WHERE record_key = ?',key);}
  transaction(callback){return this.storage.transactionSync(callback);}
  setAlarm(time){return this.storage.setAlarm(time);}
  deleteAlarm(){return this.storage.deleteAlarm();}
  flush(){return this.storage.sync();}
}
