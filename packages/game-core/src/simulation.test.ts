import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, zeroInput, stepGame, startCharge, releaseShot as requestShot, rimCrossing, CFG, pointsAt, cancelCharge } from './simulation.ts';
test('diagonal movement has the same speed as straight movement', () => { const a=createState(), b=createState(); stepGame(a,{...zeroInput(),z:1}); stepGame(b,{...zeroInput(),z:1,x:1}); assert.ok(Math.abs(Math.hypot(b.player.x,b.player.z+1.5)-(a.player.z+1.5))<1e-8); });
test('court boundaries clamp movement',()=>{const s=createState(); for(let i=0;i<1000;i++) stepGame(s,{...zeroInput(),x:1,z:1}); assert.ok(s.player.x<=7.1&&s.player.z<=6.7);});
test('jump takes off and lands without moving below ground',()=>{const s=createState();stepGame(s,{...zeroInput(),jump:true});assert.ok(s.player.y>0);for(let i=0;i<120;i++)stepGame(s,zeroInput());assert.equal(s.player.y,0);});
test('release requires ownership and charge, duplicate release is ignored',()=>{const s=createState();assert.equal(releaseShot(s,zeroInput()),false);startCharge(s);releaseShot(s,zeroInput());assert.equal(releaseShot(s,zeroInput()),false);assert.equal(startCharge(s),false);assert.equal(s.attempts,1);});
test('only descending interior crossings score',()=>{const a={x:0,y:3.2,z:5.7},b={x:0,y:2.9,z:5.7};assert.ok(rimCrossing(a,b));assert.equal(rimCrossing(b,a),false);assert.equal(rimCrossing({...a,x:.3},{...b,x:.3}),false);});
test('perfect forward release scores once and returns possession',()=>{const s=createState();startCharge(s);s.charge=CFG.idealCharge;releaseShot(s,zeroInput());for(let i=0;i<240;i++)stepGame(s,zeroInput());assert.equal(s.made,1);assert.equal(s.score,2);assert.equal(s.phase,'HELD');});
test('points fixed at release even when shooter moves',()=>{const s=createState();startCharge(s);s.charge=.7;releaseShot(s,zeroInput());s.player.z=4;assert.equal(s.shotPoints,2);assert.equal(pointsAt(s.player),1);});
test('cancel charge does not fire a shot',()=>{const s=createState();startCharge(s);cancelCharge(s);assert.equal(s.phase,'HELD');assert.equal(releaseShot(s,zeroInput()),false);assert.equal(s.attempts,0);});
test('same initial state and inputs yield identical output',()=>{const a=createState(),b=createState();for(const s of[a,b]){startCharge(s);for(let i=0;i<42;i++)stepGame(s,zeroInput());releaseShot(s,zeroInput());for(let i=0;i<120;i++)stepGame(s,zeroInput());}assert.deepEqual(a,b);});

// Existing launch-rule scenarios advance through the new controlled gather/release.
function releaseShot(...args:Parameters<typeof requestShot>) {const ok=requestShot(...args);if(ok)for(let i=0;i<60&&args[0].playerMotion.pending;i++)stepGame(args[0],{...args[1],x:0,z:0,jump:false});return ok;}
