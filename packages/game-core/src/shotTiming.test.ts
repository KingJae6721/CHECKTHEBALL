import test from 'node:test';import assert from 'node:assert/strict';
import {SHOT_TIMING,COURT} from './court.ts';
import {shotTimingWindow,evaluateShotTiming,shotDistance} from './shotTiming.ts';
import {shotMeterZone} from '../../../apps/web/game/shotMeterLayout.ts';
import {assistedShotVelocity} from './shot.ts';
import {createState,zeroInput,startCharge,releaseShot,stepGame,CFG} from './simulation.ts';
import {OnlineWorld} from './online.ts';
test('distance reduces the timing window continuously and the visible zone uses that exact rule',()=>{
 let previous=Infinity;
 for(let distance=0;distance<=12;distance+=.125){const half=shotTimingWindow(distance),zone=shotMeterZone(distance);assert.ok(half<=previous+1e-12);previous=half;assert.ok(Math.abs(zone.height*CFG.maxCharge/2-half)<1e-12);assert.ok(Math.abs(zone.bottom+zone.height/2-zone.center)<1e-12);}
 assert.equal(shotTimingWindow(0),SHOT_TIMING.nearHalfWindow);assert.ok(Math.abs(shotTimingWindow(6.75)-.0375)<1e-12);assert.equal(shotTimingWindow(100),SHOT_TIMING.farHalfWindow);
});
test('the same error is perfect near the hoop and late at three-point range; perfect timing has no random penalty',()=>{
 assert.equal(evaluateShotTiming(.76,1.5).perfect,true);assert.equal(evaluateShotTiming(.76,6.75).perfect,false);
 const start={x:0,y:1.7,z:COURT.rim.z-4};assert.deepEqual(assistedShotVelocity(start,0,0,.7,1.5),assistedShotVelocity(start,0,0,.7,6.75));
 const ideal=assistedShotVelocity(start,0,0,.7).z,near=assistedShotVelocity(start,0,0,.76,1.5).z,far=assistedShotVelocity(start,0,0,.76,6.75).z;assert.ok(Math.abs(far-ideal)>Math.abs(near-ideal));
 assert.equal(shotDistance({x:0,z:COURT.rim.z-1.5}),1.5);
});
test('actual local releases use shooter distance for feedback and trajectory',()=>{
 const shoot=(distance:number)=>{const s=createState(),input=zeroInput();s.player={x:0,y:0,z:COURT.rim.z-distance};startCharge(s);s.charge=.76;releaseShot(s,input);for(let i=0;i<60&&s.playerMotion.pending;i++)stepGame(s,input);return s;};
 const near=shoot(1.5),far=shoot(6.75);assert.equal(near.message,'PERFECT RELEASE');assert.equal(far.message,'LATE RELEASE');assert.ok(near.lastTiming!>far.lastTiming!);
 for(let i=0;i<180;i++){stepGame(near,zeroInput());stepGame(far,zeroInput());}assert.equal(near.made,1);assert.equal(far.made,0);
});
test('online authority applies the same distance rule through its existing charge/release path',()=>{
 for(const distance of [1.5,6.75]){
  const w=new OnlineWorld(),actor=w.join('a');actor.position={x:0,y:0,z:COURT.rim.z-distance};
  let seq=1;w.receive('a',{seq:seq++,x:0,z:0,sprint:false,yaw:0,pitch:0,actions:['shotDown']});for(let i=0;i<46;i++){if(i%10===0)w.receive('a',{seq:seq++,x:0,z:0,sprint:false,yaw:0,pitch:0,actions:[]});w.step();}
  w.receive('a',{seq:seq++,x:0,z:0,sprint:false,yaw:0,pitch:0,actions:['shotUp']});for(let i=0;i<30&&w.ownerId==='a';i++)w.step();
  assert.equal(w.state.flightKind,'shot');assert.equal(w.state.message,distance===1.5?'PERFECT RELEASE':'LATE RELEASE');
 }
});
