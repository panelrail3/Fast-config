'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const DATA = '/app/data';
const RUNTIME = '/app/runtime';
const PORT = Number(process.env.PANEL_PORT || 3000);
const STATE = path.join(DATA, 'state.json');
fs.mkdirSync(DATA, {recursive:true});
fs.mkdirSync(RUNTIME, {recursive:true});
function hash(s){return crypto.createHash('sha256').update(String(s)).digest('hex');}
function uuid(){return crypto.randomUUID();}
let state;
try { state = JSON.parse(fs.readFileSync(STATE,'utf8')); } catch(e) { state = null; }
if (!state || !Array.isArray(state.clients) || state.clients.length !== 3) {
  state={passwordHash:hash('admin1323'),clients:[uuid(),uuid(),uuid()]};
  fs.writeFileSync(STATE,JSON.stringify(state,null,2));
}
const defs=[
 {name:'VLESS + WebSocket + TLS',path:'/ws-vless',port:10001,type:'ws'},
 {name:'VLESS + HTTPUpgrade + TLS',path:'/hu-vless',port:10002,type:'httpupgrade'},
 {name:'VLESS + XHTTP + TLS',path:'/xhttp-vless',port:10003,type:'xhttp'}
];
function host(req){return String(req.headers['x-forwarded-host']||req.headers.host||'').split(',')[0].trim().split(':')[0]||'YOUR-RAILWAY-DOMAIN';}
function cfg(){
 const inbounds=defs.map((d,i)=>{
   const stream={network:d.type,security:'none'};
   if(d.type==='ws') stream.wsSettings={path:d.path};
   if(d.type==='httpupgrade') stream.httpupgradeSettings={path:d.path};
   if(d.type==='xhttp') stream.xhttpSettings={path:d.path,mode:'auto'};
   return {listen:'127.0.0.1',port:d.port,protocol:'vless',settings:{clients:[{id:state.clients[i],email:d.name}],decryption:'none'},streamSettings:stream,tag:'vless-'+d.type};
 });
 const out={log:{loglevel:'warning',access:RUNTIME+'/xray-access.log',error:RUNTIME+'/xray-error.log'},inbounds,outbounds:[{protocol:'freedom',tag:'direct'},{protocol:'blackhole',tag:'blocked'}]};
 fs.writeFileSync(RUNTIME+'/xray.json',JSON.stringify(out,null,2)); return out;
}
cfg();
function json(res,status,obj,headers){res.writeHead(status,Object.assign({'content-type':'application/json; charset=utf-8','cache-control':'no-store'},headers||{}));res.end(JSON.stringify(obj));}
function body(req){return new Promise((resolve,reject)=>{let s='';req.on('data',c=>{s+=c;if(s.length>1e6)req.destroy();});req.on('end',()=>{try{resolve(s?JSON.parse(s):{});}catch(e){reject(e);}});req.on('error',reject);});}
function cookie(req){const m=String(req.headers.cookie||'').match(/(?:^|;\s*)sid=([^;]+)/);return m?m[1]:'';}
const sessions=new Set();
const server=http.createServer(async(req,res)=>{
 try {
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/health') return json(res,200,{ok:true});
  if(u.pathname==='/api/login'&&req.method==='POST') {const b=await body(req);if(b.username==='admin'&&hash(b.password||'')===state.passwordHash){const sid=crypto.randomBytes(24).toString('hex');sessions.add(sid);return json(res,200,{ok:true},{'set-cookie':'sid='+sid+'; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400'});}return json(res,401,{ok:false,error:'Invalid credentials'});}
  if(!sessions.has(cookie(req))) {if(u.pathname==='/'&&req.method==='GET'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return fs.createReadStream('/app/public/index.html').pipe(res);}return json(res,401,{ok:false,error:'Unauthorized'});}
  if(u.pathname==='/api/configs'){cfg();const h=host(req);return json(res,200,{domain:h,configs:defs.map((d,i)=>({name:d.name,uuid:state.clients[i],url:'vless://'+state.clients[i]+'@'+h+':443?type='+encodeURIComponent(d.type)+'&security=tls&encryption=none&path='+encodeURIComponent(d.path)+'&sni='+encodeURIComponent(h)+'&host='+encodeURIComponent(h)+'#'+encodeURIComponent(d.name)}))});}
  if(u.pathname==='/api/password'&&req.method==='POST'){const b=await body(req);if(String(b.password||'').length<8)return json(res,400,{error:'Password must be at least 8 characters'});state.passwordHash=hash(b.password);fs.writeFileSync(STATE,JSON.stringify(state,null,2));return json(res,200,{ok:true});}
  if(u.pathname==='/api/logout'){sessions.delete(cookie(req));return json(res,200,{ok:true},{'set-cookie':'sid=; Max-Age=0; Path=/'});}
  if(u.pathname==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return fs.createReadStream('/app/public/index.html').pipe(res);}
  return json(res,404,{error:'Not found'});
 } catch(e){console.error(e);return json(res,500,{error:'Internal server error'});}
});
server.listen(PORT,'127.0.0.1',()=>console.log('PANEL_READY '+PORT));
