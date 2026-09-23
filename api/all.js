'use strict';
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const {promisify}=require('node:util');const scrypt=promisify(crypto.scrypt);const {database,migrate}=require('../lib/db.cjs');const service=require('../lib/service.cjs');
const root=path.join(__dirname,'../public');const assets={'/sheet.css':'text/css; charset=utf-8','/app.js':'text/javascript; charset=utf-8','/ledger.js':'text/javascript; charset=utf-8','/style.css':'text/css; charset=utf-8','/favicon.svg':'image/svg+xml'};
function json(res,status,data){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(data));}
async function body(req){if(req.body){if(Buffer.byteLength(JSON.stringify(req.body))>16384)throw Object.assign(new Error('Conteúdo muito grande.'),{status:413});return typeof req.body==='string'?JSON.parse(req.body):req.body;}let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>16384)throw Object.assign(new Error('Conteúdo muito grande.'),{status:413});}return JSON.parse(raw||'{}');}
function cookie(req){return (req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('op_session='))?.slice(11)||'';}
function hash(s){return crypto.createHash('sha256').update(s).digest('hex');}
function setCookie(res,token,age){res.setHeader('Set-Cookie',`op_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${process.env.VERCEL||process.env.NODE_ENV==='production'?'; Secure':''}`);}
module.exports=async(req,res)=>{res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
 try{
 const url=new URL(req.url,'http://local');const route=url.pathname==='/api/all'&&url.searchParams.has('route')?'/'+url.searchParams.get('route'):url.pathname;
 if(req.method==='GET'&&(route==='/'||route==='/operacoes'||assets[route])){res.setHeader('Content-Type',assets[route]||'text/html; charset=utf-8');return res.end(fs.readFileSync(path.join(root,assets[route]?route.slice(1):'index.html')));}
 if(!route.startsWith('/api/'))return json(res,404,{error:'Página não encontrada.'});
 if(!['GET','POST'].includes(req.method))return json(res,405,{error:'Método não permitido.'});
 if(req.method==='POST'){
  const origin=req.headers.origin,host=req.headers.host;
  if(!origin||new URL(origin).host!==host)return json(res,403,{error:'Origem não permitida.'});
  if(!req.headers['content-type']?.startsWith('application/json'))return json(res,415,{error:'Envie JSON.'});
 }
 if(!process.env.PASSWORD_HASH||!process.env.PASSWORD_SALT)return json(res,503,{error:'Acesso ainda não configurado. Defina a senha do administrador antes de usar.'});
 if(route==='/api/session'&&req.method==='GET'&&!cookie(req))return json(res,200,{authenticated:false});
 await migrate();
 if(route==='/api/login'&&req.method==='POST'){
  const data=await body(req);if(typeof data.password!=='string'||data.password.length>256)return json(res,400,{error:'Senha inválida.'});
  const key=hash('login:'+((process.env.VERCEL?req.headers['x-vercel-forwarded-for']:req.socket?.remoteAddress)||'unknown'));
  const attempts=await database().query("INSERT INTO op_login_limits(key,attempts,expires_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN op_login_limits.expires_at<now() THEN 1 ELSE op_login_limits.attempts+1 END, expires_at=CASE WHEN op_login_limits.expires_at<now() THEN now()+interval '15 minutes' ELSE op_login_limits.expires_at END RETURNING attempts",[key]);
  if(attempts.rows[0].attempts>10)return json(res,429,{error:'Muitas tentativas. Aguarde 15 minutos.'});
  const actual=await scrypt(data.password,process.env.PASSWORD_SALT,64);const expected=Buffer.from(process.env.PASSWORD_HASH,'hex');
  if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))return json(res,401,{error:'Senha incorreta.'});
  const token=crypto.randomBytes(32).toString('hex');await database().query("INSERT INTO op_sessions(token_hash,expires_at) VALUES($1,now()+interval '12 hours')",[hash(token)]);await database().query('DELETE FROM op_login_limits WHERE key=$1',[key]);await database().query('DELETE FROM op_sessions WHERE expires_at<now()');setCookie(res,token,43200);return json(res,200,{ok:true});
 }
 const token=cookie(req);const authenticated=/^[a-f0-9]{64}$/.test(token)&&(await database().query('SELECT 1 FROM op_sessions WHERE token_hash=$1 AND expires_at>now()',[hash(token)])).rowCount>0;
 if(route==='/api/session'&&req.method==='GET')return json(res,200,{authenticated});
 if(!authenticated)return json(res,401,{error:'Entre para acessar seus dados.'});
 if(route==='/api/logout'&&req.method==='POST'){await database().query('DELETE FROM op_sessions WHERE token_hash=$1',[hash(token)]);setCookie(res,'',0);return json(res,200,{ok:true});}
 if(route==='/api/state'&&req.method==='GET')return json(res,200,await service.state());
 if(route==='/api/mutate'&&req.method==='POST')return json(res,200,await service.mutate(await body(req)));
 return json(res,404,{error:'Rota não encontrada.'});
 }catch(e){if(e instanceof SyntaxError)return json(res,400,{error:'Dados inválidos.'});console.error('finance_request_error',e.code||e.status||'internal');return json(res,e.status||500,{error:e.status?e.message:'Não foi possível concluir. Tente novamente; nenhum lançamento parcial foi salvo.'});}
};

