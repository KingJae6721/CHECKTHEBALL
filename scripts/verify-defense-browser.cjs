// Optional local Chrome/CDP smoke test. Run after npm run dev:next.
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert/strict'),{spawn}=require('child_process');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ctb-defense-browser-')),port=9257;
 const chrome=spawn(process.env.CTB_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-first-run','--disable-extensions','--remote-debugging-port='+port,'--user-data-dir='+path.join(dir,'profile'),'--window-size=1440,1000','about:blank'],{windowsHide:true,stdio:'ignore'});
 let ws,id=0;const pending=new Map(),errors=[],sleep=ms=>new Promise(r=>setTimeout(r,ms));
 try{
  let target;for(let n=0;n<100;n++){try{target=await(await fetch(`http://127.0.0.1:${port}/json/new?http://localhost:3000/`,{method:'PUT'})).json();break;}catch{await sleep(100);}}
  assert.ok(target);ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
  ws.addEventListener('message',e=>{const d=JSON.parse(e.data);if(d.id){const p=pending.get(d.id);pending.delete(d.id);d.error?p?.reject(Error(JSON.stringify(d.error))):p?.resolve(d.result);}else if(d.method==='Runtime.exceptionThrown')errors.push(d.params.exceptionDetails.exception?.description||d.params.exceptionDetails.text);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));setTimeout(()=>{if(pending.has(n)){pending.delete(n);reject(Error('CDP timeout '+method));}},20000).unref();});
  const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  await send('Runtime.enable');await send('Page.enable');
  const status=()=>ev(`({debug:document.querySelector('.acquisition-debug')?.textContent||'',hud:document.querySelector('.possession')?.textContent,feedback:document.querySelector('.feedback')?.textContent,result:document.querySelector('.defense-status')?.textContent,mode:document.querySelector('.mode')?.textContent,locked:!!document.pointerLockElement})`);
  for(let n=0;n<300;n++){if(await ev(`!!document.querySelector('button.play:not(:disabled)')`))break;await sleep(100);}
  const key=(code,type)=>send('Input.dispatchKeyEvent',{type,code,key:code==='F3'?'F3':code==='Escape'?'Escape':code.slice(3).toLowerCase(),windowsVirtualKeyCode:code==='F3'?114:code==='Escape'?27:code.charCodeAt(3)});
  const mouse=(type,button)=>send('Input.dispatchMouseEvent',{type,x:710,y:453,button,buttons:type==='mousePressed'?(button==='left'?1:2):0,clickCount:1});
  const select=async mode=>{await ev(`document.exitPointerLock();true`);for(let n=0;n<80;n++){if(await ev(`!!document.querySelector('select')`))break;await sleep(30);}await ev(`(()=>{const s=document.querySelector('select');s.value='${mode}';s.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);await sleep(150);assert.ok((await status()).mode.includes({PASS:'패스',STEAL:'스틸',BLOCK:'블록',ATTACK:'공격'}[mode]));};
  const play=async()=>{await ev(`document.querySelector('button.play').click();true`);await sleep(80);assert.equal((await status()).locked,true);};
  const screen=async name=>{const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(dir,name+'.png'),Buffer.from(r.data,'base64'));};
  await key('F3','keyDown');await key('F3','keyUp');
  await select('ATTACK');await play();await screen('attack-defender');assert.ok((await status()).hud.includes('PLAYER'));console.log('ATTACK_MODE',await status());
  await select('STEAL');await play();
  const position=async()=>{const s=await status(),m=s.debug.match(/PLAYER ([\d.-]+), ([\d.-]+)/);assert.ok(m,s.debug);return {x:+m[1],z:+m[2]};};
  await ev(`new Promise(resolve=>{window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW'}));const tick=()=>{const m=document.querySelector('.acquisition-debug')?.textContent.match(/PLAYER ([\\d.-]+), ([\\d.-]+)/);if(m&&+m[2]>=.28){window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW'}));resolve(true);}else requestAnimationFrame(tick);};requestAnimationFrame(tick);})`);
  await ev(`(()=>{const text=document.querySelector('.acquisition-debug').textContent,p=text.match(/PLAYER ([\\d.-]+), ([\\d.-]+)/),b=text.match(/BALL ([\\d.-]+), ([\\d.-]+), ([\\d.-]+)/),yaw=Math.atan2(+b[1]-p[1],+b[3]-p[2]);const e=new MouseEvent('mousemove',{bubbles:true});Object.defineProperty(e,'movementX',{value:yaw/.002});Object.defineProperty(e,'movementY',{value:0});window.dispatchEvent(e);return true})()`);
  let stolen=false;for(let n=0;n<8;n++){await mouse('mousePressed','left');for(let j=0;j<100;j++){const s=await status();if(s.hud.includes('PLAYER')){stolen=true;break;}if(s.result?.includes('MISS')&&!s.result.includes('준비'))break;await sleep(20);}await mouse('mouseReleased','left');if(stolen)break;for(let j=0;j<100;j++){if(!(await status()).result?.includes('준비'))break;await sleep(30);}}
  assert.ok(stolen,JSON.stringify(await status()));await screen('steal-success');console.log('STEAL_MODE',await status());
  await select('BLOCK');await play();
  let blocked=false;for(let attempt=0;attempt<5&&!blocked;attempt++){
   if(attempt){await key('KeyR','keyDown');await key('KeyR','keyUp');}
   for(let n=0;n<300;n++){const s=await status();const match=s.result?.match(/슛 예고 ([\d.]+)/);if(match&&+match[1]<=.3+attempt*.05)break;await sleep(10);}
   await mouse('mousePressed','right');await sleep(550);await mouse('mouseReleased','right');const s=await status();blocked=s.result?.includes('BLOCK SUCCESS');console.log('BLOCK_ATTEMPT',attempt,s);}
  assert.ok(blocked,'at least one repeatable dummy shot can be blocked');await screen('block-success');
  await select('PASS');await play();assert.ok((await status()).hud.includes('PLAYER'));console.log('PASS_RESET',await status());
  assert.deepEqual(errors,[]);console.log('PASS: 4 scenarios, steal, block, mode reset, no runtime exceptions. Screenshots:',dir);await send('Browser.close');
 }finally{ws?.close();chrome.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
