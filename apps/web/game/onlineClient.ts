import {matchPlayable,type MatchIntent,type RoomMode} from '../../../packages/game-core/src/match';
import {Samples} from '../../../packages/protocol/src/diagnostics';
import {MovementPrediction} from './movementPrediction';
import {RoomChatClient} from './roomChatClient';
import {Client,type Room} from '@colyseus/sdk';
import {NETWORK,type Action} from '../../../packages/protocol/src/index';
import type {WorldSnapshot,ActorSnapshot} from '../../../packages/protocol/src/index';
import {createState,type Input,type State} from '../../../packages/game-core/src/simulation';
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const angle=(a:number,b:number,t:number)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
const vector=(a:{x:number;y:number;z:number},b:typeof a,t:number)=>({x:mix(a.x,b.x,t),y:mix(a.y,b.y,t),z:mix(a.z,b.z,t)});
// Self: fixed-step prediction + authority replay. Remotes/ball: delayed snapshots.
export class OnlineSession{
 readonly chat:RoomChatClient;
 frames:WorldSnapshot[]=[];seq=0;connected=true;status='접속 완료';
 readonly prediction=new MovementPrediction();moveSequence=0;droppedSnapshots=0;
 private lastPump=0;private accumulator=0;private pendingJump=false;private barrier=0;private phaseOverride:{slow:boolean;seq:number}|undefined;
 private clockOffset:number|undefined;private renderTime=-Infinity;private renderBase=-1;private renderFrame:WorldSnapshot|undefined;
 private closed=false;
 private snapshotGaps=new Samples(200);private rtts=new Samples(32);private jitter=new Samples(32);private lastReceiveAt=0;private lastRtt:number|undefined;
 private pingSequence=0;private nextPingAt=0;private lastPongAt=0;private pings=new Map<number,number>();private removePong:(()=>void)|undefined;
 private underflow=false;underflowCount=0;underflowFrames=0;bufferAheadMs=0;pingTimeouts=0;
 private pong=(value:{id:number})=>{if(!value||!Number.isSafeInteger(value.id))return;const sent=this.pings.get(value.id);if(sent===undefined)return;this.pings.delete(value.id);this.lastPongAt=performance.now();const rtt=this.lastPongAt-sent;this.rtts.add(rtt);if(this.lastRtt!==undefined)this.jitter.add(Math.abs(rtt-this.lastRtt));this.lastRtt=rtt;this.record('pong',{rtt});};
 private ping(now:number){if(!this.latest?.serverTiming?.supportsPing||typeof document!=='undefined'&&document.hidden)return;
  for(const [id,sent] of this.pings)if(now-sent>5000){this.pings.delete(id);this.pingTimeouts++;}
  if(now<this.nextPingAt||this.pings.size>=2)return;const id=++this.pingSequence;this.nextPingAt=now+1000;this.pings.set(id,now);this.room.send('diagnosticPing',{id});
 }
 pingDisplay(){
  if(!this.connected)return {ms:null,label:'연결 끊김'};
  if(!this.latest?.serverTiming?.supportsPing)return {ms:null,label:'핑 측정을 지원하는 게임 서버 업데이트 필요'};
  if(this.lastRtt===undefined)return {ms:null,label:'핑 측정 중'};
  if(performance.now()-this.lastPongAt>5000)return {ms:null,label:'핑 응답 지연'};
  return {ms:Math.round(this.lastRtt),label:'게임 서버 왕복 지연'};
 }
 metrics(){return {rttMs:this.rtts.summary(),rttVariationMs:this.jitter.summary(),pingSupported:!!this.latest?.serverTiming?.supportsPing,pingTimeouts:this.pingTimeouts,snapshotGapMs:this.snapshotGaps.summary(),interpolationUnderflows:this.underflowCount,underflowFrames:this.underflowFrames,bufferAheadMs:this.bufferAheadMs,corrections:this.prediction.corrections,lastCorrectionM:this.prediction.lastCorrection,totalCorrectionM:this.prediction.totalCorrection,maxCorrectionM:this.prediction.maxCorrection,serverTiming:this.latest?.serverTiming};}
 generated=0;cancelCounts:Record<string,number>={};trace:Record<string,unknown>[]=[];
 private frameMs=0;private renderMs=0;private lastAck=0;private rateAt=0;private rateGenerated=0;private rateConsumed=0;private rateReceived=0;private rates={generatedPerSecond:0,receivedPerSecond:0,consumedPerSecond:0};
 private record(kind:string,extra:Record<string,unknown>={}){
  const now=performance.now(),a=this.latest?.players.find(p=>p.id===this.room.sessionId);
  this.trace.push({at:Date.now(),clientMs:now,kind,tick:this.latest?.tick,ack:a?.processedMoveSeq,ackAdvance:(a?.processedMoveSeq??0)-this.lastAck,pending:this.prediction.pending.length,oldestPendingMs:this.prediction.pending.length?now-(this.prediction.pending[0].sentAt??now):0,rttMs:this.lastRtt,bufferAheadMs:this.bufferAheadMs,underflows:this.underflowCount,generated:this.generated,rates:{...this.rates},frameMs:this.frameMs,renderMs:this.renderMs,correction:this.prediction.replayError,corrections:this.prediction.corrections,server:a?.net,serverTiming:this.latest?.serverTiming,...extra});
  this.lastAck=a?.processedMoveSeq??this.lastAck;if(this.trace.length>600)this.trace.shift();
 }
 recordFrame(frameMs:number,renderMs:number){this.frameMs=frameMs;this.renderMs=renderMs;if(frameMs>=50)this.record('longFrame');}
 exportDiagnostics(){return {exportedAt:new Date().toISOString(),metrics:this.metrics(),cancelCounts:{...this.cancelCounts},trace:this.trace};}
 constructor(readonly room:Room){
  this.chat=new RoomChatClient(room);
  if(typeof room.onMessage==='function')this.removePong=room.onMessage('diagnosticPong',this.pong);room.reconnection.enabled=false;room.onDrop(this.drop);room.onLeave(this.drop);room.onError(this.error);
  room.onStateChange(this.receive);if(room.state?.frame)this.receive(room.state);
 }
 private drop=()=>{this.connected=false;this.chat.setConnected(false);if(!this.status.startsWith('통신 규약'))this.status='연결 끊김 · 새 참가로 다시 접속하세요';this.prediction.pending.length=0;this.prediction.clearOffset();};
 private error=(_code:number,message?:string)=>{this.status=message??'연결 오류';};
 get latest(){return this.frames.at(-1);}
 get self(){return this.prediction.actor;}
 get canPlay(){return matchPlayable(this.latest?.match);}
 get matchRemainingMs(){const m=this.latest?.match,end=m?.countdownEnd??m?.setupEnd;return end==null?0:Math.max(0,end-(performance.now()+(this.clockOffset??0)));}
 matchIntent(intent:MatchIntent['intent']){const m=this.latest?.match;if(m&&this.connected&&!this.closed)this.room.send('matchIntent',{matchId:m.id,intent});}
 get ownsBall(){return this.latest?.ownerId===this.room.sessionId;}
 receive=(state:{frame:string})=>{
  if(!state.frame||this.closed)return;const frame=JSON.parse(state.frame) as WorldSnapshot,last=this.latest;
  if(frame.protocolVersion!==NETWORK.protocolVersion){this.connected=false;this.chat.setConnected(false);this.status=`통신 규약 불일치: 웹 v${NETWORK.protocolVersion} / 서버 ${frame.protocolVersion===undefined?'버전 없음(이전 서버)':'v'+frame.protocolVersion}. 같은 포트의 이전 게임 서버 또는 오래된 dist 실행 여부를 확인하세요.`;if(this.room.connection?.isOpen)void this.room.leave();return;}
  if(last&&(frame.tick<=last.tick||frame.time<=last.time)){this.droppedSnapshots++;return;}
  const boundary=!!frame.match&&(!last?.match||frame.match.epoch!==last.match.epoch);
  if(boundary){this.frames.length=0;this.renderTime=-Infinity;this.renderBase=-1;this.renderFrame=undefined;this.pendingJump=false;this.phaseOverride=undefined;this.barrier=0;this.lastPump=0;this.accumulator=0;}
  const now=performance.now(),offset=frame.time-now;if(this.lastReceiveAt)this.snapshotGaps.add(now-this.lastReceiveAt);this.lastReceiveAt=now;
  this.clockOffset=this.clockOffset===undefined||Math.abs(offset-this.clockOffset)>NETWORK.maxPredictionGapMs?offset:this.clockOffset+Math.max(-2,Math.min(2,offset-this.clockOffset))*.1;
  this.frames.push(frame);if(this.frames.length>40)this.frames.shift();
  const self=frame.players.find(a=>a.id===this.room.sessionId);if(!self)return;
  this.moveSequence=Math.max(this.moveSequence,self.processedMoveSeq);
  const waiting=this.barrier>0,finished=waiting&&self.processedActionSeq>=this.barrier;
  if(finished){this.barrier=0;this.lastPump=0;this.accumulator=0;}
  if(this.phaseOverride&&self.processedActionSeq>=this.phaseOverride.seq)this.phaseOverride=undefined;
  this.prediction.accept(self,frame.players.find(a=>a.id!==self.id),boundary||waiting||!this.prediction.actor);const span=now-this.rateAt;if(!this.rateAt||span>=1000){if(this.rateAt)this.rates={generatedPerSecond:(this.generated-this.rateGenerated)*1000/span,receivedPerSecond:(self.net.received-this.rateReceived)*1000/span,consumedPerSecond:(self.net.consumed-this.rateConsumed)*1000/span};this.rateAt=now;this.rateGenerated=this.generated;this.rateConsumed=self.net.consumed;this.rateReceived=self.net.received;}this.record('snapshot');
 };
 private write(input:Input,actions:Action[],moveSeq?:number){
  const seq=++this.seq;this.room.send('input',{seq,...(this.latest?.match?{matchId:this.latest.match.id,epoch:this.latest.match.epoch}:{}),...(moveSeq===undefined?{}:{moveSeq}),x:input.x,z:input.z,sprint:input.sprint,yaw:Math.atan2(Math.sin(input.yaw),Math.cos(input.yaw)),pitch:input.pitch,actions});return seq;
 }
 send(input:Input,actions:Action[]=[],reason='EXPLICIT_CANCEL'){
  if(!this.connected||this.closed||!this.canPlay)return;
  const other=actions.filter(a=>a!=='jump');if(actions.includes('jump'))this.pendingJump=true;if(!other.length)return;
  const seq=this.write(input,other);
  if(this.ownsBall&&(other.includes('shotDown')||other.includes('passDown')))this.phaseOverride={slow:other.includes('shotDown'),seq};
  if(other.includes('cancel')||other.includes('movementSync')){const cancel=other.includes('cancel');this.cancelCounts[reason]=(this.cancelCounts[reason]??0)+1;this.record(cancel?'cancel':'movementSync',{reason,seq});this.barrier=seq;this.pendingJump=false;if(cancel)this.phaseOverride={slow:false,seq};this.prediction.pending.length=0;this.prediction.clearOffset();this.accumulator=0;this.lastPump=0;this.prediction.writer='client:cancel-barrier';}
 }
 advance(now:number,input:Input){
  if(!this.connected||!this.self||this.closed)return;this.ping(now);if(!this.canPlay){this.lastPump=0;this.accumulator=0;this.pendingJump=false;return;}
  if(!this.lastPump){this.lastPump=now;return;}const elapsed=now-this.lastPump;this.lastPump=now;
  if(this.barrier){this.accumulator=0;return;}
  const step=1000/NETWORK.tickRate;
  if(elapsed>NETWORK.maxPredictionGapMs||this.prediction.pending.length>=NETWORK.maxPendingInputs){this.send({...input,x:0,z:0,sprint:false},['movementSync'],elapsed>NETWORK.maxPredictionGapMs?'PUMP_GAP':'PENDING_LIMIT');this.prediction.writer='client:movement-resync';return;}
  this.accumulator+=elapsed;
  if(this.accumulator>step*(NETWORK.maxPredictionSteps+1)){this.send({...input,x:0,z:0,sprint:false},['movementSync'],'CATCH_UP_LIMIT');this.prediction.writer='client:movement-resync';return;}
  let steps=0;while(this.accumulator>=step&&steps++<NETWORK.maxPredictionSteps&&this.prediction.pending.length<NETWORK.maxPendingInputs){
   const jump=this.pendingJump;this.pendingJump=false;
   const moveSeq=++this.moveSequence,seq=this.write(input,jump?['jump']:[],moveSeq);
   const slow=this.ownsBall&&(this.phaseOverride?.slow??this.self.phase==='CHARGING');
   this.generated++;this.prediction.push({seq,moveSeq,sentAt:now,input:{...input},jump,phase:slow?'CHARGING':'HELD',phaseSeq:this.phaseOverride?.seq??-1});
   this.accumulator-=step;
  }
 }
 sample(now:number){
  const last=this.latest;if(!last)return;
  const desired=now+(this.clockOffset??last.time-now)-NETWORK.interpolationMs;
  const short=this.frames.length>1&&desired>=last.time;if(short){this.underflowFrames++;if(!this.underflow)this.underflowCount++;}this.underflow=short;
  const target=Math.min(last.time,desired);
  this.renderTime=Math.max(this.renderTime,target);this.bufferAheadMs=Math.max(0,last.time-this.renderTime);let a=this.frames[0],b=last;
  for(const f of this.frames){if(f.time<=this.renderTime)a=f;if(f.time>=this.renderTime){b=f;break;}}
  if(a===b||b.time===a.time)return b;
  const t=Math.max(0,Math.min(1,(this.renderTime-a.time)/(b.time-a.time)));
  // Clone only when the source snapshot changes, not every render frame.
  if(this.renderBase!==a.tick){this.renderFrame=structuredClone(a);this.renderBase=a.tick;}
  const out=this.renderFrame!;out.time=mix(a.time,b.time,t);out.tick=mix(a.tick,b.tick,t);
  for(const p of out.players){
   const source=a.players.find(x=>x.id===p.id)!,q=b.players.find(x=>x.id===p.id);if(!q||p.id===this.room.sessionId)continue;
   const teleported=q.lastPositionWriter.includes('safe-reset')&&q.recoveryCount!==source.recoveryCount;if(teleported){Object.assign(p.position,source.position);continue;}
   p.position.x=mix(source.position.x,q.position.x,t);p.position.y=mix(source.position.y,q.position.y,t);p.position.z=mix(source.position.z,q.position.z,t);
   if(source.screen.active===q.screen.active)p.screen.blend=mix(source.screen.blend,q.screen.blend,t);
   p.vy=mix(source.vy,q.vy,t);p.input.yaw=angle(source.input.yaw,q.input.yaw,t);p.input.pitch=mix(source.input.pitch,q.input.pitch,t);
   if(source.motion.action===q.motion.action){p.motion.elapsed=mix(source.motion.elapsed,q.motion.elapsed,t);p.motion.clock=mix(source.motion.clock,q.motion.clock,t);const d=((q.motion.phase-source.motion.phase+1.5)%1)-.5;p.motion.phase=(source.motion.phase+d*t+1)%1;p.motion.dribbleYaw=angle(source.motion.dribbleYaw,q.motion.dribbleYaw,t);if(p.motion.crossover&&source.motion.crossover&&q.motion.crossover&&source.motion.crossover.from===q.motion.crossover.from)p.motion.crossover.elapsed=mix(source.motion.crossover.elapsed,q.motion.crossover.elapsed,t);}
   if(source.defense.kind===q.defense.kind)p.defense.elapsed=mix(source.defense.elapsed,q.defense.elapsed,t);
   p.locomotion.phase=angle(source.locomotion.phase,q.locomotion.phase,t);p.locomotion.blend=mix(source.locomotion.blend,q.locomotion.blend,t);p.locomotion.run=mix(source.locomotion.run,q.locomotion.run,t);
  }
  Object.assign(out.ball,a.ball);
  if(a.revision===b.revision&&a.ownerId===b.ownerId&&a.flightKind===b.flightKind){out.ball.x=mix(a.ball.x,b.ball.x,t);out.ball.y=mix(a.ball.y,b.ball.y,t);out.ball.z=mix(a.ball.z,b.ball.z,t);}
  return out;
 }
 diagnostics(){
  const metrics=this.metrics(),fmt=(v:number|null|undefined)=>v===null||v===undefined?'-':v.toFixed(1);
  const p=this.prediction,a=p.actor,server=this.latest?.players.find(x=>x.id===this.room.sessionId);
  const point=(v:{x:number;y:number;z:number}|undefined)=>v?`${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`:'-';
  return `WS RTT p50 ${fmt(metrics.rttMs.p50)} p95 ${fmt(metrics.rttMs.p95)}ms / variation p95 ${fmt(metrics.rttVariationMs.p95)}ms (${metrics.pingSupported?'game WS':'server update required'})\nSNAP gap p50 ${fmt(metrics.snapshotGapMs.p50)} p95 ${fmt(metrics.snapshotGapMs.p95)}ms / buffer ${fmt(this.bufferAheadMs)}ms / underruns ${this.underflowCount}\nSERVER tick p95 ${fmt(metrics.serverTiming?.tickP95Ms)}ms / schedule p95 ${fmt(metrics.serverTiming?.scheduleP95Ms)}ms / debt ${fmt(metrics.serverTiming?.debtMs)}ms\nRATE generated ${this.rates.generatedPerSecond.toFixed(1)}/s received ${this.rates.receivedPerSecond.toFixed(1)}/s consumed ${this.rates.consumedPerSecond.toFixed(1)}/s\nCANCEL/SYNC ${JSON.stringify(this.cancelCounts)}\nSERVER queue ${server?.net.queueLength??0} age ${server?.net.oldestAgeMs.toFixed(0)??0}ms consumed ${server?.net.consumed??0} discarded ${server?.net.discarded??0} timeouts ${server?.net.timeouts??0}\nTICK CPU ${this.latest?.serverTiming?.tickMs.toFixed(2)??'-'}ms max ${this.latest?.serverTiming?.maxTickMs.toFixed(2)??'-'}ms\nNET tick ${this.latest?.tick??'-'} · processedInput ${a?.processedInputSeq??'-'} · processedMove ${a?.processedMoveSeq??'-'}\nPENDING ${p.pending.length} · receiveSeq ${a?.ack??'-'} · staleDrops ${this.droppedSnapshots}\nERROR server ${p.serverError.toFixed(3)}m · afterReplay ${p.replayError.toFixed(3)}m\nCORRECTIONS ${p.corrections} · last ${p.lastCorrection.toFixed(3)}m / sum ${p.totalCorrection.toFixed(3)}m / max ${p.maxCorrection.toFixed(3)}m · resets ${p.resets}\nPRED ${point(p.position)} / AUTH ${point(server?.position)}\nSERVER LOOK ${server?.input.yaw.toFixed(3)??'-'},${server?.input.pitch.toFixed(3)??'-'}\nVISUAL ${Math.hypot(p.offset.x,p.offset.y,p.offset.z).toFixed(3)}m\nWRITE ${p.writer}\nSERVER ${a?.lastPositionWriter??'-'} · overlapRecoveries ${a?.recoveryCount??0}`;
 }
 resetDiagnostics(){this.rtts.clear();this.jitter.clear();this.snapshotGaps.clear();this.underflowCount=0;this.underflowFrames=0;this.pingTimeouts=0;this.trace.length=0;this.prediction.corrections=0;this.prediction.totalCorrection=0;this.prediction.maxCorrection=0;this.prediction.lastCorrection=0;this.prediction.resets=0;this.droppedSnapshots=0;}
 close(){if(this.closed)return;this.closed=true;this.connected=false;this.chat.close();this.removePong?.();this.pings.clear();this.room.onStateChange.remove(this.receive);this.room.onDrop.remove(this.drop);this.room.onLeave.remove(this.drop);this.room.onError.remove(this.error);this.prediction.pending.length=0;if(this.room.connection?.isOpen)void this.room.leave().catch(()=>{});}
}
export async function connectOnline(roomId?:string,nickname?:string,mode:RoomMode='practice'){const address=process.env.NEXT_PUBLIC_GAME_SERVER_URL;if(!address)throw Error('NEXT_PUBLIC_GAME_SERVER_URL을 설정하고 웹 서버를 다시 시작하세요.');if(!/^wss?:\/\//.test(address))throw Error('게임 서버 주소는 ws:// 또는 wss://로 설정하세요.');
 const client=new Client(address);const room=roomId?await client.joinById(roomId.trim(),{nickname}):await client.create('basketball',{nickname,mode});return new OnlineSession(room);
}
export function actorView(frame:WorldSnapshot,actor:ActorSnapshot,s:State=createState()):State{
 s.networked=true;s.screen=actor.screen;s.player=actor.position;s.vy=actor.vy;s.playerMotion=actor.motion;s.defense=actor.defense;s.locomotion=actor.locomotion;s.owner=frame.ownerId===actor.id?'player':frame.ownerId?'dummy':'none';s.phase=s.owner==='player'?actor.phase:frame.flightKind?'IN_FLIGHT':'RESOLVING';s.charge=actor.charge;s.passCharge=actor.passCharge;s.ball=frame.ball;s.ballVelocity=frame.velocity;s.flightKind=frame.flightKind;s.score=frame.score;s.attempts=frame.attempts;s.made=frame.made;s.resolved=frame.resolved;s.shotId=frame.shotId;s.message=frame.message;s.tick=frame.tick;return s;
}
