'use strict';
const {Pool}=require('pg');const fs=require('node:fs');const path=require('node:path');
let pool,ready;
function database(){if(!process.env.DATABASE_URL)throw Object.assign(new Error('Banco ainda não configurado.'),{status:503});if(!pool)pool=new Pool({connectionString:process.env.DATABASE_URL,max:3,idleTimeoutMillis:10000,connectionTimeoutMillis:15000});return pool;}
async function migrate(){if(!ready)ready=(async()=>{const c=await database().connect();try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(791438202)');await c.query(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}})().catch(e=>{ready=null;throw e;});return ready;}
async function tx(fn){const c=await database().connect();try{await c.query('BEGIN');const r=await fn(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
module.exports={database,migrate,tx};

