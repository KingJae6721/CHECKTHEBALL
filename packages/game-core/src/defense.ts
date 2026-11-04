import {COURT, DEFENSE} from './court';
import {isBallPathClear, reflectVelocity} from './physics';
import {CFG, giveBall, type Input, type State, type Vec} from './simulation';
export type DefenseKind='STEAL'|'BLOCK';
export type DefenseState={running:number;jumpQueued:boolean;blockedShotId:number;kind:DefenseKind|null;elapsed:number;previousElapsed:number;cooldown:number;hit:boolean;airUsed:boolean;pickupLock:number;stance:number;reason:string;result:string;previousHand:Vec;hand:Vec};
export function createDefense():DefenseState{return {running:0,jumpQueued:false,blockedShotId:-1,kind:null,elapsed:0,previousElapsed:0,cooldown:0,hit:false,airUsed:false,pickupLock:0,stance:0,reason:'READY',result:'',previousHand:{x:0,y:0,z:0},hand:{x:0,y:0,z:0}};}
export function defenseStage(d:DefenseState){if(!d.kind)return 'IDLE';const c=d.kind==='STEAL'?DEFENSE.steal:DEFENSE.block;return d.elapsed<c.prepare?'PREPARE':d.elapsed<c.prepare+c.active?'ACTIVE':'RECOVER';}
const point=(base:Vec,yaw:number,x:number,y:number,z:number):Vec=>({x:base.x+Math.cos(yaw)*x+Math.sin(yaw)*z,y:base.y+y,z:base.z-Math.sin(yaw)*x+Math.cos(yaw)*z});
export function defenseHand(base:Vec,yaw:number,kind:DefenseKind,elapsed:number):Vec {
 base={...base,y:base.y+COURT.floorY};
 const c=kind==='STEAL'?DEFENSE.steal:DEFENSE.block;
 const extension=elapsed<c.prepare?Math.max(0,elapsed/c.prepare):elapsed<c.prepare+c.active?1:Math.max(0,1-(elapsed-c.prepare-c.active)/c.recover);
 const side=kind==='STEAL'?.12:DEFENSE.block.side,height=kind==='STEAL'?DEFENSE.steal.handY:DEFENSE.block.handY,forward=kind==='STEAL'?DEFENSE.steal.reach:DEFENSE.block.forward;
 return point(base,yaw,DEFENSE.handSide+(side-DEFENSE.handSide)*extension,DEFENSE.handHeight+(height-DEFENSE.handHeight)*extension,DEFENSE.handForward+(forward-DEFENSE.handForward)*extension);
}
export function startDefense(s:State,input:Input,kind:DefenseKind){
 const d=s.defense;const reject=(r:string)=>{d.reason=r;return false;};
 if(s.owner==='player')return reject('OWNED');if(d.kind)return reject('BUSY');if(d.cooldown>0)return reject('COOLDOWN');
 if(kind==='STEAL'&&(s.player.y>0||s.vy!==0))return reject('AIRBORNE');
 if(kind==='BLOCK'&&d.airUsed)return reject('AIR_USED');
 Object.assign(d,{kind,elapsed:0,previousElapsed:0,hit:false,reason:'PREPARE',result:''});
 if(kind==='BLOCK'){d.airUsed=true;d.jumpQueued=s.player.y===0&&s.vy===0;}
 d.hand=defenseHand(s.player,input.yaw,kind,0);d.previousHand={...d.hand};return true;
}
export function cancelDefense(s:State){const d=s.defense;if(d.kind)d.cooldown=Math.max(d.cooldown,(d.kind==='STEAL'?DEFENSE.steal:DEFENSE.block).cooldown);d.kind=null;d.jumpQueued=false;d.hit=false;d.reason='CANCELLED';}
export function advanceDefense(s:State,input:Input,dt:number){
 const d=s.defense;d.cooldown=Math.max(0,d.cooldown-dt);d.pickupLock=Math.max(0,d.pickupLock-dt);
 if(s.player.y===0&&s.vy===0&&!d.jumpQueued)d.airUsed=false;
 const running=s.owner!=='player'&&s.player.y===0?s.locomotion.run:0;
 const decay=Math.exp(-DEFENSE.response*dt),target=s.owner!=='player'?1-running:0;
 d.running=running+(d.running-running)*decay;d.stance=target+(d.stance-target)*decay;
 if(!d.kind)return;d.previousElapsed=d.elapsed;d.elapsed+=dt;d.previousHand={...d.hand};
 if(d.jumpQueued&&d.elapsed>=DEFENSE.block.prepare){if(s.player.y===0&&s.vy===0)s.vy=CFG.jump;d.airUsed=true;d.jumpQueued=false;}
 d.hand=defenseHand(s.player,input.yaw,d.kind,d.elapsed);
}
export function finishDefense(s:State){const d=s.defense;if(!d.kind)return;const c=d.kind==='STEAL'?DEFENSE.steal:DEFENSE.block;if(d.elapsed>=c.prepare+c.active+c.recover){d.kind=null;d.cooldown=c.cooldown;if(!d.hit)d.result='MISS · '+d.reason;}}
export function trySteal(s:State,input:Input){
 const d=s.defense;if(d.kind!=='STEAL'||d.hit||defenseStage(d)!=='ACTIVE')return false;
 const reject=(r:string)=>{d.reason=r;return false;};if(s.owner!=='dummy')return reject('TARGET_STATE');
 const dx=s.ball.x-s.player.x,dz=s.ball.z-s.player.z,len=Math.hypot(dx,dz);
 if(len>0&&(dx*Math.sin(input.yaw)+dz*Math.cos(input.yaw))/len<Math.cos(DEFENSE.steal.angle))return reject('DIRECTION');
 if(Math.hypot(s.ball.x-d.hand.x,s.ball.y-d.hand.y,s.ball.z-d.hand.z)>DEFENSE.steal.radius+COURT.ballRadius)return reject('DISTANCE');
 const shoulder=point(s.player,input.yaw,.12,1.4,0);
 if(!isBallPathClear(shoulder,d.hand)||!isBallPathClear(d.hand,s.ball))return reject('OBSTRUCTED');
 giveBall(s,'player',{...s.ball});d.hit=true;d.result='STEAL SUCCESS';d.reason='SUCCESS';s.message='STEAL · 공을 빼앗았습니다';return true;
}
const mix=(a:Vec,b:Vec,t:number):Vec=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
// Relative swept sphere: both the ball and the core hand socket move during the tick.
export function tryBlock(s:State,a:Vec,b:Vec,t0=0,t1=1){
 const d=s.defense,c=DEFENSE.block;if(d.kind!=='BLOCK'||d.hit)return false;
 if(s.owner!=='none'||!s.flightKind){d.reason='TARGET_STATE';return false;}
 const duration=d.elapsed-d.previousElapsed;
 const lo=duration>0?Math.max(t0,(c.prepare-d.previousElapsed)/duration):t0,hi=duration>0?Math.min(t1,(c.prepare+c.active-d.previousElapsed)/duration):t1;
 if(lo>hi||d.elapsed<c.prepare||d.previousElapsed>=c.prepare+c.active){d.reason='INACTIVE';return false;}
 const ballAt=(t:number)=>mix(a,b,(t-t0)/Math.max(1e-12,t1-t0));
 const handAt=(t:number)=>mix(d.previousHand,d.hand,t);
 const pa=ballAt(lo),pb=ballAt(hi),ha=handAt(lo),hb=handAt(hi);
 const r={x:pa.x-ha.x,y:pa.y-ha.y,z:pa.z-ha.z},v={x:pb.x-hb.x-r.x,y:pb.y-hb.y-r.y,z:pb.z-hb.z-r.z};
 const radius=c.radius+COURT.ballRadius,A=v.x*v.x+v.y*v.y+v.z*v.z,B=2*(r.x*v.x+r.y*v.y+r.z*v.z),C=r.x*r.x+r.y*r.y+r.z*r.z-radius*radius;
 const discriminant=B*B-4*A*C;let u=0;if(C>0){if(A<1e-12||discriminant<0){d.reason='DISTANCE';return false;}u=(-B-Math.sqrt(discriminant))/(2*A);if(u<0||u>1){d.reason='DISTANCE';return false;}}
 const t=lo+(hi-lo)*u,p=ballAt(t),h=handAt(t);
 const anchor={x:s.player.x,y:s.player.y+1.45,z:s.player.z};
 if(!isBallPathClear(a,p)||!isBallPathClear(anchor,h)||!isBallPathClear(h,p)){d.reason='OBSTRUCTED';return false;}
 let n={x:p.x-h.x,y:p.y-h.y,z:p.z-h.z},length=Math.hypot(n.x,n.y,n.z);
 if(length<1e-8){n={x:-s.ballVelocity.x,y:-s.ballVelocity.y,z:-s.ballVelocity.z};length=Math.hypot(n.x,n.y,n.z)||1;}
 n={x:n.x/length,y:n.y/length,z:n.z/length};
 const corrected={x:h.x+n.x*(radius+1e-5),y:h.y+n.y*(radius+1e-5),z:h.z+n.z*(radius+1e-5)};
 if(!isBallPathClear(p,corrected)){d.reason='OBSTRUCTED';return false;}
 reflectVelocity(s.ballVelocity,n,c.restitution);
 for(const axis of ['x','y','z'] as const)s.ballVelocity[axis]+=n[axis]*c.impulse;
 const speed=Math.hypot(s.ballVelocity.x,s.ballVelocity.y,s.ballVelocity.z);if(speed>c.maxSpeed)for(const axis of ['x','y','z'] as const)s.ballVelocity[axis]*=c.maxSpeed/speed;
 s.ball=corrected;
 d.blockedShotId=s.shotId;d.hit=true;d.reason='SUCCESS';d.result='BLOCK SUCCESS';d.pickupLock=c.pickupLock;s.shotTouched=true;s.message='BLOCK · 공을 튕겨냈습니다';return true;
}
