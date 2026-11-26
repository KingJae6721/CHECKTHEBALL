import {OnlineSession} from '../../../apps/web/game/onlineClient.ts';
import test from 'node:test';import assert from 'node:assert/strict';
import {OnlineWorld} from './online.ts';import {BODY} from './court.ts';import {moveGroup,validBodyPosition,bodyShapes} from './bodies.ts';import {integrateMovement} from './movement.ts';import {zeroInput} from './simulation.ts';
import {MovementPrediction} from '../../../apps/web/game/movementPrediction.ts';
const safe=(w:OnlineWorld)=>{const actors=[...w.actors.values()];for(const a of actors)assert.ok(validBodyPosition(a.position,actors.filter(b=>b!==a).flatMap(b=>bodyShapes(b.id,b.position,b.screen))),a.id);};
const send=(w:OnlineWorld,id:string,actions:string[]=[],extra={})=>w.receive(id,{seq:w.actors.get(id)!.ack+1,x:0,z:0,sprint:false,yaw:0,pitch:0,actions,...extra});
test('four seats balance A/B, reject fifth/invalid team, reuse departed slot and preserve legacy capacities',()=>{
 const w=new OnlineWorld('practice2v2');for(const id of ['a','b','c','d'])w.join(id);assert.deepEqual([...w.actors.values()].map(a=>a.teamId),['A','B','A','B']);safe(w);assert.throws(()=>w.join('e'),/ROOM_FULL/);w.leave('c');const replacement=w.join('e');assert.equal(replacement.slot,2);assert.equal(replacement.teamId,'A');safe(w);assert.equal(w.match,null);
 const old=new OnlineWorld();old.join('a');old.join('b');assert.throws(()=>old.join('c'),/ROOM_FULL/);const bad=new OnlineWorld('practice2v2');assert.throws(()=>bad.join('x',undefined,undefined,'C'),/INVALID_TEAM/);
});
test('team intents validate membership, capacity, idempotence and cooldown; last place is atomic',()=>{
 const w=new OnlineWorld('practice2v2');for(const id of ['a','b','c'])w.join(id);assert.equal(w.changeTeam('outsider','A'),'NOT_MEMBER');assert.equal(w.changeTeam('a','C'),'INVALID_TEAM');assert.equal(w.changeTeam('a','A'),null);assert.equal(w.changeTeam('a','B'),null);assert.equal(w.changeTeam('c','B'),'TEAM_FULL');assert.equal(w.changeTeam('a','A'),'TEAM_COOLDOWN');assert.equal(w.changeTeam('a','B'),null);safe(w);
 assert.equal(new OnlineWorld().changeTeam('none','A'),'NOT_MEMBER');
});
test('relocation retires pending input without seq reset, cancels release and leaves held ball at the old spot',()=>{
 const w=new OnlineWorld('practice2v2');const a=w.join('a');w.join('b');send(w,'a',['shotDown','shotUp'],{moveSeq:1});w.step();assert.ok(a.motion.pending);const ball={...w.state.ball},ack=a.ack;assert.equal(w.changeTeam('a','B'),null);assert.equal(w.ownerId,null);assert.deepEqual(w.state.ball,ball);assert.equal(a.motion.pending,null);assert.equal(a.ack,ack);assert.equal(a.processedMoveSeq,1);assert.equal(a.relocationEpoch,1);send(w,'a',['shotUp']);for(let i=0;i<20;i++)w.step();assert.equal(w.state.attempts,0);safe(w);
});
test('team change/leave never resets an already flying ball or another actor ownership',()=>{
 const w=new OnlineWorld('practice2v2');w.join('a');w.join('b');send(w,'a',['passDown','passUp']);for(let i=0;i<30&&w.ownerId;i++)w.step();assert.equal(w.state.flightKind,'pass');const ball={...w.state.ball},velocity={...w.state.ballVelocity};assert.equal(w.changeTeam('b','A'),null);assert.deepEqual(w.state.ball,ball);assert.deepEqual(w.state.ballVelocity,velocity);w.leave('b');assert.equal(w.state.flightKind,'pass');assert.deepEqual(w.state.ballVelocity,velocity);
});
test('four-way relative sweeps block high-speed crossing, allow tangents and recover coincident roots safely',()=>{
 const starts=[{x:-2,z:0},{x:2,z:0},{x:0,z:-2},{x:0,z:2}],deltas=[{x:5,z:0},{x:-5,z:0},{x:0,z:5},{x:0,z:-5}],diag={recovered:false,reason:''};
 const result=moveGroup(starts,deltas,[],diag);assert.equal(result.length,4);assert.ok(result[0].x<result[1].x);for(let i=0;i<4;i++)assert.ok(validBodyPosition(result[i],result.filter((_,j)=>j!==i).map((p,j)=>({id:String(j),...p,radius:BODY.radius}))));
 const coincident=moveGroup(starts.map(()=>({x:BODY.bounds.maxX,z:0})),starts.map(()=>({x:0,z:0})),[],diag);assert.ok(diag.recovered);for(let i=0;i<4;i++)assert.ok(validBodyPosition(coincident[i],coincident.filter((_,j)=>j!==i).map((p,j)=>({id:String(j),...p,radius:BODY.radius}))));assert.deepEqual(moveGroup(coincident,starts.map(()=>({x:0,z:0})),[],diag),coincident);
 const slide=moveGroup([{x:-.85,z:0},{x:0,z:0},{x:4,z:4}],[{x:.5,z:.6},{x:0,z:0},{x:0,z:0}],[],diag);assert.ok(slide[0].z>.1);
});
test('four players keep exclusion through sustained movement, jumps, screens and boundaries',()=>{
 const w=new OnlineWorld('practice2v2');for(const id of ['a','b','c','d'])w.join(id);for(let tick=0;tick<360;tick++){for(const [i,a] of [...w.actors.values()].entries())send(w,a.id,tick%80===0?['jump']:tick%80===40?['screen']:[],{x:Math.sign(Math.sin((tick+i*60)/40)),z:Math.sign(Math.cos((tick+i*60)/40)),sprint:true});w.step();safe(w);}assert.ok([...w.actors.values()].filter(a=>w.ownerId===a.id).length<=1);
});
test('prediction uses all three remote collision proxies and relocation clears old replay',()=>{
 const w=new OnlineWorld('practice2v2');for(const id of ['a','b','c','d'])w.join(id);const snap=w.snapshot(),p=new MovementPrediction();p.accept(snap.players[0],snap.players.slice(1),true);assert.equal(p.remotes.length,3);p.push({seq:1,moveSeq:1,input:{...zeroInput(),x:1},jump:false,phase:'HELD',phaseSeq:-1});const event=Object.assign(()=>{},{remove:()=>{}}),room={sessionId:'a',roomId:'test',reconnection:{enabled:false},onDrop:event,onLeave:event,onError:event,onStateChange:event,onMessage:()=>()=>{},send:()=>{},connection:{isOpen:false}};const session=new OnlineSession(room as any);session.receive({frame:JSON.stringify(w.snapshot())});session.prediction.push({seq:1,moveSeq:1,input:zeroInput(),jump:false,phase:'HELD',phaseSeq:-1});
 w.leave('b');assert.equal(w.changeTeam('a','B'),null);const moved=w.actors.get('a')!;w.step();assert.equal(moved.lastPositionWriter,'server:fixed-movement');session.receive({frame:JSON.stringify(w.snapshot())});assert.equal(session.prediction.pending.length,0);assert.equal(session.self?.relocationEpoch,1);assert.deepEqual(session.prediction.position,moved.position);assert.equal(session.frames.length,1);p.accept(w.snapshot().players[0],w.snapshot().players.slice(1),true);assert.equal(p.pending.length,0);assert.deepEqual(p.position,moved.position);void session.close();
});
