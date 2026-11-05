import {createMatch,matchPlayable,validMatchIntent,MATCH,type MatchState,type RoomMode} from './match';
import {createScreen,toggleScreen,type ScreenState} from './screen';
import {emitGameEvent,impactEvent,type GameEvent} from './gameEvents';
import {integrateMovement,type MovingActor} from './movement';
import {BODY,MOVEMENT,PASS,PRACTICE,PHYSICS,DEFENSE,COURT} from './court';
import {moveBody,recoverBody,validBodyPosition,bodyShapes,type XZ} from './bodies';
import {createMotion,advanceControlledMotion,controlledPosition,updateUnownedMotion,cancelMotion,requestCrossover,type BallMotion} from './motion';
import {createDefense,startDefense,cancelDefense,advanceDefense,finishDefense,trySteal,tryBlock,type DefenseState} from './defense';
import {createLocomotion,advanceLocomotion,type Locomotion} from './locomotion';
import {createState,zeroInput,CFG,startCharge,startPassCharge,releaseShot,releasePass,cancelAllCharges,firePendingPlayer,giveBall,makeLoose,resolve,rimCrossing,type State,type Input,type Vec,type Phase} from './simulation';
import {advanceBall} from './physics';
import {evaluateAcquisition,outsideAcquisitionVolumes,passCatchPoint} from './acquisition';
import {NETWORK,validInput,type Action} from '../../protocol/src/index';
export type OnlineActor={screen:ScreenState;nickname?:string;processedInputSeq:number;processedMoveSeq:number;processedActionSeq:number;receivedMoveSeq:number;sequencedMovement:boolean;moves:{seq:number;moveSeq:number;input:Input;jump:boolean;at:number}[];net:{received:number;consumed:number;discarded:number;queueLength:number;oldestAgeMs:number;timeouts:number;lastCancel:string;lastCancelAt:number;lastReceiveAt:number};recoveryCount:number;lastPositionWriter:string;id:string;slot:number;position:Vec;vy:number;input:Input;motion:BallMotion;defense:DefenseState;locomotion:Locomotion;phase:Phase;charge:number;passCharge:number;ack:number;receivedAt:number;rateAt:number;rateCount:number;queue:{action:Action;input:Input;seq:number}[];buttons:Set<string>;score:number;attempts:number;made:number};
export type ActorSnapshot=Omit<OnlineActor,'queue'|'moves'|'buttons'|'rateAt'|'rateCount'|'receivedAt'>;
export type WorldSnapshot={mode:RoomMode;match:MatchState|null;events?:GameEvent[];serverTiming?:{tickMs:number;maxTickMs:number;callbackGapMs:number;discardedTimeMs:number;supportsPing?:boolean;tickP50Ms?:number|null;tickP95Ms?:number|null;scheduleDelayMs?:number;scheduleP95Ms?:number|null;debtMs?:number};protocolVersion:number;tick:number;time:number;revision:number;ownerId:string|null;shooterId:string|null;passerId:string|null;players:ActorSnapshot[];ball:Vec;velocity:Vec;flightKind:State['flightKind'];resolved:boolean;shotId:number;score:number;attempts:number;made:number;message:string};
export {movePair} from './bodies';
export class OnlineWorld{
 readonly state=createState();readonly actors=new Map<string,OnlineActor>();time=0;tick=0;revision=0;ownerId:string|null=null;shooterId:string|null=null;passerId:string|null=null;lastTouchId:string|null=null;everJoined=false;private airborne=new Set<string>();
 possession=0;chargeStartedAt=new Map<string,number>();chargeVersions=new Map<string,number>();pickupLockedUntil=0;ledger=new Map<string,{score:number;attempts:number;made:number}>();
 readonly match:MatchState|null;private pendingAttack:string|null=null;private scoringShot:{matchId:number;id:number;shooterId:string;points:number;eligible:boolean}|null=null;
 constructor(readonly mode:RoomMode='practice',private random:()=>number=Math.random){this.match=mode==='duel'?createMatch():null;this.state.networked=true;}
 canJoin(){return !this.match||this.match.stage==='WAITING';}
 private retireRejected(a:OnlineActor,v:{seq:number;moveSeq?:number}){
  if(v.seq<=a.ack)return;a.ack=v.seq;a.processedActionSeq=Math.max(a.processedActionSeq,v.seq);
  if(v.moveSeq!==undefined){a.receivedMoveSeq=Math.max(a.receivedMoveSeq,v.moveSeq);a.processedMoveSeq=Math.max(a.processedMoveSeq,v.moveSeq);a.processedInputSeq=v.seq;}
 }
 private clearGameplay(){
  this.chargeVersions.clear();this.chargeStartedAt.clear();this.pickupLockedUntil=0;
  for(const a of this.actors.values()){
   a.net.discarded+=a.moves.length;a.moves.length=0;a.queue.length=0;a.buttons.clear();
   a.processedMoveSeq=a.receivedMoveSeq;a.processedInputSeq=Math.max(a.processedInputSeq,a.ack);a.processedActionSeq=Math.max(a.processedActionSeq,a.ack);
   a.input=zeroInput();a.vy=0;a.charge=0;a.passCharge=0;a.phase='HELD';a.screen=createScreen();a.defense=createDefense();a.locomotion=createLocomotion();
   a.motion=createMotion(this.ownerId===a.id?'DRIBBLE':'IDLE');a.net.queueLength=0;a.net.oldestAgeMs=0;
  }
  this.state.charge=0;this.state.passCharge=0;this.state.ballVelocity={x:0,y:0,z:0};
 }
 private resetRound(attackerId:string){
  this.clearGameplay();const m=this.match!;m.attackId=attackerId;m.needsClear=false;
  for(const a of this.actors.values()){a.position={x:0,y:0,z:a.id===attackerId?-1.5:0};a.recoveryCount++;a.lastPositionWriter='server:match-safe-reset';}
  this.changeOwner(null);this.shooterId=null;this.passerId=null;this.scoringShot=null;this.airborne.clear();
  const a=this.actors.get(attackerId);if(a){const s=this.focus(a);giveBall(s,'player');s.releaseAge=1;s.resolved=true;s.ball=controlledPosition(s,a.input,'player');this.commit(a);}
 }
 private beginCountdown(first:string){
  const m=this.match!;m.firstAttacker=first;m.stage='COUNTDOWN';m.countdownEnd=this.time+MATCH.countdownMs;m.setupEnd=null;m.result=null;m.epoch++;
  this.pendingAttack=null;this.ledger.clear();this.state.events.recent.length=0;this.state.events.impactAt={};this.state.shotId++;
  this.state.score=0;this.state.made=0;this.state.attempts=0;
  for(const a of this.actors.values()){a.score=0;a.made=0;a.attempts=0;m.scores[a.id]=0;}
  this.resetRound(first);
 }
 intent(id:string,value:unknown){
  const m=this.match;if(!m||!this.actors.has(id)||!validMatchIntent(value)||value.matchId!==m.id)return false;
  if(value.intent==='rematch'){
   if(m.stage!=='FINISHED'||this.actors.size!==2)return false;m.rematch[id]=true;
   if([...this.actors.keys()].every(k=>m.rematch[k])){const next=[...this.actors.keys()].find(k=>k!==m.firstAttacker)!;const fresh=createMatch(m.id+1,m.epoch+1);Object.assign(m,fresh);for(const a of this.actors.values()){m.ready[a.id]=false;m.rematch[a.id]=false;}this.beginCountdown(next);}
   return true;
  }
  if(m.stage!=='WAITING'&&m.stage!=='COUNTDOWN')return false;
  m.ready[id]=value.intent==='ready';
  if(value.intent==='unready'&&m.stage==='COUNTDOWN'){m.stage='WAITING';m.countdownEnd=null;m.epoch++;this.clearGameplay();}
  if(m.stage==='WAITING'&&this.actors.size===2&&[...this.actors.keys()].every(k=>m.ready[k])){const ids=[...this.actors.keys()];this.beginCountdown(ids[this.random()<.5?0:1]);}
  return true;
 }
 private advanceMatch(){
  const m=this.match!;
  if(m.stage==='COUNTDOWN'&&this.time+1e-6>=m.countdownEnd!){m.stage='PLAYING';m.countdownEnd=null;m.epoch++;this.clearGameplay();}
  if(m.stage==='PLAYING'&&m.setupEnd!==null&&this.time+1e-6>=m.setupEnd){m.setupEnd=null;m.epoch++;this.clearGameplay();}
  return matchPlayable(m);
 }
 private prepareAttack(id:string){const m=this.match!;m.attackId=id;m.needsClear=false;m.setupEnd=this.time+MATCH.setupMs;m.epoch++;this.pendingAttack=id;}
 private result(winnerId:string|null,reason:'TARGET_SCORE'|'OPPONENT_LEFT'){
  const m=this.match!;if(m.result)return;
  m.result={winnerId,reason,players:[...this.actors.values()].map(a=>({id:a.id,nickname:a.nickname??(a.slot===0?'플레이어 1':'플레이어 2'),score:m.scores[a.id]??0}))};
  m.stage=reason==='TARGET_SCORE'?'FINISHED':'ABORTED';m.countdownEnd=null;m.setupEnd=null;m.rematch={};m.epoch++;
 }
 private matchLeave(id:string){
  const m=this.match;if(!m||!this.actors.has(id))return;
  if(m.stage==='PLAYING')this.result(null,'OPPONENT_LEFT');
  else if(m.stage==='COUNTDOWN'||m.stage==='WAITING'){m.stage='WAITING';m.countdownEnd=null;m.setupEnd=null;m.ready={};delete m.scores[id];m.epoch++;}
  m.rematch={};this.pendingAttack=null;this.clearGameplay();
 }
 focus(a:OnlineActor){const s=this.state;s.screen=a.screen;s.player=a.position;s.vy=a.vy;s.playerMotion=a.motion;s.defense=a.defense;s.locomotion=a.locomotion;s.charge=a.charge;s.passCharge=a.passCharge;
  s.owner=this.ownerId===a.id?'player':this.ownerId?'dummy':'none';s.phase=this.ownerId===a.id?a.phase:s.flightKind?'IN_FLIGHT':'RESOLVING';s.passFrom=this.passerId===a.id?'player':'dummy';s.dummyMotion=this.actors.get(this.ownerId??'')?.motion??createMotion();return s;
 }
 changeOwner(id:string|null){if(id!==null){this.lastTouchId=id;const m=this.match;if(m?.stage==='PLAYING'&&m.attackId!==id){m.attackId=id;m.needsClear=true;}}if(this.ownerId===id)return;const old=this.actors.get(this.ownerId??'');if(old){if(!(id===null&&old.motion.action==='RELEASE'&&old.motion.fired))cancelMotion(old.motion,this.state.ball,false);old.phase='HELD';old.charge=0;old.passCharge=0;this.chargeVersions.delete(old.id);this.chargeStartedAt.delete(old.id);}this.ownerId=id;this.possession++;this.revision++;}
 commit(a:OnlineActor){const s=this.state,target=s.owner==='player'?a.id:s.owner==='none'?null:this.ownerId;this.changeOwner(target);a.vy=s.vy;a.phase=this.ownerId===a.id?s.phase:'HELD';a.charge=this.ownerId===a.id?s.charge:0;a.passCharge=this.ownerId===a.id?s.passCharge:0;}
 join(id:string,nickname?:string){if(!this.canJoin())throw Error('MATCH_NOT_JOINABLE');if(this.actors.size>=2)throw Error('ROOM_FULL');const slot=[0,1].find(n=>![...this.actors.values()].some(a=>a.slot===n))!;
  const a:OnlineActor={screen:createScreen(),processedInputSeq:-1,processedMoveSeq:0,processedActionSeq:-1,receivedMoveSeq:0,sequencedMovement:false,moves:[],net:{received:0,consumed:0,discarded:0,queueLength:0,oldestAgeMs:0,timeouts:0,lastCancel:'none',lastCancelAt:0,lastReceiveAt:0},recoveryCount:0,lastPositionWriter:'server:spawn',nickname:nickname?.replace(/[\x00-\x1f]/g,'').trim().slice(0,20)||undefined,id,slot,position:{x:slot===0?-1:1,y:0,z:-1.5},vy:0,input:zeroInput(),motion:createMotion(),defense:createDefense(),locomotion:createLocomotion(),phase:'HELD',charge:0,passCharge:0,ack:-1,receivedAt:this.time,rateAt:this.time,rateCount:0,queue:[],buttons:new Set(),score:0,attempts:0,made:0};
  const occupied=[...this.actors.values()];Object.assign(a.position,recoverBody(a.position,occupied.flatMap(b=>bodyShapes(b.id,b.position,b.screen))).position);
  this.actors.set(id,a);if(this.match){this.match.ready[id]=false;this.match.rematch[id]=false;this.match.scores[id]=0;}if(!this.everJoined){this.ownerId=id;this.lastTouchId=id;this.state.ballVelocity={x:0,y:0,z:0};a.motion=createMotion('DRIBBLE');this.everJoined=true;this.possession++;this.focus(a);this.state.ball=controlledPosition(this.state,a.input,'player');}this.revision++;return a;
 }
 receive(id:string,value:unknown){const a=this.actors.get(id);if(!a)return false;
  if(this.time-a.rateAt>=1000){a.rateAt=this.time;a.rateCount=0;}if(++a.rateCount>NETWORK.maxMessagesPerSecond||!validInput(value))return false;
  if(this.match&&(!matchPlayable(this.match)||value.matchId!==this.match.id||value.epoch!==this.match.epoch)){this.retireRejected(a,value);return false;}
  if(value.seq<=a.ack||a.queue.length+value.actions.length>NETWORK.maxActions)return false;
  if(value.moveSeq!==undefined&&(value.moveSeq<=a.receivedMoveSeq))return false;
  a.ack=value.seq;a.receivedAt=this.time;a.net.lastReceiveAt=Date.now();if(value.actions.includes('cancel')){a.net.lastCancel='EXPLICIT_CANCEL';a.net.lastCancelAt=Date.now();}a.input={x:value.x,z:value.z,sprint:value.sprint,yaw:value.yaw,pitch:value.pitch,jump:false};if(value.moveSeq!==undefined){a.sequencedMovement=true;a.receivedMoveSeq=value.moveSeq;a.moves.push({seq:value.seq,moveSeq:value.moveSeq,input:{...a.input},jump:value.actions.includes('jump'),at:this.time});a.net.received++;while(a.moves.length>NETWORK.maxQueuedMoves)this.discardMove(a);}
  a.queue.push(...value.actions.filter(action=>value.moveSeq===undefined||action!=='jump').map(action=>({action,input:{...a.input},seq:value.seq})));return true;
 }
 leave(id:string){this.matchLeave(id);const a=this.actors.get(id);if(a)this.ledger.set(id,{score:a.score,attempts:a.attempts,made:a.made});this.actors.delete(id);this.airborne.delete(id);this.chargeVersions.delete(id);this.chargeStartedAt.delete(id);if(this.ownerId===id){this.changeOwner(null);makeLoose(this.state);this.state.ballVelocity={x:0,y:0,z:0};}this.revision++;}
 discardMove(a:OnlineActor){const c=a.moves.shift();if(c){a.processedMoveSeq=c.moveSeq;a.processedInputSeq=c.seq;a.net.discarded++;}}
 step(){const dt=CFG.dt;this.tick++;this.state.tick=this.tick;this.time+=dt*1000;const actors=[...this.actors.values()].sort((a,b)=>a.slot-b.slot);
  if(this.match&&!this.advanceMatch())return;
  const applied=new Map<string,OnlineActor['moves'][number]>();
  for(const a of actors){
   if(this.time-a.receivedAt>NETWORK.inputTimeoutMs&&(a.buttons.size>0||a.moves.length>0||a.input.x!==0||a.input.z!==0)){a.net.timeouts++;a.net.lastCancel='INPUT_TIMEOUT';a.net.lastCancelAt=Date.now();a.input={...a.input,x:0,z:0,sprint:false};a.queue=[{action:'cancel',input:{...a.input},seq:a.ack}];}
   const cancel=a.queue.some(e=>e.action==='cancel'||e.action==='movementSync');
   if(cancel){a.net.discarded+=a.moves.length;a.moves.length=0;a.processedMoveSeq=a.receivedMoveSeq;a.processedInputSeq=a.ack;a.input={...a.input,x:0,z:0,sprint:false};}
   this.actions(a,a.queue.splice(0));
   while(a.moves.length&&this.time-a.moves[0].at>NETWORK.maxMoveAgeMs)this.discardMove(a);
   if(!cancel&&a.sequencedMovement){const command=a.moves.shift();if(command){applied.set(a.id,command);a.net.consumed++;}}
   a.net.queueLength=a.moves.length;a.net.oldestAgeMs=a.moves.length?this.time-a.moves[0].at:0;
  }
  const starts=actors.map(a=>({...a.position}));
  const recovering=actors.some(a=>!validBodyPosition(a.position,[]))||(actors.length===2&&Math.hypot(actors[0].position.x-actors[1].position.x,actors[0].position.z-actors[1].position.z)<2*BODY.radius-BODY.tolerance);
  const movement:MovingActor[]=actors.map(a=>{const c=applied.get(a.id);return {position:a.position,vy:a.vy,phase:a.phase,input:c?.input??a.input,enabled:!a.sequencedMovement||!!c,jump:c?.jump??false,screen:a.screen};});
  const movementResult=integrateMovement(movement,dt);
  actors.forEach((a,i)=>{const command=applied.get(a.id);a.vy=movement[i].vy;
   if(command){a.processedMoveSeq=command.moveSeq;a.processedInputSeq=command.seq;}else if(!a.sequencedMovement)a.processedInputSeq=a.ack;
   const recovered=recovering||movementResult.recovered;
   if(recovered)a.recoveryCount++;a.lastPositionWriter=recovered?'server:'+movementResult.reason:'server:fixed-movement';
   advanceLocomotion(a.locomotion,recovered?0:a.position.x-starts[i].x,recovered?0:a.position.z-starts[i].z,dt,a.input.yaw,a.position.y===0);
  });if(this.match?.needsClear&&this.ownerId===this.match.attackId){const owner=this.actors.get(this.ownerId!);if(owner&&Math.hypot(owner.position.x-COURT.rim.x,owner.position.z-COURT.rim.z)>=CFG.arc)this.match.needsClear=false;}this.ballStep(actors,dt);
  if(this.pendingAttack){const id=this.pendingAttack;this.pendingAttack=null;this.resetRound(id);}else if(this.match&&!matchPlayable(this.match))this.clearGameplay();
  for(const a of actors){const air=a.position.y>0||a.vy>0;
   if(air&&!this.airborne.has(a.id)){this.airborne.add(a.id);emitGameEvent(this.state,a.defense.kind==='BLOCK'?'blockJump':'jump',a.position,1,a.id);}
   if(!air&&this.airborne.delete(a.id))emitGameEvent(this.state,'land',a.position,1,a.id);
  }
 }
 actions(a:OnlineActor,actions:{action:Action;input:Input;seq:number}[]){const s=this.focus(a);
  for(const record of actions){const action=record.action,actionInput=record.input;a.processedActionSeq=Math.max(a.processedActionSeq,record.seq);
   if(action==='jump'){a.screen.active=false;if(s.player.y===0&&s.vy===0)s.vy=CFG.jump;continue;}
   if(action==='movementSync')continue;
   if(action==='cancel'){a.screen.active=false;a.buttons.clear();cancelAllCharges(s);cancelDefense(s);this.chargeVersions.delete(a.id);this.chargeStartedAt.delete(a.id);continue;}
   if(action==='screen'){toggleScreen(s,actionInput,[...this.actors.values()].filter(b=>b.id!==a.id).flatMap(b=>bodyShapes(b.id,b.position,b.screen)));continue;}
   if(action==='crossover'){requestCrossover(s);continue;}
   if(action==='steal'||action==='block'){a.screen.active=false;const button=action==='steal'?'shot':'pass';if(!a.buttons.has(button)){a.buttons.add(button);startDefense(s,actionInput,action==='steal'?'STEAL':'BLOCK');}continue;}
   if(action==='shotDown'||action==='passDown'){const button=action==='shotDown'?'shot':'pass';if(a.buttons.has(button))continue;a.buttons.add(button);const ok=action==='shotDown'?startCharge(s):startPassCharge(s);if(ok){a.buttons.delete(button==='shot'?'pass':'shot');this.chargeVersions.set(a.id,this.possession);this.chargeStartedAt.set(a.id,this.time);}}
   if(action==='shotUp'||action==='passUp'){const button=action==='shotUp'?'shot':'pass',held=a.buttons.delete(button);if(held&&this.ownerId===a.id&&this.chargeVersions.get(a.id)===this.possession&&s.phase===(action==='shotUp'?'CHARGING':'PASS_CHARGING')&&!s.playerMotion.pending){const seconds=Math.max(0,(this.time-(this.chargeStartedAt.get(a.id)??this.time))/1000);if(action==='shotUp'){s.charge=Math.min(CFG.maxCharge,seconds);releaseShot(s,actionInput);}else{s.passCharge=Math.min(PASS.maxCharge,seconds);releasePass(s,actionInput);}}}
  }this.commit(a);
 }
 ordered(actors:OnlineActor[]){return this.tick%2?[...actors].reverse():actors;}
 acquire(a:OnlineActor,point:Vec,playCatch=true){const s=this.focus(a);giveBall(s,'player',point);if(playCatch)emitGameEvent(s,'catch',point,1,a.id);this.commit(a);this.state.message=this.match?'캐치 · 드리블 또는 슛':'캐치 · '+a.id.slice(0,5);}
 outcome(made:boolean){
  const s=this.state,m=this.match,shot=this.scoringShot;
  if(s.resolved||m&&!matchPlayable(m))return;
  if(m){
   const eligible=shot&&shot.matchId===m.id&&shot.id===s.shotId&&shot.shooterId===this.shooterId&&shot.eligible;
   if(made&&!eligible){resolve(s,false);s.message='클리어 전 슛 · 득점 불인정';return;}
   if(eligible)s.shotPoints=shot.points;
  }
  const before=s.score;resolve(s,made,this.shooterId??undefined);
  if(s.score!==before&&this.shooterId){const actor=this.actors.get(this.shooterId),record=actor??this.ledger.get(this.shooterId);if(record){record.score+=s.score-before;record.made++;}
   if(m){m.scores[this.shooterId]=(m.scores[this.shooterId]??0)+s.score-before;
    if(m.scores[this.shooterId]>=MATCH.target)this.result(this.shooterId,'TARGET_SCORE');
    else {const next=[...this.actors.keys()].find(id=>id!==this.shooterId);if(next)this.prepareAttack(next);}
   }
  }
 }
 ballStep(actors:OnlineActor[],dt:number){const s=this.state;s.tick=this.tick;s.releaseAge+=dt;
  for(const a of actors){this.focus(a);if(this.ownerId!==a.id)updateUnownedMotion(a.motion,dt,a.locomotion.speed>.015);advanceDefense(s,a.input,dt);this.commit(a);}
  const owner=this.actors.get(this.ownerId??'');
  if(owner){this.focus(owner);if(owner.phase==='CHARGING'&&!owner.motion.pending)s.charge=Math.min(CFG.maxCharge,(this.time-(this.chargeStartedAt.get(owner.id)??this.time))/1000);if(owner.phase==='PASS_CHARGING'&&!owner.motion.pending)s.passCharge=Math.min(PASS.maxCharge,(this.time-(this.chargeStartedAt.get(owner.id)??this.time))/1000);
   if(advanceControlledMotion(s,owner.input,'player',dt)){const kind=owner.motion.pending?.kind;firePendingPlayer(s);if(s.owner==='none'){this.lastTouchId=owner.id;this.passerId=owner.id;if(kind==='shot'){this.shooterId=owner.id;owner.attempts++;if(this.match)this.scoringShot={matchId:this.match.id,id:s.shotId,shooterId:owner.id,points:s.shotPoints+1,eligible:matchPlayable(this.match)&&this.match.attackId===owner.id&&!this.match.needsClear};}}}this.commit(owner);
   if(this.ownerId===owner.id)s.ball=controlledPosition(s,owner.input,'player');
   for(const defender of this.ordered(actors).filter(a=>a.id!==this.ownerId)){this.focus(defender);if(trySteal(s,defender.input)){emitGameEvent(s,'catch',s.ball,1,defender.id);this.commit(defender);}}
  }else{
   s.flight+=dt;
   advanceBall(s,dt,(prev,next,floor,collided,t0,t1)=>{
    if(s.flightKind==='shot'){if(floor||collided)s.shotTouched=true;const shooter=this.actors.get(this.shooterId??'');if(shooter){this.focus(shooter);if(outsideAcquisitionVolumes(s,shooter.input,prev)||outsideAcquisitionVolumes(s,shooter.input,next))s.shotExited=true;}}
    for(const a of this.ordered(actors)){this.focus(a);if(!collided&&tryBlock(s,prev,next,t0,t1)){this.lastTouchId=a.id;emitGameEvent(s,'blockHit',s.ball,Math.hypot(s.ballVelocity.x,s.ballVelocity.y,s.ballVelocity.z),a.id);this.pickupLockedUntil=this.time+DEFENSE.block.pickupLock*1000;this.revision++;return;}}
    if(s.flightKind==='shot'&&!s.resolved){if(rimCrossing(prev,next))this.outcome(true);else if(floor)this.outcome(false);}
    if(this.match&&!matchPlayable(this.match))return false;
    if(s.flightKind==='pass'&&floor)makeLoose(s);
    if(this.time<this.pickupLockedUntil)return;
    for(const a of this.ordered(actors)){this.focus(a);if(s.flightKind==='pass'){
      if(collided||Math.hypot(s.ballVelocity.x,s.ballVelocity.y,s.ballVelocity.z)>PRACTICE.catchSpeed||(this.passerId===a.id&&s.releaseAge<PRACTICE.releaseLock))continue;
      const point=passCatchPoint(s,a.input,prev,next);
      if(point){this.acquire(a,point);return false;}
     }else{const result=evaluateAcquisition(s,a.input,collided?next:prev,next);if(result.reason){if(s.flightKind==='shot'&&!s.resolved)this.outcome(false);this.acquire(a,result.point??next);return false;}}
    }
   },CFG.gravity,(kind,p,strength)=>impactEvent(s,kind,p,strength));
   if(this.match&&!matchPlayable(this.match))return;
   if(!this.ownerId){if(s.flightKind==='shot'&&s.flight>=PHYSICS.maxFlight&&!s.resolved)this.outcome(false);if(s.flightKind==='pass'&&s.flight>=PRACTICE.passFlightSeconds)makeLoose(s);if(!s.flightKind)s.looseAge+=dt;
    const out=Math.abs(s.ball.x)>PHYSICS.outDistance||Math.abs(s.ball.z)>PHYSICS.outDistance;
    if(actors.length&&out){
     if(s.flightKind==='shot'&&!s.resolved)this.outcome(false);
     // Surface contacts do not change the last player touch. A block does.
     // Keep a departed actor's ID so the remaining opponent receives the ball.
     const receiver=actors.find(a=>this.lastTouchId!==null&&a.id!==this.lastTouchId)??this.ordered(actors)[0];
     this.focus(receiver);giveBall(s,'player');s.ball=controlledPosition(s,receiver.input,'player');this.commit(receiver);
     if(this.match)this.prepareAttack(receiver.id);
     s.message='아웃 오브 바운드 · '+(receiver.nickname??(this.match?'다음 공격자':receiver.id.slice(0,5)))+' 공격';
    }else if(actors.length&&s.looseAge>PRACTICE.recoverySeconds){
     if(s.flightKind==='shot'&&!s.resolved)this.outcome(false);
     this.acquire(this.ordered(actors)[0],s.ball,false);this.revision++;
    }
   }
  }
  for(const a of actors){this.focus(a);finishDefense(s);this.commit(a);}
 }
 snapshot():WorldSnapshot{return JSON.parse(JSON.stringify({mode:this.mode,match:this.match,events:this.state.events.recent,protocolVersion:NETWORK.protocolVersion,tick:this.tick,time:this.time,revision:this.revision,ownerId:this.ownerId,shooterId:this.shooterId,passerId:this.passerId,players:[...this.actors.values()].map(({queue,moves,buttons,rateAt,rateCount,receivedAt,...a})=>a),ball:this.state.ball,velocity:this.state.ballVelocity,flightKind:this.state.flightKind,resolved:this.state.resolved,shotId:this.state.shotId,score:this.state.score,attempts:this.state.attempts,made:this.state.made,message:this.state.message}));}
}
