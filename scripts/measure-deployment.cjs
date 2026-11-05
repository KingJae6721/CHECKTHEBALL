// Bounded production-browser probe. Does not disable GPU or change game graphics.
const fs=require('fs'),os=require('os'),path=require('path'),{spawn}=require('child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let url=process.env.CTB_WEB_URL||'https://checktheball.vercel.app/?diagnostics=1',localServer;
const seconds=Number(process.env.CTB_PROBE_SECONDS||5),browsers=[];
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ctb-measure-'));
async function browser(){
 const profile=path.join(dir,String(browsers.length));
 const process=spawn(global.process.env.CTB_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--disable-extensions','--disable-background-timer-throttling','--disable-renderer-backgrounding','--remote-debugging-port=0','--user-data-dir='+profile,'--window-size=1280,900','about:blank'],{windowsHide:true,stdio:'ignore'});
 const entry={process};browsers.push(entry);let port;
 for(let i=0;i<100;i++){try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];break;}catch{await sleep(100);}}
 if(!port)throw Error('Chrome startup timeout');
 const target=await(await fetch(`http://127.0.0.1:${port}/json/new?${url}`,{method:'PUT'})).json();
 const ws=new WebSocket(target.webSocketDebuggerUrl);entry.ws=ws;await new Promise(r=>ws.addEventListener('open',r,{once:true}));
 let id=0;const pending=new Map();ws.addEventListener('message',e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));setTimeout(()=>{if(pending.delete(n))reject(Error('CDP timeout'));},15000).unref();});
 const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 await send('Runtime.enable');
 const wait=async expression=>{for(let i=0;i<150;i++){if(await ev(expression))return;await sleep(200);}throw Error('Browser condition timeout: '+expression+' '+await ev('document.querySelector("[role=alert]")?.textContent'));};
 const button=label=>ev(`(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent.includes(${JSON.stringify(label)}));if(!e)throw Error('button missing');e.click();return true;})()`);
 const key=(code,type)=>send('Input.dispatchKeyEvent',{type,code,key:code==='Space'?' ':code.slice(3).toLowerCase(),windowsVirtualKeyCode:code==='Space'?32:code.charCodeAt(3)});
 const view=(yaw,pitch=0)=>ev(`(()=>{const e=new MouseEvent('mousemove');Object.defineProperties(e,{movementX:{value:${yaw/.002}},movementY:{value:${pitch/.002}}});window.dispatchEvent(e);return true;})()`);
 const mouse=(type,button)=>send('Input.dispatchMouseEvent',{type,x:640,y:450,button,buttons:type==='mousePressed'?(button==='left'?1:2):0,clickCount:1});
 await wait('!!document.querySelector("button.play:not(:disabled)")');
 return {...entry,send,ev,wait,button,key,view,mouse};
}
const probeInstall=`(()=>{
 window.__ctbSession=()=>{const c=document.querySelector('canvas'),key=Object.keys(c).find(k=>k.startsWith('__reactFiber'));let f=c[key];for(;f;f=f.return){for(let h=f.memoizedState;h&&typeof h==='object';h=h.next){const s=h.memoizedState;if(s?.prediction&&s?.room&&s?.frames)return s;}}return null;};
 window.__ctbFrames=[];window.__ctbMotion=[];const epoch=(window.__ctbProbeEpoch??0)+1;window.__ctbProbeEpoch=epoch;let previous=performance.now(),lastPoint;function frame(now){if(window.__ctbProbeEpoch!==epoch)return;if(window.__ctbFrames.length<3000)window.__ctbFrames.push(now-previous);previous=now;const p=window.__ctbSession()?.prediction;if(p){const offset=p.presentationOffset?.(now)??p.offset,point={x:p.position.x+offset.x,y:p.position.y+offset.y,z:p.position.z+offset.z},input=p.pending.at(-1)?.input;if(lastPoint&&input&&(input.x||input.z)&&window.__ctbMotion.length<3000)window.__ctbMotion.push(Math.hypot(point.x-lastPoint.x,point.z-lastPoint.z));lastPoint=point;}requestAnimationFrame(frame);}requestAnimationFrame(frame);return true;
})()`;
async function phase(a,name,action){
 await a.ev('window.__ctbFrames.length=0;window.__ctbMotion.length=0;window.__ctbStart=structuredClone(window.__ctbSession()?.exportDiagnostics());true');
 if(action)await action();else await sleep(seconds*1000);
 const result=await a.ev(`(()=>{const s=window.__ctbSession(),v=window.__ctbFrames.slice().sort((a,b)=>a-b),q=p=>v[Math.min(v.length-1,Math.floor((v.length-1)*p))]??null;
 const t=s?.trace??[],start=window.__ctbStart?.trace?.at(-1)?.clientMs??0,recent=t.filter(e=>e.clientMs>=start),last=recent.at(-1),g=recent.filter(e=>e.kind==='snapshot').map((e,i,a)=>i?e.clientMs-a[i-1].clientMs:0).slice(1).sort((a,b)=>a-b);
 const gl=document.querySelector('canvas').getContext('webgl2'),ext=gl?.getExtension('WEBGL_debug_renderer_info');
 const motion=window.__ctbMotion;return {motionSamples:motion.length,zeroMotionFraction:motion.length?motion.filter(d=>d<.00001).length/motion.length:null,maxMotionStep:motion.length?Math.max(...motion):null,separation:s?.latest?.players.length===2?Math.hypot(s.latest.players[0].position.x-s.latest.players[1].position.x,s.latest.players[0].position.z-s.latest.players[1].position.z):null,attempts:s?.latest?.attempts,ownerId:s?.latest?.ownerId,selfId:s?.room.sessionId,frames:v.length,frameP50:q(.5),frameP95:q(.95),snapshotP50:g[Math.floor(g.length*.5)]??null,snapshotP95:g[Math.floor(g.length*.95)]??null,corrections:(last?.corrections??0)-(window.__ctbStart?.trace?.at(-1)?.corrections??0),lastCorrection:last?.correction,serverTiming:last?.serverTiming,cancelCounts:s?.cancelCounts,metrics:s?.metrics?.(),renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,position:s?.prediction.position,trace:recent};})()`);
 fs.writeFileSync(path.join(dir,name+'.json'),JSON.stringify({url,...result},null,2));const {trace,...summary}=result;console.log(JSON.stringify({scenario:name,...summary}));return {scenario:name,...result};
}
(async()=>{const results=[];
 try{
  if(process.env.CTB_LOCAL_EXPORT==='1'){
   const http=require('http'),root=path.resolve('out'),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wav':'audio/wav','.mp3':'audio/mpeg','.woff2':'font/woff2'};
   localServer=http.createServer((req,res)=>{try{let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403);return res.end();}if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);}catch{res.writeHead(404);res.end();}});
   await new Promise(r=>localServer.listen(0,'127.0.0.1',r));url=`http://127.0.0.1:${localServer.address().port}/?diagnostics=1`;
  }
  const a=await browser();await a.button('방 만들기');await a.wait('!!document.querySelector(".online-connect code")&&!!document.querySelector("button.play:not(:disabled)")');const room=await a.ev('document.querySelector(".online-connect code").textContent');
  await a.ev(probeInstall);await a.button('코트에서 플레이');await a.wait('!!document.pointerLockElement');await a.wait('!!window.__ctbSession()');await sleep(1500);
  if(process.env.CTB_DIAGNOSTIC_SMOKE==='1'){
   await a.send('Input.dispatchKeyEvent',{type:'keyDown',code:'F3',key:'F3',windowsVirtualKeyCode:114});await a.send('Input.dispatchKeyEvent',{type:'keyUp',code:'F3',key:'F3',windowsVirtualKeyCode:114});
   await a.wait('!!document.querySelector(".performance-debug")');await a.view(.2,.1);await sleep(1200);
   console.log('PRODUCTION_DIAGNOSTIC_SMOKE',JSON.stringify(await a.ev('(()=>{const d=window.checkTheBallNetwork();return {panel:!!document.querySelector(".performance-debug"),render:d.render,network:d.metrics};})()')));return;
  }
  results.push(await phase(a,'stationary-look',async()=>{for(let i=0;i<seconds*10;i++){await a.view(i%2?.03:-.03);await sleep(100);}}));
  results.push(await phase(a,'solo-move',async()=>{await a.key('KeyW','keyDown');await sleep(seconds*500);await a.key('KeyW','keyUp');await a.key('KeyS','keyDown');await sleep(seconds*500);await a.key('KeyS','keyUp');}));
  const b=await browser();await b.ev(`document.querySelector('input[aria-label="Room ID"]').focus();true`);await b.send('Input.insertText',{text:room});await b.button('Room ID로 참가');await b.wait('!!document.querySelector(".online-connect code")&&!!document.querySelector("button.play:not(:disabled)")');await b.button('코트에서 플레이');await b.wait('!!document.pointerLockElement');
  results.push(await phase(a,'two-separated',async()=>{await a.key('KeyS','keyDown');await b.key('KeyW','keyDown');await sleep(seconds*1000);await a.key('KeyS','keyUp');await b.key('KeyW','keyUp');}));
  async function fresh(){for(const p of [a,b]){await p.ev('document.exitPointerLock();true');await p.wait('!document.pointerLockElement&&!!document.querySelector(".online-connect button")');await p.button('온라인 나가기');await p.wait('!document.querySelector(".online-connect code")&&!!document.querySelector("button.play:not(:disabled)")');}
   await a.button('방 만들기');await a.wait('!!document.querySelector(".online-connect code")&&!!document.querySelector("button.play:not(:disabled)")');const id=await a.ev('document.querySelector(".online-connect code").textContent');
   await b.ev(`(()=>{const e=document.querySelector('input[aria-label="Room ID"]');e.focus();e.select();return true;})()`);await b.send('Input.insertText',{text:id});await b.button('Room ID로 참가');await b.wait('!!document.querySelector(".online-connect code")&&!!document.querySelector("button.play:not(:disabled)")');
   for(const p of [a,b]){await p.button('코트에서 플레이');await p.wait('!!document.pointerLockElement');}await a.ev(probeInstall);await sleep(800);
  }
  await fresh();await a.view(Math.PI/2);await b.view(-Math.PI/2);
  results.push(await phase(a,'body-contact',async()=>{await a.key('KeyW','keyDown');await sleep(seconds*1000);await a.key('KeyW','keyUp');}));
  await fresh();await a.view(Math.atan2(1,7.2));
  results.push(await phase(a,'shot',async()=>{await a.mouse('mousePressed','left');await sleep(700);await a.mouse('mouseReleased','left');await sleep(seconds*1000);}));
  await fresh();await a.view(Math.PI/2,.1);await b.view(-Math.PI/2);
  results.push(await phase(a,'pass',async()=>{await a.mouse('mousePressed','right');await sleep(180);await a.mouse('mouseReleased','right');await sleep(seconds*1000);}));
  console.log('REPORT',dir);fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify({url,headless:true,seconds,results},null,2));
 }finally{for(const b of browsers){b.ws?.close();if(global.process.platform==='win32')require('child_process').spawnSync('taskkill',['/PID',String(b.process.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else b.process.kill();}localServer?.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
