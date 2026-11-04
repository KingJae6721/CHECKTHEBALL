import {spawn} from 'node:child_process';
const children=[spawn(process.execPath,['node_modules/next/dist/bin/next','dev','apps/web','--webpack','--hostname','0.0.0.0','--port',process.env.PORT??'3000'],{stdio:'inherit'}),spawn(process.execPath,['node_modules/tsx/dist/cli.mjs','watch','apps/game-server/src/index.ts'],{stdio:'inherit'})];
let stopping=false;
async function stop(code=0){if(stopping)return;stopping=true;await Promise.all(children.map(child=>{
 if(!child.pid)return;
 if(process.platform==='win32')return new Promise(resolve=>{const killer=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.on('exit',resolve);killer.on('error',resolve);});
 child.kill('SIGTERM');
}));process.exit(code);}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>void stop());
for(const child of children)child.on('exit',code=>{void stop(code??0);});
