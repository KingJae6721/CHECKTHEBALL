import test from 'node:test';import assert from 'node:assert/strict';
import {scoreboardSides,scoredPlayers} from '../../../apps/web/game/scoreboard.ts';
import {AudioTimeline,MotionSounds,type AudibleActor} from '../../../apps/web/game/audioTimeline.ts';
import {parseAudioSettings,AUDIO} from '../../../apps/web/game/audioConfig.ts';
import {createEventLog,emitGameEvent,impactEvent,type GameEvent} from './gameEvents.ts';
import {createState,resolve,stepGame,zeroInput} from './simulation.ts';
import {createMotion} from './motion.ts';import {createLocomotion} from './locomotion.ts';
import {OnlineWorld} from './online.ts';import {advanceBall} from './physics.ts';import {COURT,CROSSOVER,DRIBBLE} from './court.ts';
const player=(id:string,score=0)=>({id,score});
const event=(id:number,time:number,kind:GameEvent['kind']='floor',actorId:string|null=null):GameEvent=>({eventId:id,kind,time,serverTick:Math.round(time*.06),actorId,shotId:1,actionId:`test:${id}`,position:{x:0,y:0,z:0},strength:2});
test('scoreboard always places session self left, independently on both clients',()=>{
 const players=[player('a',3),player('b',7)];
 assert.equal(scoreboardSides(players,'b').self?.score,7);assert.equal(scoreboardSides([...players].reverse(),'a').self?.score,3);
 assert.equal(scoreboardSides(players,'a').opponent?.score,7);assert.equal(scoreboardSides([player('a')],'a').opponent,undefined);
});
test('score highlight only marks increased known-player server scores, never arrival or repeats',()=>{
 assert.deepEqual(scoredPlayers([player('a',1),player('b',4)],[player('b',4),player('a',3)]),['a']);
 assert.deepEqual(scoredPlayers([player('a',3)],[player('a',3),player('c',5)]),[]);
 assert.equal(scoreboardSides([player('a'),player('c')],'a').opponent?.id,'c');
});
test('server jump/landing emitted once, block jump excludes ordinary jump',()=>{
 const w=new OnlineWorld();w.join('a');w.receive('a',{seq:1,x:0,z:0,sprint:false,yaw:0,pitch:0,actions:['jump']});
 for(let i=0;i<60;i++)w.step();assert.equal(w.state.events.recent.filter(e=>e.kind==='jump').length,1);assert.equal(w.state.events.recent.filter(e=>e.kind==='land').length,1);
 const b=new OnlineWorld();b.join('a');b.join('b');b.receive('b',{seq:1,x:0,z:0,sprint:false,yaw:0,pitch:0,actions:['block']});
 for(let i=0;i<10;i++)b.step();assert.equal(b.state.events.recent.filter(e=>e.kind==='blockJump').length,1);assert.equal(b.state.events.recent.filter(e=>e.kind==='jump').length,0);assert.equal(b.state.events.recent.filter(e=>e.kind==='blockHit').length,0);
});
test('physical floor events observe impacts, ignore resting chatter and preserve physics',()=>{
 const a={ball:{x:3,y:.14,z:0},ballVelocity:{x:0,y:-5,z:0}},b=structuredClone(a),s=createState();
 advanceBall(a,1/60,undefined,9.81,(kind,p,strength)=>impactEvent(s,kind,p,strength));advanceBall(b,1/60);
 assert.deepEqual(a,b);assert.equal(s.events.recent.filter(e=>e.kind==='floor').length,1);
 for(let i=0;i<10;i++)impactEvent(s,'floor',s.ball,.1);assert.equal(s.events.recent.length,1);
});
test('neighbouring rim contacts aggregate while later contacts can sound, shot history survives',()=>{
 const s=createState();s.shotId=4;s.tick=10;for(let i=0;i<20;i++)impactEvent(s,'rim',COURT.rim,3);
 assert.equal(s.events.recent.length,1);s.tick+=5;impactEvent(s,'rim',COURT.rim,2);assert.equal(s.events.recent.length,2);
 resolve(s,true);resolve(s,true);assert.equal(s.events.recent.filter(e=>e.kind==='net').length,1);assert.equal(s.events.recent.at(-1)?.contacted,true);
 const clean=createState();resolve(clean,true);assert.equal(clean.events.recent[0].contacted,false);
});
test('pass crossing the hoop cannot emit net or change score',()=>{
 const s=createState();s.owner='none';s.phase='IN_FLIGHT';s.flightKind='pass';s.releaseAge=1;s.ball={x:COURT.rim.x,y:COURT.rim.y+.05,z:COURT.rim.z};s.ballVelocity={x:0,y:-8,z:0};
 stepGame(s,zeroInput());assert.equal(s.score,0);assert.equal(s.events.recent.some(e=>e.kind==='net'),false);
});
test('event journal is bounded by count and age',()=>{
 const s={events:createEventLog(),tick:0,shotId:1};for(let i=0;i<500;i++)emitGameEvent(s,'floor',{x:0,y:0,z:0});assert.equal(s.events.recent.length,128);
 s.tick=200;emitGameEvent(s,'net',{x:0,y:0,z:0});assert.equal(s.events.recent.length,1);
});
test('new participants skip past events; snapshots deduplicate and follow displayed time',()=>{
 const q=new AudioTimeline();q.ingest([event(1,100)],0);assert.deepEqual(q.drain(100,100,'a'),[]);
 q.ingest([event(1,100),event(2,200,'rim'),event(3,230,'net')],50);q.ingest([event(2,200),event(3,230,'net')],60);
 assert.deepEqual(q.drain(199,250,'a'),[]);assert.deepEqual(q.drain(200,250,'a').map(e=>e.eventId),[2]);assert.deepEqual(q.drain(230,250,'a').map(e=>e.eventId),[3]);assert.deepEqual(q.drain(300,300,'a'),[]);
});
test('own confirmed jump has no remote interpolation delay; late events expire; queue bounded',()=>{
 const q=new AudioTimeline();q.ingest([],0);q.ingest([event(1,200,'jump','a'),event(2,200,'jump','b')],10);
 assert.deepEqual(q.drain(100,200,'a').map(e=>e.actorId),['a']);assert.deepEqual(q.drain(500,500,'a'),[]);
 q.ingest(Array.from({length:500},(_,i)=>event(i+10,1000)),30);assert.equal(q.queued,AUDIO.maxQueued);q.discard();assert.equal(q.queued,0);
});
function actor():AudibleActor{return {id:'a',position:{x:0,y:0,z:0},vy:0,motion:createMotion('DRIBBLE'),locomotion:createLocomotion(),owns:true,near:true,block:false};}
test('dribble and crossover phase crossings sound once; gather and airborne do not bounce',()=>{
 const m=new MotionSounds(),a=actor();a.motion.phase=DRIBBLE.pushFraction-.01;a.motion.clock=1;m.sample(a,0);
 a.motion.phase=DRIBBLE.pushFraction+.01;a.motion.clock=1.02;assert.equal(m.sample(a,20).filter(c=>c.kind==='dribble').length,1);assert.equal(m.sample(a,30).length,0);
 a.motion.phase=DRIBBLE.pushFraction-.01;a.motion.clock=1;m.sample(a,40);a.motion.phase=DRIBBLE.pushFraction+.01;a.motion.clock=1.02;assert.equal(m.sample(a,60).length,0);
 a.motion.action='GATHER';a.motion.phase=.3;m.sample(a,80);a.motion.phase=.5;assert.equal(m.sample(a,100).length,0);
 a.motion.action='CROSSOVER';a.motion.crossover={stage:'ACTIVE',elapsed:.1,from:'right',to:'left',queued:false,returnRate:1};a.motion.clock=2;m.sample(a,120);
 a.motion.crossover.elapsed=CROSSOVER.duration*CROSSOVER.bounceFraction+.001;a.motion.clock=2.04;assert.equal(m.sample(a,160).filter(c=>c.kind==='dribble').length,1);
 a.position.y=.2;a.motion.clock=3;a.motion.action='DRIBBLE';a.motion.phase=.3;m.sample(a,180);a.motion.phase=.5;assert.equal(m.sample(a,200).length,0);
});
test('walking and running stay silent; suspended tab never catches up old cycles',()=>{
 const m=new MotionSounds(),a=actor();a.owns=false;m.sample(a,0);a.locomotion.phase=3.2;assert.equal(m.sample(a,20).length,0);
 a.locomotion.phase=6.2;a.locomotion.speed=3;a.locomotion.distance=.5;m.sample(a,40);a.locomotion.phase=.1;a.locomotion.distance=1;assert.equal(m.sample(a,60).length,0);
 a.position.y=1;a.locomotion.phase=3.2;a.locomotion.distance=2;assert.equal(m.sample(a,80).length,0);
 a.position.y=0;a.locomotion.phase=.1;a.locomotion.distance=20;assert.equal(m.sample(a,2000).length,0);m.clear();assert.equal(m.sample(a,2020).length,0);
});
test('audio setting parser handles corrupted storage and clamps volume',()=>{
 assert.equal(parseAudioSettings('broken').volume,AUDIO.defaultVolume);assert.deepEqual(parseAudioSettings('{"volume":9,"muted":true}'),{volume:1,muted:true});assert.equal(parseAudioSettings(null).muted,false);
});
test('future sound reservations expire on wall time and old event IDs never return after dedup expiry',()=>{
 const q=new AudioTimeline();q.ingest([],0);q.ingest([event(1,10000)],10);assert.equal(q.queued,1);
 q.ingest([event(1,10000)],1200);assert.equal(q.queued,0);
 q.ingest([event(1,10000)],7000);assert.equal(q.queued,0);
});
test('a new catch resets old dribble debounce and sounds on the first new floor crossing',()=>{
 const sounds=new MotionSounds(),a=actor();a.motion.clock=20;a.motion.phase=.42;sounds.sample(a,0);
 a.motion.clock=20.02;a.motion.phase=.44;assert.equal(sounds.sample(a,20).length,1);
 a.owns=false;a.motion.action='IDLE';a.motion.clock=20.04;sounds.sample(a,40);
 a.owns=true;a.motion.action='CATCH';a.motion.clock=0;a.motion.phase=0;assert.equal(sounds.sample(a,60).length,0);
 a.motion.action='DRIBBLE';a.motion.clock=.3;a.motion.phase=.42;sounds.sample(a,80);
 a.motion.clock=.32;a.motion.phase=.44;assert.equal(sounds.sample(a,100).filter(c=>c.kind==='dribble').length,1);
});
test('a fixed dummy at floor height is grounded and audible while airborne actors stay silent',()=>{
 const sounds=new MotionSounds(),a=actor();a.id='dummy';a.near=false;a.position.y=COURT.floorY;a.grounded=true;a.motion.clock=1;a.motion.phase=.42;sounds.sample(a,0);
 a.motion.clock=1.02;a.motion.phase=.44;assert.equal(sounds.sample(a,20).filter(c=>c.kind==='dribble').length,1);
 a.grounded=false;a.motion.clock=2;a.motion.phase=.42;sounds.sample(a,40);
 a.motion.clock=2.02;a.motion.phase=.44;assert.equal(sounds.sample(a,60).length,0);
});
