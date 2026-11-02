const assert=require('node:assert/strict');
const {WebSocket}=require('ws');
const {createServer}=require('../server/index.cjs');
(async()=>{
 const app=createServer();await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const port=app.server.address().port;
 const clients=[];
 async function client(origin='http://localhost:3000'){
  const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`,{origin});clients.push(ws);ws.messages=[];ws.on('message',data=>ws.messages.push(JSON.parse(data)));await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});return ws;
 }
 async function wait(ws,predicate){const end=Date.now()+6000;while(Date.now()<end){const msg=ws.messages.find(predicate);if(msg)return msg;await new Promise(r=>setTimeout(r,10));}throw Error('Timed out waiting for server message');}
 const send=(ws,msg)=>ws.send(JSON.stringify(msg));
 try{
  assert.equal((await fetch(`http://127.0.0.1:${port}/health`)).status,200);
  assert((await (await fetch(`http://127.0.0.1:${port}/`)).text()).includes('Private room'));
  const a=await client(),b=await client();send(a,{type:'create',mode:'1v1',team:'341'});const welcome=await wait(a,m=>m.type==='welcome');
  send(b,{type:'join',code:welcome.code,team:'316'});await wait(b,m=>m.type==='room'&&m.players.length===2);
  send(a,{type:'ready',ready:true});send(b,{type:'ready',ready:true});const snapshot=await wait(b,m=>m.type==='snapshot'&&m.started);
  assert.equal(snapshot.fleet.length,2);assert.equal(snapshot.fleet[1].config.alliance,'red');assert.equal(snapshot.initialCenterCount,392);
  send(a,{type:'input',input:{moveX:-1}});await wait(a,m=>m.type==='snapshot'&&m.fleet[0].robot.vx<0);
  b.close();await wait(a,m=>m.type==='room'&&m.status==='paused');
  await assert.rejects(client('https://unapproved.example'));
  console.log('PASS HTTP health/static routes, two real WebSockets, room/countdown/shared world, inputs, disconnect pause and origin rejection');
 }finally{for(const c of clients)c.terminate();await app.close();}
})().catch(err=>{console.error(err);process.exitCode=1;});
