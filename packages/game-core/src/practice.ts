import {assistedShotVelocity} from './shot';
import {DEFENSE_PRACTICE,DUMMY,COURT} from './court';
import {createState, giveBall, CFG, type State, type Input} from './simulation';
import {beginGather,markReleased,actorYaw} from './motion';
export type PracticeMode='PASS'|'STEAL'|'BLOCK'|'ATTACK'|'SCREEN'|'GAP'|'EDGE';
export type PracticeState={mode:PracticeMode;elapsed:number;fired:boolean};
export const createPractice=():PracticeState=>({mode:'PASS',elapsed:0,fired:false});
export function configurePractice(s:State,mode:PracticeMode){
 s.practice={mode,elapsed:0,fired:false};
 if(mode==='STEAL'||mode==='BLOCK'){
  s.player={x:DUMMY.position.x,y:0,z:DUMMY.position.z-1.45};giveBall(s,'dummy');
  s.dummyMotion.dribbleYaw=mode==='BLOCK'?Math.atan2(COURT.rim.x-DUMMY.position.x,COURT.rim.z-DUMMY.position.z):Math.PI;
  if(mode==='BLOCK'){const yaw=s.dummyMotion.dribbleYaw;s.player.x=DUMMY.position.x+Math.sin(yaw)*.95;s.player.z=DUMMY.position.z+Math.cos(yaw)*.95;}
  s.message=mode==='STEAL'?'더미에게 접근해 좌클 스틸':'2.5초 뒤 슛 · 우클 블록 준비';
  s.ball={x:DUMMY.position.x+Math.cos(s.dummyMotion.dribbleYaw)*.33+Math.sin(s.dummyMotion.dribbleYaw)*.58,y:DUMMY.position.y+1.2,z:DUMMY.position.z-Math.sin(s.dummyMotion.dribbleYaw)*.33+Math.cos(s.dummyMotion.dribbleYaw)*.58};
 }
 if(mode==='SCREEN'||mode==='GAP')s.player={x:0,y:0,z:-1.5};
 if(mode==='EDGE')s.player={x:6.8,y:0,z:-1.5};
 if(mode==='SCREEN'||mode==='GAP'||mode==='EDGE')s.message='고정 몸 충돌 · 정면/슬라이딩/점프를 확인하세요';
 if(mode==='ATTACK')s.message='공격 자세 확인 · 더미는 수비 대기';
}
export function selectPractice(s:State,mode:PracticeMode){Object.assign(s,createState());configurePractice(s,mode);}
export function stepPractice(s:State,input:Input,dt:number){
 const p=s.practice;p.elapsed+=dt;if(p.mode!=='BLOCK'||p.fired||s.owner!=='dummy')return;
 const gatherAt=DEFENSE_PRACTICE.warningSeconds-.4;
 if(p.elapsed>=gatherAt&&s.dummyMotion.action==='DRIBBLE')beginGather(s.dummyMotion,s.ball);
 if(p.elapsed<DEFENSE_PRACTICE.warningSeconds)return;
 // Same assisted trajectory function as the normal player shot, with fixed ideal timing.
 const yaw=actorYaw(s,input,'dummy');s.ball={x:DUMMY.position.x+Math.sin(yaw)*.35,y:1.95,z:DUMMY.position.z+Math.cos(yaw)*.35};
 s.ballVelocity=assistedShotVelocity(s.ball,yaw,0,DEFENSE_PRACTICE.shotCharge);
 s.owner='none';s.flightKind='shot';s.phase='IN_FLIGHT';s.passFrom='dummy';s.releaseAge=0;s.flight=0;s.looseAge=0;s.resolved=false;s.shotTouched=false;s.shotExited=false;s.shotId++;s.attempts++;s.shotPoints=1;
 markReleased(s.dummyMotion,s.ball,'shot');s.dummyMotion.pending=null;p.fired=true;s.message='더미 슛 · 우클로 블록';
}

