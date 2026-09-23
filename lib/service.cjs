'use strict';
const {database,tx}=require('./db.cjs');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function fail(message,status=400){throw Object.assign(new Error(message),{status});}
function text(v,max=100){if(typeof v!=='string'||v.length>max)fail('Texto inválido.');return v.trim();}
function num(v,min=0,max=1e12){if(!Number.isSafeInteger(v)||v<min||v>max)fail('Valor inválido. Use valores positivos com até duas casas decimais.');return v;}
function date(v){if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)fail('Data inválida.');return v;}
function choice(v,allowed){if(!allowed.includes(v))fail('Seleção inválida.');return v;}
function validate(kind,d){const base={date:date(d.date),notes:text(d.notes||'',1500)};
 if(kind==='income')return {...base,asset:'LFTS11',amount:num(d.amount),source:text(d.source||'manual',80)};
 if(kind==='holding'){const total=num(d.total),committed=num(d.committed);if(committed>total)fail('A garantia comprometida não pode superar o saldo informado.');return {...base,asset:'LFTS11',total,committed};}
 if(kind!=='option')fail('Registro inválido.');
 const r={...base,cycle:text(d.cycle,7),asset:text(d.asset,12).toUpperCase(),code:text(d.code||'',30).toUpperCase(),type:choice(d.type,['PUT','CALL']),side:choice(d.side,['Venda','Compra']),expiry:date(d.expiry),strike:num(d.strike,1),quantity:num(d.quantity,1,1e8),unit:num(d.unit),premium:num(d.premium),costs:d.costs===null?null:num(d.costs),guarantee:num(d.guarantee),status:choice(d.status,['Aberta','A conferir','Expirada','Encerrada','Exercida']),closeDate:d.closeDate?date(d.closeDate):'',closeValue:num(d.closeValue||0),covered:Boolean(d.covered),source:text(d.source||'manual',80)};
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(r.cycle)||!r.asset)fail('Informe ciclo e ativo.');
 if(r.expiry<r.date)fail('O vencimento não pode ser anterior à abertura.');
 if(['Encerrada','Exercida','Expirada'].includes(r.status)&&!r.closeDate)fail('Informe a data de encerramento ou exercício.');
 if(r.closeDate&&r.closeDate<r.date)fail('O encerramento não pode ser anterior à abertura.');
 if(r.status==='Expirada'&&r.closeDate<r.expiry)fail('A expiração não pode ser anterior ao vencimento.');
 if(['Aberta','A conferir'].includes(r.status)){r.closeDate='';r.closeValue=0;}
 if(r.status==='Expirada')r.closeValue=0;
 if(!Number.isSafeInteger(r.strike*r.quantity)||r.strike*r.quantity>1e14)fail('Capital-base acima do limite permitido.');
 r.lftsIncome=d.lftsIncome===null||d.lftsIncome===undefined?null:num(d.lftsIncome,-1e12);
 r.sheetMode=true;
 r.sourceNote=text(d.sourceNote||'',1500);
 if(d.sheetMigration===2)r.sheetMigration=2;
 return r;
}
async function state(){const [records,audit]=await Promise.all([database().query('SELECT id,kind,data,version FROM op_records WHERE archived_at IS NULL ORDER BY created_at'),database().query('SELECT action,created_at FROM op_audit ORDER BY id DESC LIMIT 15')]);return {records:records.rows,audit:audit.rows};}
async function mutate(b){if(!UUID.test(b.requestId)||!UUID.test(b.id))fail('Identificador inválido.');return tx(async c=>{await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[b.requestId]);const prior=await c.query('SELECT result FROM op_requests WHERE id=$1',[b.requestId]);if(prior.rowCount)return prior.rows[0].result;const old=(await c.query('SELECT * FROM op_records WHERE id=$1 FOR UPDATE',[b.id])).rows[0];if(old&&(old.archived_at||old.version!==b.version))fail('Este registro mudou. Atualize a página antes de salvar.',409);if(!old&&b.version)fail('Registro não encontrado.',404);
 if(b.action==='archive'){if(!old)fail('Registro não encontrado.',404);await c.query('UPDATE op_records SET archived_at=now(),version=version+1 WHERE id=$1',[b.id]);await c.query('INSERT INTO op_audit(record_id,action,before_data) VALUES($1,$2,$3)',[b.id,'Registro arquivado',old.data]);}
 else if(b.action==='save'){if(old&&old.kind!==b.kind)fail('Tipo de registro não pode mudar.');const data=validate(b.kind,b.data);await c.query('INSERT INTO op_records(id,kind,data) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET data=$3,version=op_records.version+1,updated_at=now()',[b.id,b.kind,data]);await c.query('INSERT INTO op_audit(record_id,action,before_data,after_data) VALUES($1,$2,$3,$4)',[b.id,old?'Registro atualizado':'Registro criado',old?.data||null,data]);}
 else fail('Ação inválida.');const result={ok:true};await c.query('INSERT INTO op_requests(id,result) VALUES($1,$2)',[b.requestId,result]);return result;});}
module.exports={state,mutate,validate};
