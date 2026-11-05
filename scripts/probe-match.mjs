// Local production UI smoke. Uses fresh rooms and its own Chrome processes only.
// Goal setup and a near-target score are injected into this LOCAL test room.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';import {spawn} from 'node:child_process';import assert from 'node:assert/strict';
import {makeServer} from '../apps/game-server/src/server.ts';import {matchMaker} from '@colyseus/core';import {COURT} from '../packages/game-core/src/court.ts';
const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ctb-match-')),browsers=[],sleep=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async(fn,label)=>{for(let i=0;i<200;i++){if(await fn())return;await sleep(50);}throw Error('Timeout: '+label);};
let web;const server=makeServer();
async function browser(url){
 const profile=path.join(temp,'chrome-'+browsers.length),process=spawn(globalThis.process.env.CTB_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--disable-extensions','--disable-background-timer-throttling','--disable-renderer-backgrounding','--remote-debugging-port=0','--user-data-dir='+profile,'--window-size=1280,900','about:blank'],{windowsHide:true,stdio:'ignore'});
 const entry={process,errors:[]};browsers.push(entry);let port;
 await wait(()=>{try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];return !!port;}catch{return false;}},'Chrome');
 const target=await(await fetch(`http://127.0.0.1:${port}/json/new?${url}`,{method:'PUT'})).json();const ws=new WebSocket(target.webSocketDebuggerUrl);entry.ws=ws;await new Promise(r=>ws.addEventListener('open',r,{once:true}));
 let id=0;const pending=new Map();ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')entry.errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));setTimeout(()=>{if(pending.delete(n))reject(Error('CDP timeout'));},15000).unref();});
 const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 const button=label=>ev(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b||b.disabled)throw Error('button unavailable: '+${JSON.stringify(label)});b.click();return true;})()`);
 await send('Runtime.enable');await wait(()=>ev('!!document.querySelector("button.play:not(:disabled)")'),'initial UI');
 return {...entry,send,ev,button};
}
try{
 await server.listen(0,'127.0.0.1');const gamePort=server.transport.server.address().port;
 const buildLog=path.join(temp,'build.txt'),fd=fs.openSync(buildLog,'w');
 const npm=path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
 console.log('Building local production web/server against test WebSocket');
 const child=spawn(process.execPath,[npm,'run','build'],{cwd:root,env:{...process.env,NEXT_PUBLIC_GAME_SERVER_URL:`ws://127.0.0.1:${gamePort}`},windowsHide:true,stdio:['ignore',fd,fd]});
 const exit=await new Promise(r=>child.on('exit',r));fs.closeSync(fd);if(exit!==0)throw Error(fs.readFileSync(buildLog,'utf8'));console.log('Production build passed');
 const output=path.join(root,'out'),mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.wav':'audio/wav','.mp3':'audio/mpeg','.woff2':'font/woff2'};
 web=http.createServer((req,res)=>{try{let p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(p.endsWith('/'))p+='index.html';if(!path.extname(p))p+='.html';const file=path.resolve(output,'.'+p);if(!file.startsWith(output+path.sep))throw Error('path');res.setHeader('Content-Type',mime[path.extname(file).toLowerCase()]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end();}});await new Promise(r=>web.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${web.address().port}`;
 const a=await browser(url);await a.button('방 만들기');await wait(()=>a.ev('!!document.querySelector(".match-card code")'),'room code');const code=await a.ev('document.querySelector(".match-card code").textContent');
 const b=await browser(url);await b.ev(`(()=>{const el=document.querySelector('input[aria-label="Room ID"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(code)});el.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);await b.button('Room ID로 참가');
 const room=matchMaker.getLocalRoomById(code),w=room.world;await wait(()=>b.ev('!!document.querySelector(".match-card")'),'second join');await a.button('준비');await b.button('준비');await wait(()=>w.match.stage==='PLAYING','countdown');
 const first=w.match.firstAttacker,aId=await a.ev('document.querySelector(".score-side.self").dataset.playerId'),owner=first===aId?a:b;
 async function basket(client){await wait(()=>client.ev(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='경기 입장 / 계속하기'&&!b.disabled)`),'enter');await client.button('경기 입장 / 계속하기');await wait(()=>client.ev('!!document.pointerLockElement'),'pointer lock');await sleep(150);await client.send('Input.dispatchMouseEvent',{type:'mousePressed',x:640,y:450,button:'left',buttons:1,clickCount:1});await sleep(700);await client.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:640,y:450,button:'left',buttons:0,clickCount:1});await wait(()=>!w.ownerId&&w.state.flightKind==='shot','real shot release');w.state.ball={...COURT.rim,y:COURT.rim.y+.05};w.state.ballVelocity={x:0,y:-4,z:0};}
 await basket(owner);await wait(()=>w.match.setupEnd!==null,'score and next attack');assert.equal(w.match.scores[first],3);const second=w.ownerId;assert.notEqual(second,first);
 await wait(()=>w.match.setupEnd===null,'attack pause');w.match.scores[second]=8;await basket(second===aId?a:b);await wait(()=>w.match.stage==='FINISHED','finish');
 await wait(()=>a.ev('!!document.querySelector(".match-results")'),'result A');await wait(()=>b.ev('!!document.querySelector(".match-results")'),'result B');assert.equal(w.match.scores[second],11);
 const scoreA=await a.ev('[...document.querySelectorAll(".match-results strong")].map(e=>Number(e.textContent))'),scoreB=await b.ev('[...document.querySelectorAll(".match-results strong")].map(e=>Number(e.textContent))');assert.deepEqual(scoreA,[...scoreB].reverse());
 await a.button('재경기 동의');await sleep(120);assert.equal(w.match.stage,'FINISHED');await b.button('재경기 동의');await wait(()=>w.match.id===2&&w.match.stage==='COUNTDOWN','rematch');assert.equal(w.match.firstAttacker,second);await wait(()=>w.match.stage==='PLAYING','rematch start');
 await b.button('나가기 · 혼자 연습');await wait(()=>a.ev('document.querySelector(".match-card h2")?.textContent==="경기 중단"'),'abort UI');await a.button('나가기 · 혼자 연습');await wait(()=>a.ev('!!document.querySelector("button.play")&&!document.querySelector(".match-card")'),'offline return');
 assert.deepEqual(a.errors,[]);assert.deepEqual(b.errors,[]);console.log(JSON.stringify({productionBuild:true,twoBrowsers:true,readyCountdown:true,actualMouseShot:true,injectedGoalAndNearTargetScore:true,attackChange:true,resultBothScreens:true,rematchBothAgree:true,openerAlternated:true,departureAbort:true,offlineReturn:true,browserExceptions:0,buildLog}));
}finally{
 for(const b of browsers){b.ws?.close();if(b.process.pid)await new Promise(r=>{const p=spawn('taskkill',['/PID',String(b.process.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});p.on('exit',r);});}
 if(web)await new Promise(r=>web.close(r));await server.gracefullyShutdown(false);
}
