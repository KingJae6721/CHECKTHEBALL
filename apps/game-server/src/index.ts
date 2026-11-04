import {makeServer} from './server';
const port=Number(process.env.GAME_SERVER_PORT??2567),host=process.env.GAME_SERVER_HOST??'127.0.0.1';
const server=makeServer();
try{await server.listen(port,host);}catch(error){
 if((error as NodeJS.ErrnoException).code==='EADDRINUSE')console.error(`CheckTheBall: ${host}:${port} 포트를 기존 프로세스가 사용 중입니다. 기존 게임 서버를 종료하세요. 웹 서버 재시작만으로는 해결되지 않습니다.`);
 else console.error(error);
 process.exit(1);
}
console.log(`CheckTheBall server: ${host}:${port}`);
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{void server.gracefullyShutdown(false).then(()=>process.exit(0));});
