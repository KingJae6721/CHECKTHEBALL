import {requestCrossover,dribblePoint} from '../packages/game-core/src/motion.ts';
import assert from 'node:assert/strict';
import {NullEngine,Scene,MeshBuilder} from '@babylonjs/core';
import {createCharacter} from '../apps/web/game/createCharacter.ts';
import {createState,zeroInput,stepGame,startPassCharge,releasePass,startCharge} from '../packages/game-core/src/simulation.ts';
import {characterPose} from '../packages/game-core/src/motion.ts';
import {DUMMY,COURT} from '../packages/game-core/src/court.ts';
import {selectPractice} from '../packages/game-core/src/practice.ts';
import {startDefense} from '../packages/game-core/src/defense.ts';
const engine=new NullEngine(),scene=new Scene(engine);
try {
 const player=createCharacter(scene,{name:'player',firstPerson:true}),dummy=createCharacter(scene,{name:'dummy',firstPerson:false});MeshBuilder.CreateSphere('ball',{diameter:COURT.ballRadius*2},scene);
 assert.equal(player.jointCount,17);assert.equal(dummy.jointCount,17);
 for(const rig of [player,dummy])for(const side of ['left','right']){assert.equal(rig.joints[side+'Elbow'].parent,rig.joints[side+'Shoulder']);assert.equal(rig.joints[side+'Wrist'].parent,rig.joints[side+'Elbow']);assert.equal(rig.joints[side+'Knee'].parent,rig.joints[side+'Hip']);assert.equal(rig.joints[side+'Ankle'].parent,rig.joints[side+'Knee']);}
 const s=createState();let maxError=0;
 for(let n=0;n<160;n++){const i={...zeroInput(),yaw:.4,pitch:n<80?-1.2:1.2,jump:n===2};if(n===10)startPassCharge(s);if(n===12)releasePass(s,i);stepGame(s,i);player.update(characterPose(s,i,'player'));dummy.update(characterPose(s,i,'dummy'));maxError=Math.max(maxError,player.handError(),dummy.handError());}
 assert.ok(maxError<.025,'hand sockets: '+maxError);
 assert.equal(scene.getMeshByName('player:head-mesh').isEnabled(),false);assert.equal(scene.getMeshByName('player:torso-mesh').isEnabled(),false);assert.equal(scene.getMeshByName('player:rightForearm').isEnabled(),true);
 for(const name of ['dummy:leftFoot','dummy:rightFoot']){const m=scene.getMeshByName(name);m.computeWorldMatrix(true);assert.ok(Math.abs(m.getBoundingInfo().boundingBox.minimumWorld.y-DUMMY.position.y)<1e-6);}
 const head=scene.getMeshByName('dummy:head-mesh');head.computeWorldMatrix(true);const defensiveDrop=characterPose(s,zeroInput(),'dummy').pelvisDrop;assert.ok(Math.abs(head.getBoundingInfo().boundingBox.maximumWorld.y-DUMMY.position.y-DUMMY.height+defensiveDrop)<1e-6);
 const shooting=createState();startCharge(shooting);for(let n=0;n<20;n++)stepGame(shooting,zeroInput());
 player.update(characterPose(shooting,zeroInput(),'player'));assert.ok(player.joints.rightKnee.rotation.x>.4);
 for(const side of ['left','right']){const foot=scene.getMeshByName('player:'+side+'Foot');foot.computeWorldMatrix(true);assert.ok(Math.abs(foot.getBoundingInfo().boundingBox.minimumWorld.y-COURT.floorY)<1e-6,'grounded crouch soles');}
 maxError=Math.max(maxError,player.handError());stepGame(shooting,{...zeroInput(),jump:true});player.update(characterPose(shooting,zeroInput(),'player'));assert.equal(player.joints.rightKnee.rotation.x,0);maxError=Math.max(maxError,player.handError());
 assert.ok(maxError<.025,'shot socket error '+maxError);
 const crossover=createState();crossover.playerMotion.phase=.8;crossover.ball=dribblePoint(crossover.player,0,.8);assert.ok(requestCrossover(crossover));
 for(let n=0;n<100;n++){stepGame(crossover,{...zeroInput(),yaw:n<35?0:1.2,pitch:.8});player.update(characterPose(crossover,{...zeroInput(),yaw:n<35?0:1.2,pitch:.8},'player'));maxError=Math.max(maxError,player.handError());}
 assert.equal(crossover.playerMotion.currentDribbleHand,'left');assert.ok(maxError<.025,'crossover hand sockets '+maxError);
 assert.equal(scene.meshes.filter(m=>m.name==='ball').length,1);
 for(const mode of ['STEAL','BLOCK','ATTACK']){const defending=createState();selectPractice(defending,mode);for(let n=0;n<100;n++){if(n===5&&mode!=='ATTACK')startDefense(defending,zeroInput(),mode);stepGame(defending,zeroInput());player.update(characterPose(defending,zeroInput(),'player'));dummy.update(characterPose(defending,zeroInput(),'dummy'));maxError=Math.max(maxError,player.handError(),dummy.handError());}assert.ok(maxError<.025,'defense socket error '+maxError);}
 console.log(JSON.stringify({jointsPerCharacter:17,maxHandSocketError:maxError,ballMeshes:1,firstPersonHeadTorsoHidden:true,solesAtGround:true,groundedShotKneesBent:true,jumpShotLegsStraight:true,crossoverLeftHand:true,height:DUMMY.height}));
} finally {scene.dispose();engine.dispose();}
