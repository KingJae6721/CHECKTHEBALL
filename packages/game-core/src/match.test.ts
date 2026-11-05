import test from 'node:test';import assert from 'node:assert/strict';
import {OnlineWorld} from './online.ts';import {MATCH} from './match.ts';import {CFG} from './simulation.ts';import {COURT} from './court.ts';
const ticks=(w:OnlineWorld,n:number)=>{for(let i=0;i<n;i++)w.step();};
function duel(){const w=new OnlineWorld('duel',()=>0);w.join('a','Alpha');w.join('b','Beta');return w;}
function intent(w:OnlineWorld,id:string,intent:'ready'|'unready'|'rematch',matchId=w.match!.id){return w.intent(id,{matchId,intent});}
function send(w:OnlineWorld,id:string,actions:string[]=[],extra={}){const a=w.actors.get(id)!;return w.receive(id,{seq:a.ack+1,matchId:w.match?.id,epoch:w.match?.epoch,x:0,z:0,sprint:false,yaw:0,pitch:0,actions,...extra});}
function start(w=duel()){intent(w,'a','ready');intent(w,'b','ready');ticks(w,181);assert.equal(w.match!.stage,'PLAYING');return w;}
function shoot(w:OnlineWorld,id=w.ownerId!,far=true){
 const a=w.actors.get(id)!;assert.equal(w.ownerId,id);a.position={x:0,y:0,z:far?-1.5:1};w.step();
 send(w,id,['shotDown','shotUp']);for(let i=0;i<40&&w.ownerId;i++)w.step();assert.equal(w.ownerId,null);assert.equal(w.state.flightKind,'shot');
 return w.state.shotId;
}
function score(w:OnlineWorld,id=w.ownerId!,far=true){shoot(w,id,far);w.state.ball={...COURT.rim,y:COURT.rim.y+.05};w.state.ballVelocity={x:0,y:-4,z:0};w.step();}

test('duel requires both ready; duplicate ready cannot restart countdown; cancel and empty slot work',()=>{
 const w=duel();assert.equal(w.match!.stage,'WAITING');intent(w,'a','ready');ticks(w,200);assert.equal(w.match!.stage,'WAITING');
 intent(w,'b','ready');const end=w.match!.countdownEnd;intent(w,'b','ready');assert.equal(w.match!.countdownEnd,end);
 intent(w,'a','unready');assert.equal(w.match!.stage,'WAITING');intent(w,'a','ready');assert.equal(w.match!.stage,'COUNTDOWN');
 w.leave('b');assert.equal(w.match!.stage,'WAITING');assert.equal(w.match!.countdownEnd,null);assert.deepEqual(w.match!.ready,{});w.join('c');assert.equal(w.match!.ready.c,false);
});
test('waiting and countdown retire commands without moving, charging or reserving actions',()=>{
 const w=duel(),p={...w.actors.get('a')!.position};assert.equal(send(w,'a',['shotDown'],{moveSeq:1,z:1}),false);ticks(w,5);assert.deepEqual(w.actors.get('a')!.position,p);assert.equal(w.actors.get('a')!.processedMoveSeq,1);
 intent(w,'a','ready');intent(w,'b','ready');assert.equal(send(w,'a',['shotDown','shotUp'],{moveSeq:2,z:1}),false);ticks(w,181);assert.equal(w.state.attempts,0);assert.equal(w.actors.get('a')!.motion.pending,null);
 assert.ok(Math.hypot(w.actors.get('a')!.position.x-w.actors.get('b')!.position.x,w.actors.get('a')!.position.z-w.actors.get('b')!.position.z)>.84);assert.equal(w.match!.firstAttacker,'a');
});
test('valid three and two pointers alternate attack with a server pause',()=>{
 const w=start();score(w,'a');assert.equal(w.match!.scores.a,3);assert.equal(w.ownerId,'b');assert.ok(w.match!.setupEnd);assert.equal(send(w,'b',['shotDown']),false);
 ticks(w,61);score(w,'b',false);assert.equal(w.match!.scores.b,2);assert.equal(w.ownerId,'a');assert.equal(w.match!.needsClear,false);
});
test('clear survives transient no-owner and same-attacker rebounds, opponent gain needs outer boundary',()=>{
 const w=start();w.changeOwner(null);assert.equal(w.match!.attackId,'a');w.acquire(w.actors.get('a')!,w.state.ball);assert.equal(w.match!.needsClear,false);
 w.changeOwner(null);w.acquire(w.actors.get('b')!,{x:1,y:1,z:2});assert.equal(w.match!.attackId,'b');assert.equal(w.match!.needsClear,true);
 const b=w.actors.get('b')!;b.position={x:1,y:0,z:1};w.step();assert.equal(w.match!.needsClear,true);
 w.changeOwner(null);assert.equal(w.match!.attackId,'b');w.acquire(b,w.state.ball);assert.equal(w.match!.needsClear,true);
 b.position={x:4,y:0,z:-1.5};w.step();assert.equal(w.match!.needsClear,false);
});
test('uncleared shot cannot score even after ownership or clearance changes',()=>{
 const w=start();w.changeOwner(null);w.acquire(w.actors.get('b')!,{x:1,y:1,z:2});shoot(w,'b',false);
 w.match!.needsClear=false;w.state.ball={...COURT.rim,y:COURT.rim.y+.05};w.state.ballVelocity={x:0,y:-4,z:0};w.step();assert.equal(w.match!.scores.b,0);assert.equal(w.state.events.recent.some(e=>e.kind==='net'),false);
});
test('target freezes one result, duplicate goal and commands cannot change final score',()=>{
 const w=start();w.match!.scores.a=9;score(w,'a',false);assert.equal(w.match!.stage,'FINISHED');assert.equal(w.match!.scores.a,11);
 const result=structuredClone(w.match!.result),p={...w.actors.get('a')!.position};w.outcome(true);send(w,'a',['shotDown','shotUp'],{z:1});ticks(w,100);assert.deepEqual(w.match!.result,result);assert.deepEqual(w.actors.get('a')!.position,p);
 assert.equal(w.match!.result!.winnerId,'a');assert.equal(w.canJoin(),false);
});
test('both rematch approvals start one fresh generation, alternate opener, keep ACK/seq monotonic',()=>{
 const w=start();send(w,'a',[],{moveSeq:8});w.step();w.match!.scores.a=9;score(w,'a',false);const old=w.match!.id,ack=w.actors.get('a')!.ack,move=w.actors.get('a')!.processedMoveSeq;
 intent(w,'a','rematch');assert.equal(w.match!.stage,'FINISHED');assert.equal(w.match!.id,old);
 intent(w,'b','rematch');assert.equal(w.match!.id,old+1);assert.equal(w.match!.stage,'COUNTDOWN');assert.equal(w.match!.firstAttacker,'b');assert.equal(w.match!.result,null);assert.deepEqual(w.match!.scores,{a:0,b:0});
 assert.ok(w.actors.get('a')!.ack>=ack);assert.ok(w.actors.get('a')!.processedMoveSeq>=move);assert.equal(intent(w,'a','rematch',old),false);assert.equal(intent(w,'a','ready',old),false);assert.equal(w.state.events.recent.length,0);
 const end=w.match!.countdownEnd;intent(w,'a','rematch');assert.equal(w.match!.countdownEnd,end);
});
test('old epoch input is retired without execution in a live next attack',()=>{
 const w=start(),epoch=w.match!.epoch;score(w);ticks(w,61);const a=w.actors.get('b')!,p={...a.position};
 assert.equal(send(w,'b',['shotDown','shotUp'],{epoch,moveSeq:10,z:1}),false);w.step();assert.deepEqual(a.position,p);assert.equal(a.motion.pending,null);assert.equal(a.processedMoveSeq,10);
});
test('playing departure aborts, finished departure retains result and cancels rematch',()=>{
 const w=start();w.leave('b');assert.equal(w.match!.stage,'ABORTED');assert.equal(w.match!.result!.reason,'OPPONENT_LEFT');assert.equal(w.match!.result!.players.length,2);assert.equal(w.canJoin(),false);assert.throws(()=>w.join('c'));
 const f=start();f.match!.scores.a=9;score(f,'a',false);intent(f,'a','rematch');const result=structuredClone(f.match!.result);f.leave('b');assert.equal(f.match!.stage,'FINISHED');assert.deepEqual(f.match!.result,result);assert.deepEqual(f.match!.rematch,{});assert.equal(intent(f,'a','rematch'),false);
});
test('practice remains immediately playable with its original points and join policy',()=>{
 const w=new OnlineWorld();w.join('a');w.join('b');assert.equal(w.match,null);assert.ok(send(w,'a',['shotDown','shotUp']));ticks(w,25);assert.equal(w.state.shotPoints,2);w.leave('b');assert.ok(w.join('c'));
 assert.equal(MATCH.target,11);
});
