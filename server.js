// Крышка Battle — сервер (Express + Socket.IO). Физика мен ұпай тек серверде есептеледі.
const express=require('express'),http=require('http'),{Server}=require('socket.io'),fs=require('fs');
const app=express();app.get('/',(q,r)=>r.sendFile(__dirname+'/index.html'));
const srv=http.createServer(app),io=new Server(srv);
const DB=__dirname+'/db.json';let db={};try{db=JSON.parse(fs.readFileSync(DB))}catch(e){}
const save=()=>fs.writeFile(DB,JSON.stringify(db),()=>{});
const SKINS={basic:{n:'Қарапайым',p:0,c:[0xffb300,0xff6a00]},gold:{n:'Алтын',p:50,c:[0xffd700,0xb8860b]},ice:{n:'Мұз',p:60,c:[0xbdeaff,0x39a7ff]},fire:{n:'От',p:70,c:[0xff4500,0x8b0000]},neon:{n:'Неон',p:80,c:[0x39ff14,0xff00ff]},diamond:{n:'Алмаз',p:150,c:[0xe0ffff,0x00e5ff]}};
const MODES={'1v1':{n:2,t:5,r:1},ffa:{n:8,t:5,r:1},'4v4':{n:8,t:8,r:1,teams:1},champ:{n:4,t:3,r:3}};
const R=26,W=360,H=520,E=.92,rooms={};
const code=()=>Math.random().toString(36).slice(2,6).toUpperCase();
const hum=r=>[...r.p.values()].filter(p=>!p.bot);

function newRoom(k,pub){const c=code();return rooms[c]={c,k,m:MODES[k],p:new Map(),st:'lobby',h:null,pub,sc:{},rw:{}};}
function emitRoom(r){io.to(r.c).emit('room',{c:r.c,m:r.k,n:r.m.n,st:r.st,h:r.h,p:[...r.p.values()].map(p=>({id:p.id,nick:p.nick,av:p.av,bot:p.bot}))});}
function join(s,r){const u=db[s.uid];if(!u)return;
 if(r.st!=='lobby')return s.emit('err','Ойын басталып кетті');
 if(r.p.size>=r.m.n)return s.emit('err','Бөлме толы');
 leave(s);s.join(r.c);s.rc=r.c;
 r.p.set(s.id,{id:s.id,uid:s.uid,nick:u.nick,av:u.avatar,skin:u.skin,hits:0});
 if(!r.h)r.h=s.id;emitRoom(r);}
function leave(s){const r=rooms[s.rc];if(!r)return;s.leave(r.c);s.rc=null;r.p.delete(s.id);
 const hs=hum(r);if(!hs.length){delete rooms[r.c];return}
 if(r.h===s.id)r.h=hs[0].id;if(r.st==='lobby')emitRoom(r);}

function spawn(r){const ps=[...r.p.values()],n=ps.length;
 ps.forEach((p,i)=>{
  if(r.m.teams){const mates=ps.filter(q=>q.team===p.team),ti=mates.indexOf(p);p.x=W*(ti+1)/(mates.length+1);p.y=p.team?400:120;}
  else{const a=i/n*Math.PI*2;p.x=W/2+Math.cos(a)*110;p.y=H/2+Math.sin(a)*160;}
  p.vx=p.vy=0;p.arm=false;});}
function startRoom(r){if(r.st!=='lobby')return;
 let i=0;while(r.p.size<r.m.n){i++;r.p.set('b'+i,{id:'b'+i,nick:'Бот '+i,av:'🤖',skin:Object.keys(SKINS)[1+i%5],bot:1,bt:1,hits:0});}
 [...r.p.values()].forEach((p,j)=>{p.team=r.m.teams?j%2:j;p.hits=0});
 r.st='play';r.sc={};r.rw={};spawn(r);
 const list=[...r.p.values()].map(q=>({id:q.id,nick:q.nick,team:q.team,skin:q.skin}));
 for(const p of hum(r))io.to(p.id).emit('go',{m:r.k,teams:!!r.m.teams,team:p.team,p:list});}

function hit(r,p){p.arm=false;p.hits++;r.sc[p.team]=(r.sc[p.team]||0)+1;
 if(r.sc[p.team]>=r.m.t)endRound(r,p.team);}
function endRound(r,team){r.rw[team]=(r.rw[team]||0)+1;
 if(r.rw[team]>=Math.ceil(r.m.r/2))return finish(r,team);
 r.sc={};spawn(r);io.to(r.c).emit('round',{team});}
function finish(r,team){r.st='over';
 for(const p of hum(r)){const u=db[p.uid];if(!u)continue;
  if(p.team===team){u.wins++;u.coins+=10}else u.losses++;
  u.score+=p.hits;io.to(p.id).emit('me',u);}
 save();io.to(r.c).emit('over',{team});
 setTimeout(()=>{if(!rooms[r.c])return;for(const [id,p] of r.p)if(p.bot)r.p.delete(id);
  r.st='lobby';r.sc={};r.rw={};emitRoom(r);},5000);}

function step(r,dt){const ps=[...r.p.values()];
 for(const p of ps){
  const sp=Math.hypot(p.vx,p.vy);
  if(p.bot&&sp<40&&(p.bt-=dt)<=0){p.bt=1+Math.random();
   const en=ps.filter(q=>q.team!==p.team),q=en[Math.random()*en.length|0];
   if(q){const a=Math.atan2(q.y-p.y,q.x-p.x)+(Math.random()-.5)*.4,v=300+Math.random()*450;
    p.vx=Math.cos(a)*v;p.vy=Math.sin(a)*v;p.arm=true;}}
  const f=Math.pow(.3,dt);p.vx*=f;p.vy*=f;p.x+=p.vx*dt;p.y+=p.vy*dt;
  if(p.x<10+R){p.x=10+R;p.vx=Math.abs(p.vx)*E}
  if(p.x>W-10-R){p.x=W-10-R;p.vx=-Math.abs(p.vx)*E}
  if(p.y<10+R){p.y=10+R;p.vy=Math.abs(p.vy)*E}
  if(p.y>H-10-R){p.y=H-10-R;p.vy=-Math.abs(p.vy)*E}
  if(sp<30)p.arm=false;}
 for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++){
  const a=ps[i],b=ps[j];let dx=b.x-a.x,dy=b.y-a.y;const d=Math.hypot(dx,dy);
  if(d>=2*R||d===0)continue;dx/=d;dy/=d;
  const o=(2*R-d)/2;a.x-=dx*o;a.y-=dy*o;b.x+=dx*o;b.y+=dy*o;
  const sa=Math.hypot(a.vx,a.vy),sb=Math.hypot(b.vx,b.vy),vn=(a.vx-b.vx)*dx+(a.vy-b.vy)*dy;
  if(vn>0){const k=(1+E)/2*vn;a.vx-=k*dx;a.vy-=k*dy;b.vx+=k*dx;b.vy+=k*dy;}
  if(a.team===b.team)continue;
  if(a.arm&&sa>90&&(!b.arm||sa>=sb))hit(r,a);else if(b.arm&&sb>90)hit(r,b);
  if(r.st!=='play')return;}}
setInterval(()=>{for(const r of Object.values(rooms))if(r.st==='play')step(r,1/60)},1000/60);
setInterval(()=>{for(const r of Object.values(rooms))if(r.st==='play')
 io.to(r.c).emit('s',{t:[...r.p.values()].map(p=>[p.id,+p.x.toFixed(1),+p.y.toFixed(1),Math.hypot(p.vx,p.vy)<40?1:0]),sc:r.sc,rw:r.rw})},33);

io.on('connection',s=>{
 s.on('login',({token,nick},cb)=>{
  if(typeof token!=='string'||token.length<8||token.length>60)return;
  s.uid=token;
  const u=db[token]||(db[token]={nick:String(nick||'Ойыншы').slice(0,12),avatar:'😎',wins:0,losses:0,score:0,coins:0,skins:['basic'],skin:'basic'});
  save();cb({u,skins:SKINS});});
 s.on('prof',({nick,avatar},cb)=>{const u=db[s.uid];if(!u)return;
  u.nick=String(nick||u.nick).trim().slice(0,12)||u.nick;u.avatar=String(avatar||u.avatar).slice(0,4);save();cb(u);});
 s.on('buy',(k,cb)=>{const u=db[s.uid],sk=SKINS[k];
  if(!u||!sk)return;if(u.skins.includes(k))return cb({e:'Бар'});
  if(u.coins<sk.p)return cb({e:'Тиын жеткіліксіз'});
  u.coins-=sk.p;u.skins.push(k);save();cb({u});});
 s.on('equip',(k,cb)=>{const u=db[s.uid];if(!u||!u.skins.includes(k))return;u.skin=k;save();cb({u});});
 s.on('rank',cb=>cb(Object.values(db).sort((a,b)=>b.score-a.score).slice(0,20).map(u=>({nick:u.nick,avatar:u.avatar,score:u.score}))));
 s.on('create',({m})=>{if(!MODES[m])return;join(s,newRoom(m,false));});
 s.on('joinc',({c})=>{const r=rooms[c];if(!r)return s.emit('err','Бөлме табылмады');join(s,r);});
 s.on('quick',({m})=>{if(!MODES[m])return;
  let r=Object.values(rooms).find(x=>x.pub&&x.k===m&&x.st==='lobby'&&x.p.size<x.m.n);
  if(!r){r=newRoom(m,true);setTimeout(()=>{if(rooms[r.c])startRoom(r)},6000);}
  join(s,r);});
 s.on('start',()=>{const r=rooms[s.rc];if(r&&r.h===s.id)startRoom(r);});
 s.on('shoot',({a,p})=>{const r=rooms[s.rc],q=r&&r.st==='play'&&r.p.get(s.id);
  if(!q||typeof a!=='number'||typeof p!=='number'||Math.hypot(q.vx,q.vy)>40)return;
  const v=200+Math.max(0,Math.min(1,p))*750;q.vx=Math.cos(a)*v;q.vy=Math.sin(a)*v;q.arm=true;});
 s.on('leave',()=>leave(s));
 s.on('disconnect',()=>leave(s));
});
srv.listen(process.env.PORT||3000,()=>console.log('Іске қосылды: http://localhost:'+(process.env.PORT||3000)));
