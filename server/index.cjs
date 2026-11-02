const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {WebSocketServer}=require('ws');
const {Rooms}=require('./rooms.cjs');
function createServer({maxRooms=Number(process.env.MAX_ROOMS)||4,allowedOrigins=process.env.ALLOWED_ORIGINS||'https://stunning-flan-fd1b50.netlify.app',autoTick=true}={}){
  const rooms=new Rooms({maxRooms}),root=path.resolve(__dirname,'../dist');
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,rooms:rooms.rooms.size}));return;}
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    let file;try{file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));}catch{res.writeHead(400);res.end();return;}
    if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
    fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end('Not found');return;}
      res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:data);});
  });
  const wss=new WebSocketServer({noServer:true,maxPayload:4096,perMessageDeflate:false});
  const origins=new Set(allowedOrigins.split(',').map(s=>s.trim()));
  server.on('upgrade',(req,socket,head)=>{
    let okOrigin=false;
    try{const o=new URL(req.headers.origin);okOrigin=origins.has(o.origin)||o.host===req.headers.host||['localhost','127.0.0.1'].includes(o.hostname);}catch{}
    if(req.url!=='/ws'||!okOrigin||wss.clients.size>=32){socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();return;}
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));
  });
  wss.on('connection',socket=>{
    socket.alive=true;socket.tokens=120;socket.refill=Date.now();socket.on('error',()=>{});
    socket.on('pong',()=>socket.alive=true);
    socket.on('message',(data,binary)=>{
      const now=Date.now();socket.tokens=Math.min(120,socket.tokens+(now-socket.refill)*.08);socket.refill=now;
      if(binary||--socket.tokens<0){socket.close(1008,'Too many messages');return;}
      let msg;try{msg=JSON.parse(data.toString());}catch{rooms.fail(socket,'Invalid JSON.');return;}
      try{rooms.handle(socket,msg);}catch(err){console.error('Room message failed:',err.message);rooms.fail(socket,'Unable to process that action.');}
    });
    socket.on('close',()=>rooms.disconnect(socket));
  });
  let accumulator=0,last=performance.now(),snapTime=0;
  const timer=autoTick?setInterval(()=>{
    const now=performance.now();accumulator+=Math.min(.1,(now-last)/1000);last=now;
    while(accumulator>=1/120){rooms.tick(1/120);accumulator-=1/120;}
    if(now-snapTime>=50){rooms.snapshots();snapTime=now;}
  },8):null;
  const heartbeat=setInterval(()=>{for(const s of wss.clients){if(!s.alive){s.terminate();continue;}s.alive=false;s.ping();}},5000);
  async function close(){clearInterval(timer);clearInterval(heartbeat);for(const socket of wss.clients)socket.terminate();await new Promise(resolve=>wss.close(resolve));await new Promise(resolve=>server.close(resolve));}
  return {server,rooms,wss,close};
}
if(require.main===module){const app=createServer();app.server.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log(`Field Lab server: http://localhost:${app.server.address().port}`));for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>app.close().then(()=>process.exit(0)));}
module.exports={createServer};
