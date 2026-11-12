import test from 'node:test';import assert from 'node:assert/strict';
import {NullEngine,Scene,Matrix,Vector3} from '@babylonjs/core';
import {createSkinnedCharacter} from '../../../apps/web/game/createSkinnedCharacter.ts';
import {createLegacyCharacter} from '../../../apps/web/game/createLegacyCharacter.ts';
import {generateCharacterGeometry,BONE_NAMES} from '../../../apps/web/game/characterGeometry.ts';
import {CHARACTER,DUMMY} from './court.ts';import {characterPose} from './motion.ts';import {createState,zeroInput,startCharge,releaseShot,stepGame,CFG} from './simulation.ts';
function setup(){const engine=new NullEngine({renderWidth:128,renderHeight:128,textureSize:256,deterministicLockstep:false,lockstepMaxSteps:4});return {engine,scene:new Scene(engine)};}
test('generated skin has finite data, normalized bounded weights and shared armhole boundaries',()=>{
 const d=generateCharacterGeometry(),n=d.positions.length/3;assert.equal(d.colors.length,n*4);assert.equal(d.matricesWeights.length,n*4);assert.equal(d.matricesIndices.length,n*4);
 assert.ok(d.positions.every(Number.isFinite));assert.ok(d.indices.every(i=>i>=0&&i<n));
 for(let i=0;i<n;i++){assert.ok(Math.abs(d.matricesWeights.slice(i*4,i*4+4).reduce((a,b)=>a+b,0)-1)<1e-9);assert.ok(d.matricesIndices.slice(i*4,i*4+4).every(b=>b>=0&&b<BONE_NAMES.length));}
 const body=new Set(d.indices.slice(0,d.ranges[0].indexCount)),arms=new Set(d.indices.slice(d.ranges[1].indexStart,d.ranges[1].indexStart+d.ranges[1].indexCount));assert.ok([...arms].filter(i=>body.has(i)).length>=16);
 assert.ok(Math.abs(Math.max(...d.positions.filter((_,i)=>i%3===1))-1.8)<1e-7);assert.ok(Math.abs(Math.min(...d.positions.filter((_,i)=>i%3===1)))<1e-7);
});
test('skin bind matrices are identity and canonical pivots retain original lengths',()=>{
 const {engine,scene}=setup();try{const r=createSkinnedCharacter(scene,{name:'bind',firstPerson:false});r.skeleton.prepare(true);const palette=r.skeleton.getTransformMatrices(r.meshes[0]);
  for(let i=0;i<BONE_NAMES.length;i++){const m=Matrix.FromArray(palette,i*16);assert.ok(m.equalsWithEpsilon(Matrix.Identity(),1e-6),BONE_NAMES[i]);}
  assert.equal(r.joints.pelvis.position.y,CHARACTER.pelvisY);assert.equal(r.joints.rightElbow.position.y,-CHARACTER.upperArm);assert.equal(r.joints.rightKnee.position.y,-CHARACTER.upperLeg);assert.equal(r.skeleton.bones.length,21);
 }finally{engine.dispose();}
});
test('GPU wrist transform and legacy sockets agree through charge, jump and follow-through',()=>{
 const {engine,scene}=setup();try{const skin=createSkinnedCharacter(scene,{name:'skin',firstPerson:false}),legacy=createLegacyCharacter(scene,{name:'legacy',firstPerson:false}),s=createState(),input=zeroInput();startCharge(s);
  let maxHandError=0;
  for(let tick=0;tick<90;tick++){input.jump=tick===30;if(tick===45)releaseShot(s,input);stepGame(s,input,CFG.dt);input.jump=false;const pose=characterPose(s,input,'player');skin.update(pose);legacy.update(pose);skin.skeleton.prepare(true);skin.root.computeWorldMatrix(true);
   for(const name of Object.keys(skin.joints)){skin.joints[name].computeWorldMatrix(true);legacy.joints[name].computeWorldMatrix(true);assert.ok(Vector3.Distance(skin.joints[name].getAbsolutePosition(),legacy.joints[name].getAbsolutePosition())<1e-6,name);}
   const matrices=skin.skeleton.getTransformMatrices(skin.meshes[0]);for(const side of [-1,1]){const name=side===1?'right':'left',index=BONE_NAMES.indexOf((name+'Wrist') as typeof BONE_NAMES[number]),p=new Vector3(side*CHARACTER.shoulderX,CHARACTER.shoulderY-CHARACTER.upperArm-CHARACTER.forearm-CHARACTER.handLength/2,0),local=Vector3.TransformCoordinates(p,Matrix.FromArray(matrices,index*16)),world=Vector3.TransformCoordinates(local,skin.root.getWorldMatrix()),socket=skin.handSockets[side===1?1:0];socket.computeWorldMatrix(true);assert.ok(Vector3.Distance(world,socket.getAbsolutePosition())<1e-5,JSON.stringify({tick,name,world:world.asArray(),socket:socket.getAbsolutePosition().asArray()}));}
   assert.ok(Number.isFinite(skin.handError()));maxHandError=Math.max(maxHandError,skin.handError());assert.ok(Math.abs(skin.handError()-legacy.handError())<1e-6);
  }
  console.log('CHARACTER_RIG_MAX_HAND_ERROR_M',maxHandError,'(identical legacy and minimal)');
 }finally{engine.dispose();}
});
test('characters share geometry/materials but keep independent skeletons and first-person visibility',()=>{
 const {engine,scene}=setup();try{const a=createSkinnedCharacter(scene,{name:'a',firstPerson:true}),b=createSkinnedCharacter(scene,{name:'b',firstPerson:false});assert.equal(a.meshes[0].geometry,b.meshes[0].geometry);assert.equal(a.meshes[0].material,b.meshes[0].material);assert.notEqual(a.skeleton,b.skeleton);
  const s=createState(),pose=characterPose(s,zeroInput(),'player');a.update(pose);assert.equal(a.meshes[0].isEnabled(),false);assert.equal(a.meshes[1].isEnabled(),true);assert.equal(a.meshes[2].isEnabled(),false);assert.equal(b.meshes[0].isEnabled(),true);
  assert.equal(a.handSockets.length,2);assert.equal(DUMMY.headRadius,.14);
 }finally{engine.dispose();}
});
