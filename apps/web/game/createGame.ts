import type {MatchState} from '../../../packages/game-core/src/match';
import {toggleScreen} from '../../../packages/game-core/src/screen';
import {createNet} from './createNet';
import {AudioManager} from './audioManager';
import {AudioTimeline,MotionSounds} from './audioTimeline';
import type {AudioSettings} from './audioConfig';
import {createLocomotion} from '../../../packages/game-core/src/locomotion';
import {FrameDiagnostics} from './frameDiagnostics';
import type {WorldSnapshot} from '../../../packages/game-core/src/online';
import {actorView,type OnlineSession} from './onlineClient';
import {NETWORK} from '../../../packages/protocol/src/index';
import {createCameraMotion,resetCameraMotion,advanceCameraMotion} from './cameraMotion';
import {isBallPathClear} from '../../../packages/game-core/src/physics';
import {fixedBodies,fixedPeople,bodyShapes} from '../../../packages/game-core/src/bodies';
import {createButtons} from '../../../packages/game-core/src/buttons';
import {defenseStage,defenseHand} from '../../../packages/game-core/src/defense';
import {selectPractice,type PracticeMode} from '../../../packages/game-core/src/practice';
import { requestCrossover } from '../../../packages/game-core/src/motion';
import { createCharacter } from './createCharacter';
import { controlledPosition, characterPose } from '../../../packages/game-core/src/motion';
import { acquisitionVolumes } from '../../../packages/game-core/src/acquisition';
import { createDummy } from './createDummy';
import { COURT, BODY, HEAD_BOB, DEFENSE, DUMMY, ACQUISITION, rimSegments } from '../../../packages/game-core/src/court';
import { Engine, Scene, Color3, Color4, Vector3, UniversalCamera, HemisphericLight, DirectionalLight, MeshBuilder, StandardMaterial, Mesh } from '@babylonjs/core';
import { CFG, createState, zeroInput, stepGame, startCharge, releaseShot, cancelAllCharges, resetState, startPassCharge, releasePass, isAimingAtDummy, type State } from '../../../packages/game-core/src/simulation';
export type Snapshot = Pick<State,'score'|'attempts'|'made'|'phase'|'charge'|'message'|'lastTiming'|'owner'|'flightKind'|'passCharge'|'practice'|'defense'> & { screenActive?:boolean;diagnostics?:{render:string;net?:string};audioReady?:boolean; online?:{match?:MatchState|null;remainingMs?:number;roomId:string;selfId:string;ownerId:string|null;count:number;connected:boolean;status:string;pingMs?:number|null;pingStatus?:string;players:{id:string;nickname?:string;score:number;attempts:number;made:number}[]}; distance: number; locked: boolean; aimingDummy: boolean; debug?: { render:string;net?:string; bodyMotion:string; defensePosition:string; visible: boolean; blocked: State['acquisitionBlock']; event: State['acquisitionEvent']; speed: number; touched: boolean; exited: boolean; pass: State['lastPlayerPass']; motion:{player:string;dummy:string;locomotion:string;phase:number;period:number;pending:boolean;ballY:number;ballCount:number;playerJoints:number;dummyJoints:number;handError:number;shooting:number;kneeBend:number;playerY:number;hand:string;crossover:string;crossProgress:number;bodyYaw:number} }; };
const liveRuntimes=new WeakMap<HTMLCanvasElement,number>();
export function createGame(canvas:HTMLCanvasElement,onUpdate:(s:Snapshot)=>void,onError:(s:string)=>void,online?:OnlineSession) {
 const frameDiagnostics=new FrameDiagnostics();const productionDiagnostics=new URLSearchParams(window.location.search).get('diagnostics')==='1';let performanceVisible=false;
 const audio=new AudioManager(),dummyLocomotion=createLocomotion();let audioTimeline=new AudioTimeline();const motionSounds=new MotionSounds();
 const clearAudio=()=>{audio.stop();audioTimeline.discard();motionSounds.clear();};
 const engine=new Engine(canvas,true,{preserveDrawingBuffer:false,stencil:true});engine.setHardwareScalingLevel(Math.max(1,window.devicePixelRatio/1.6));
 const scene=new Scene(engine);scene.clearColor=new Color4(.065,.09,.12,1);scene.fogMode=Scene.FOGMODE_EXP2;scene.fogDensity=.012;scene.fogColor=new Color3(.065,.09,.12);
 const camera=new UniversalCamera('eyes',new Vector3(0,CFG.eye,-1.5),scene);camera.minZ=.06;camera.fov=1.22;camera.inputs.clear();
 const ambient=new HemisphericLight('sky',new Vector3(0,1,0),scene);ambient.intensity=.85;ambient.groundColor=new Color3(.18,.22,.25);
 const sun=new DirectionalLight('sun',new Vector3(-.4,-1,.5),scene);sun.intensity=1.25;sun.diffuse=new Color3(1,.89,.72);
 function mat(name:string,hex:string,emission=0){const m=new StandardMaterial(name,scene);m.diffuseColor=Color3.FromHexString(hex);m.specularColor=new Color3(.08,.08,.08);m.emissiveColor=m.diffuseColor.scale(emission);return m;}
 const asphalt=mat('asphalt','#27343b'),court=mat('court','#557e7b'),paint=mat('paint','#c9734d'),white=mat('markings','#e0e4d5',.15),metal=mat('metal','#283942'),orange=mat('rim','#ff7445',.35),ballmat=mat('basketball','#d97c3c'),dark=mat('seams','#432b20'),concrete=mat('surround','#202e34');
 const floor=MeshBuilder.CreateGround('surround',{width:70,height:65},scene);floor.material=concrete;floor.position.z=0;floor.position.y=COURT.floorY-.001;
 const slab=MeshBuilder.CreateGround('court',{width:15,height:14.5},scene);slab.position.y=COURT.floorY;slab.material=court;
 const key=MeshBuilder.CreateGround('key',{width:4.9,height:5.8},scene);key.position.set(0,COURT.floorY+.001,4.35);key.material=paint;
 function line(name:string,pts:Vector3[],material=white,radius=.025){const m=MeshBuilder.CreateTube(name,{path:pts,radius,tessellation:6},scene);m.material=material;return m;}
 function segment(name:string,x1:number,z1:number,x2:number,z2:number){return line(name,[new Vector3(x1,.035,z1),new Vector3(x2,.035,z2)]);}
 segment('baseline',-7.35,7.1,7.35,7.1);segment('left',-7.35,-7.1,-7.35,7.1);segment('right',7.35,-7.1,7.35,7.1);segment('half',-7.35,-7.1,7.35,-7.1);
 segment('key-left',-2.45,7.1,-2.45,1.45);segment('key-right',2.45,7.1,2.45,1.45);segment('free-throw',-2.45,1.45,2.45,1.45);
 function arc(name:string,cx:number,cz:number,r:number,start:number,end:number){const pts=[];for(let i=0;i<=100;i++){const a=start+(end-start)*i/100;pts.push(new Vector3(cx+Math.sin(a)*r,.04,cz+Math.cos(a)*r));}line(name,pts);}
 arc('two-point-arc',0,CFG.rim.z,CFG.arc,Math.acos((7.1-CFG.rim.z)/CFG.arc),2*Math.PI-Math.acos((7.1-CFG.rim.z)/CFG.arc));
 arc('free-throw-circle',0,1.45,1.8,0,2*Math.PI);arc('center',0,-7.1,1.8,-Math.PI/2,Math.PI/2);
 const pole=MeshBuilder.CreateCylinder('pole',{height:4.8,diameter:.18},scene);pole.position.set(0,2.4,7.5);pole.material=metal;
 const arm=MeshBuilder.CreateBox('support',{width:.15,height:.15,depth:1.5},scene);arm.position.set(0,3.8,6.9);arm.material=metal;
 const boardmat=mat('board','#bed4ce');boardmat.alpha=.6;
 const board=MeshBuilder.CreateBox('backboard',{width:COURT.board.width,height:COURT.board.height,depth:COURT.board.depth},scene);board.position.copyFromFloats(COURT.board.center.x,COURT.board.center.y,COURT.board.center.z);board.material=boardmat;
 const boardPoint=(x:number,y:number)=>new Vector3(COURT.board.center.x+x,COURT.board.center.y+y,COURT.board.center.z-COURT.board.depth/2-.005);
 line('board-border',[boardPoint(-COURT.board.width/2,-COURT.board.height/2),boardPoint(-COURT.board.width/2,COURT.board.height/2),boardPoint(COURT.board.width/2,COURT.board.height/2),boardPoint(COURT.board.width/2,-COURT.board.height/2),boardPoint(-COURT.board.width/2,-COURT.board.height/2)]);
 line('board-square',[boardPoint(-.3,-.45),boardPoint(-.3,0),boardPoint(.3,0),boardPoint(.3,-.45)]);
 const rim=MeshBuilder.CreateTorus('rim',{diameter:CFG.rimRadius*2,thickness:COURT.rimTubeRadius*2,tessellation:COURT.rimSegments},scene);rim.position.copyFromFloats(CFG.rim.x,CFG.rim.y,CFG.rim.z);rim.material=orange;
 const net=createNet(scene,white);
 const ball=MeshBuilder.CreateSphere('ball',{diameter:CFG.ballRadius*2,segments:20},scene);ball.material=ballmat;
 for(const rot of[0,Math.PI/2]){const seam=MeshBuilder.CreateTorus('seam',{diameter:.239,thickness:.006,tessellation:40},scene);seam.parent=ball;seam.rotation.x=rot;seam.material=dark;}
 const seam=MeshBuilder.CreateTorus('seam',{diameter:.239,thickness:.006,tessellation:40},scene);seam.parent=ball;seam.rotation.z=Math.PI/2;seam.material=dark;
 // Court fencing, light posts and a low-poly city. No external assets required.
 for(const x of[-9,9]){for(let z=-9;z<=9;z+=3){const p=MeshBuilder.CreateCylinder('fence-post',{height:3,diameter:.055},scene);p.position.set(x,1.5,z);p.material=metal;}for(const y of[.4,1,1.6,2.2,2.9])line('fence-wire',[new Vector3(x,y,-9),new Vector3(x,y,9)],metal,.009);}
 for(let i=0;i<18;i++){const x=(i%2?1:-1)*(12+(i%4)*3);const z=-16+Math.floor(i/2)*5;const h=3+(i*7%9);const b=MeshBuilder.CreateBox('building',{width:3.7,height:h,depth:3.5},scene);b.position.set(x,h/2,z);b.material=i%2?asphalt:metal;}
 const glow=mat('lamp','#ffe0ae',1);for(const x of[-8.4,8.4]){const p=MeshBuilder.CreateCylinder('light-post',{height:7,diameter:.1},scene);p.position.set(x,3.5,5);p.material=metal;const l=MeshBuilder.CreateBox('lamp',{width:1.1,height:.12,depth:.5},scene);l.position.set(x,7,5);l.material=glow;}
 // Development-only collider overlay; these meshes never drive simulation.
 const debugMeshes: Mesh[]=[];
 const acquisitionMeshes: Mesh[]=[];
 if(process.env.NODE_ENV==='development') {
   const debugMaterial=mat('collision-debug','#73ff98',1);debugMaterial.wireframe=true;debugMaterial.disableDepthWrite=true;
   const box=MeshBuilder.CreateBox('debug-board',{width:COURT.board.width,height:COURT.board.height,depth:COURT.board.depth},scene);
   box.position.copyFrom(board.position);box.material=debugMaterial;box.renderingGroupId=1;debugMeshes.push(box);
   for(const {a,b} of rimSegments()) {
     const start=new Vector3(a.x,a.y,a.z),end=new Vector3(b.x,b.y,b.z);
     const tube=line('debug-rim-capsule',[start,end],debugMaterial,COURT.rimTubeRadius);tube.renderingGroupId=1;debugMeshes.push(tube);
     const cap=MeshBuilder.CreateSphere('debug-rim-cap',{diameter:COURT.rimTubeRadius*2,segments:8},scene);cap.position.copyFrom(start);cap.material=debugMaterial;cap.renderingGroupId=1;debugMeshes.push(cap);
   }
   for(const v of acquisitionVolumes(createState(),zeroInput())) {
     const material=mat(v.reason==='GROUND_PICKUP'?'ground-acquisition':'air-acquisition',v.reason==='GROUND_PICKUP'?'#60cfff':'#ffd36a',1);material.wireframe=true;material.disableDepthWrite=true;
     const mesh=MeshBuilder.CreateBox(v.reason,{width:v.size.x+COURT.ballRadius*2,height:v.size.y+COURT.ballRadius*2,depth:v.size.z+COURT.ballRadius*2},scene);mesh.material=material;mesh.renderingGroupId=1;acquisitionMeshes.push(mesh);debugMeshes.push(mesh);
   }
   for(const mesh of debugMeshes) {mesh.isPickable=false;mesh.setEnabled(false);}
 }
 const defenseMeshes:Mesh[]=[];
 if(process.env.NODE_ENV==='development')for(const kind of ['STEAL','BLOCK'] as const){const mesh=MeshBuilder.CreateSphere('debug-'+kind,{diameter:(kind==='STEAL'?DEFENSE.steal.radius:DEFENSE.block.radius)*2,segments:16},scene);const material=mat('debug-'+kind,kind==='STEAL'?'#ff9a60':'#c390ff',1);material.wireframe=true;mesh.material=material;mesh.isPickable=false;mesh.setEnabled(false);defenseMeshes.push(mesh);}
 const bodyMeshes:Mesh[]=[],bodyRings:Mesh[]=[],bodyNormals:ReturnType<typeof MeshBuilder.CreateLines>[]=[];
 if(process.env.NODE_ENV==='development'){
  const material=mat('body-debug','#62bfff',1);material.wireframe=true;
  for(let i=0;i<12;i++){const cylinder=MeshBuilder.CreateCylinder('body-cylinder-'+i,{height:BODY.height,diameter:BODY.radius*2,tessellation:24},scene);cylinder.material=material;cylinder.isPickable=false;cylinder.setEnabled(false);bodyMeshes.push(cylinder);debugMeshes.push(cylinder);const ring=MeshBuilder.CreateTorus('body-radius-'+i,{diameter:BODY.radius*2,thickness:.012,tessellation:32},scene);ring.material=material;ring.isPickable=false;ring.setEnabled(false);bodyRings.push(ring);debugMeshes.push(ring);}
  for(let i=0;i<=BODY.iterations;i++){const ray=MeshBuilder.CreateLines('body-contact-'+i,{points:[Vector3.Zero(),new Vector3(0,0,.001)],updatable:true},scene);ray.color=i===BODY.iterations?new Color3(1,.3,.2):new Color3(.3,1,.6);ray.isPickable=false;ray.setEnabled(false);bodyNormals.push(ray);debugMeshes.push(ray);}
 }
 const fixedCharacters=Array.from({length:online?0:2},(_,i)=>createCharacter(scene,{name:'fixed-screen-'+i,firstPerson:false}));for(const rig of fixedCharacters)rig.root.setEnabled(false);
 const dummy=online?null:createDummy(scene);
 const opponent=online?createCharacter(scene,{name:'remote-player',firstPerson:false}):null;opponent?.root.setEnabled(false);
 const playerCharacter=createCharacter(scene,{name:'player',firstPerson:true});
 let debugVisible=false,onlineFrame:WorldSnapshot|undefined;
 const remoteView=createState();
 let state=createState(), input=zeroInput(), locked=false, disposed=false, accumulator=0,last=performance.now(),lastUI=0,lastDebugUI=0;let uiKey='';let lastMatchEpoch=-1,lastMatchId=-1;
 const cameraMotion=createCameraMotion();let cameraMotionEnabled=HEAD_BOB.enabled;
 const keys=new Set<string>();
 const buttons=createButtons(),networkButtons=new Set<number>();
 const update=()=>{
  const ping=online?.pingDisplay();
  const fingerprint=[state.screen.active,state.score,state.attempts,state.made,state.owner,state.phase,state.flightKind,Math.round(state.charge*50),Math.round(state.passCharge*50),state.message,state.playerMotion.action,state.playerMotion.currentDribbleHand,state.playerMotion.crossover?.stage,state.defense.kind,state.defense.result,Math.ceil(state.defense.cooldown*5),locked,debugVisible,performanceVisible,audio.ready,JSON.stringify(online?.latest?.match),Math.ceil((online?.matchRemainingMs??0)/1000),online?.latest?.ownerId,online?.connected,online?.status,ping?.ms,ping?.label,online?.latest?.players.map(a=>a.id+':'+a.score+':'+a.attempts+':'+a.nickname).join(',')].join('|');
  const now=performance.now(),debugDue=((process.env.NODE_ENV==='development'&&debugVisible)||performanceVisible)&&now-lastDebugUI>=200;
  if(fingerprint===uiKey&&!debugDue)return;uiKey=fingerprint;if(debugDue)lastDebugUI=now;
  onUpdate({screenActive:state.screen.active,...(performanceVisible?{diagnostics:{render:frameDiagnostics.text(),net:online?.diagnostics()}}:{}),audioReady:audio.ready,...(online?{online:{match:online.latest?.match?structuredClone(online.latest.match):null,remainingMs:online.matchRemainingMs,roomId:online.room.roomId,selfId:online.room.sessionId,ownerId:online.latest?.ownerId??null,players:online.latest?.players.map(a=>({id:a.id,nickname:a.nickname,score:online.latest?.match?.scores[a.id]??a.score,attempts:a.attempts,made:a.made}))??[],count:online.latest?.players.length??0,connected:online.connected,status:online.status,pingMs:ping?.ms??null,pingStatus:ping?.label}}:{}),practice:{...state.practice},defense:{...state.defense},...(process.env.NODE_ENV==='development'&&debugVisible?{debug:{render:frameDiagnostics.text()+`\nLOOPS ${liveRuntimes.get(canvas)??0}`,net:online?.diagnostics(),bodyMotion:`${state.locomotion.speed.toFixed(2)}m/s · gait ${state.locomotion.phase.toFixed(2)} · contacts ${state.locomotion.collision?.contacts.length??0} · recovery ${state.locomotion.collision?.safeReset?'SAFE':state.locomotion.collision?.recovered?'OVERLAP':'NONE'}`,defensePosition:`PLAYER ${state.player.x.toFixed(2)}, ${state.player.z.toFixed(2)} · BALL ${state.ball.x.toFixed(2)}, ${state.ball.y.toFixed(2)}, ${state.ball.z.toFixed(2)}`,visible:debugVisible,blocked:state.acquisitionBlock,event:state.acquisitionEvent,speed:Math.hypot(state.ballVelocity.x,state.ballVelocity.y,state.ballVelocity.z),touched:state.shotTouched,exited:state.shotExited,pass:state.lastPlayerPass,motion:{player:state.playerMotion.action,dummy:state.dummyMotion.action,locomotion:state.playerMotion.locomotion,phase:state.playerMotion.phase,period:1/state.playerMotion.rate,pending:!!state.playerMotion.pending,ballY:state.ball.y,ballCount:scene.meshes.filter(m=>m.name==='ball').length,playerJoints:playerCharacter.jointCount,dummyJoints:dummy?.jointCount??opponent?.jointCount??0,handError:Math.max(playerCharacter.handError(),dummy?.handError()??opponent?.handError()??0),shooting:characterPose(state,input,'player').shooting,kneeBend:characterPose(state,input,'player').legBend*2,playerY:state.player.y,hand:state.playerMotion.currentDribbleHand,crossover:state.playerMotion.crossover?.stage??'NONE',crossProgress:characterPose(state,input,'player').crossoverProgress,bodyYaw:state.playerMotion.dribbleYaw}}}:{}),owner:state.owner,passCharge:state.passCharge,flightKind:state.flightKind,aimingDummy:!online&&state.owner==='player'&&isAimingAtDummy(state,input),score:state.score,attempts:state.attempts,made:state.made,phase:state.phase,charge:state.charge,message:state.message,lastTiming:state.lastTiming,distance:Math.hypot(state.player.x,state.player.z-CFG.rim.z),locked});
 };

 function clear(reason='INPUT_CLEAR'){resetCameraMotion(cameraMotion);keys.clear();networkButtons.clear();if(!online){buttons.clear(state);state.screen.active=false;}input={...input,x:0,z:0,sprint:false,jump:false};online?.send(input,['cancel'],reason);}
 function reset(){if(online)return;net.reset();clearAudio();audioTimeline=new AudioTimeline();resetState(state);input=zeroInput();if(state.practice.mode==='BLOCK')input.yaw=Math.atan2(DUMMY.position.x-state.player.x,DUMMY.position.z-state.player.z);clear();update();}
 function scenario(mode:PracticeMode){if(locked||online)return;net.reset();clearAudio();audioTimeline=new AudioTimeline();clear();selectPractice(state,mode);input=zeroInput();if(mode==='BLOCK')input.yaw=Math.atan2(DUMMY.position.x-state.player.x,DUMMY.position.z-state.player.z);update();}
 function keydown(e:KeyboardEvent){if(e.code==='Escape'){clear('ESCAPE');update();}if(productionDiagnostics&&process.env.NODE_ENV!=='development'&&e.code==='F3'&&!e.repeat){e.preventDefault();performanceVisible=!performanceVisible;if(performanceVisible){frameDiagnostics.reset();online?.resetDiagnostics();}update();return;}if(process.env.NODE_ENV==='development'&&e.code==='F3'&&!e.repeat){e.preventDefault();debugVisible=!debugVisible;if(debugVisible){frameDiagnostics.reset();online?.resetDiagnostics();}for(const mesh of [...debugMeshes,...defenseMeshes])mesh.setEnabled(debugVisible);return;}if(!locked||online&&!online.canPlay)return;if(e.code==='KeyE'){e.preventDefault();if(!e.repeat&&!keys.has(e.code)){if(online)online.send(input,['screen']);else toggleScreen(state,input,fixedBodies(state.practice.mode,state.owner==='dummy'));}keys.add(e.code);update();return;}if(e.code==='KeyQ'){e.preventDefault();if(!e.repeat&&!keys.has(e.code)){if(online)online.send(input,['crossover']);else requestCrossover(state,e.repeat);}keys.add(e.code);update();return;}if(['Space','KeyW','KeyA','KeyS','KeyD','ShiftLeft','KeyR'].includes(e.code))e.preventDefault();if(e.code==='Space'&&!e.repeat){if(online)online.send(input,['jump']);else input.jump=true;}if(e.code==='KeyR'&&!e.repeat)reset();keys.add(e.code);}
 function keyup(e:KeyboardEvent){keys.delete(e.code);}
 function mousemove(e:MouseEvent){if(!locked)return;frameDiagnostics.mouse();input.yaw+=e.movementX*.002;input.pitch=Math.max(-1.2,Math.min(1.2,input.pitch+e.movementY*.002));}
 function down(e:MouseEvent){if(!locked)return;e.preventDefault();if(online){if(networkButtons.has(e.button))return;networkButtons.add(e.button);if(e.button===0)online.send(input,[online.ownsBall?'shotDown':'steal']);if(e.button===2)online.send(input,[online.ownsBall?'passDown':'block']);}else buttons.down(state,input,e.button);update();}
 function up(e:MouseEvent){if(online){if(locked&&networkButtons.delete(e.button)&&(e.button===0||e.button===2)){online.send(input,[e.button===0?'shotUp':'passUp']);resetCameraMotion(cameraMotion);}}else if(locked&&buttons.up(state,input,e.button))resetCameraMotion(cameraMotion);update();}
 function lockchange(){locked=document.pointerLockElement===canvas;clear(locked?'POINTER_LOCK_ACQUIRED':'POINTER_LOCK_LOST');last=performance.now();accumulator=0;update();}
 function blur(){audio.setHidden(true);clearAudio();clear(document.hidden?'HIDDEN':'BLUR');if(document.pointerLockElement===canvas)document.exitPointerLock();}
 function visibility(){audio.setHidden(document.hidden);clearAudio();if(document.hidden)blur();}
 function focus(){audio.setHidden(document.hidden);clearAudio();}
 function context(e:Event){e.preventDefault();}
 function resize(){engine.resize();}
 const listeners:[EventTarget,string,EventListener][]=[[window,'keydown',keydown as EventListener],[window,'keyup',keyup as EventListener],[window,'mousemove',mousemove as EventListener],[canvas,'mousedown',down as EventListener],[window,'mouseup',up as EventListener],[document,'pointerlockchange',lockchange],[window,'blur',blur],[canvas,'contextmenu',context],[window,'resize',resize],[document,'visibilitychange',visibility],[window,'focus',focus]];
 for(const[t,k,f]of listeners)t.addEventListener(k,f);
 // Keep network liveness independent of the renderer's frame cadence.
 if(online&&(process.env.NODE_ENV==='development'||productionDiagnostics))(window as unknown as {checkTheBallNetwork?:()=>unknown}).checkTheBallNetwork=()=>({...online.exportDiagnostics(),render:frameDiagnostics.metrics()});
 const inputTimer=online?window.setInterval(()=>{const active=locked&&!document.hidden;input.x=active?Number(keys.has('KeyD'))-Number(keys.has('KeyA')):0;input.z=active?Number(keys.has('KeyW'))-Number(keys.has('KeyS')):0;input.sprint=active&&(keys.has('ShiftLeft')||keys.has('ShiftRight'));online.advance(performance.now(),input);},1000/NETWORK.inputRate):undefined;
 liveRuntimes.set(canvas,(liveRuntimes.get(canvas)??0)+1);
 engine.runRenderLoop(()=>{if(disposed)return;const now=performance.now();const delta=Math.min(.1,(now-last)/1000);last=now;frameDiagnostics.begin(now,input.yaw,input.pitch);camera.rotation.set(input.pitch,input.yaw,0);
 if(online){const match=online.latest?.match;if(match&&lastMatchEpoch!==match.epoch){keys.clear();networkButtons.clear();input={...input,x:0,z:0,sprint:false,jump:false};lastMatchEpoch=match.epoch;if(lastMatchId!==match.id){lastMatchId=match.id;clearAudio();audioTimeline=new AudioTimeline();net.reset();}}if(match&&match.stage!=='PLAYING'&&locked&&document.pointerLockElement===canvas)document.exitPointerLock();if(!online.connected&&locked)document.exitPointerLock();input.x=locked?Number(keys.has('KeyD'))-Number(keys.has('KeyA')):0;input.z=locked?Number(keys.has('KeyW'))-Number(keys.has('KeyS')):0;input.sprint=locked&&(keys.has('ShiftLeft')||keys.has('ShiftRight'));
  const frame=online.sample(now);onlineFrame=frame;const self=online.self,other=frame?.players.find(a=>a.id!==online.room.sessionId);ball.setEnabled(!!frame);playerCharacter.root.setEnabled(!!self);opponent?.root.setEnabled(!!other);if(frame&&self){state=actorView(online.latest??frame,self,state);state.ball=frame.ball;
   if(online.ownsBall)state.ball=controlledPosition(state,input,'player');else if(online.latest?.revision!==frame.revision&&frame.ownerId===self.id)state.ball=online.latest?.ball??frame.ball;
  }if(frame&&other)opponent?.update(characterPose(actorView(frame,other,remoteView),other.input,'player'));online.prediction.visualStep(delta);
 }else if(locked&&!document.hidden){accumulator+=delta;input.x=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));input.z=Number(keys.has('KeyW'))-Number(keys.has('KeyS'));input.sprint=keys.has('ShiftLeft')||keys.has('ShiftRight');let steps=0;while(accumulator>=CFG.dt&&steps<6){stepGame(state,input);input.jump=false;accumulator-=CFG.dt;steps++;}}else accumulator=0;
 if(process.env.NODE_ENV==='development'&&debugVisible) acquisitionVolumes(state,input).forEach((v,i)=>{const mesh=acquisitionMeshes[i],c=i===0?ACQUISITION.ground:ACQUISITION.air;mesh.scaling.z=(v.size.z+COURT.ballRadius*2)/(c.maxForward-c.minForward+COURT.ballRadius*2);mesh.position.set(v.center.x,v.center.y,v.center.z);mesh.rotation.y=v.yaw;mesh.setEnabled(debugVisible&&v.active);});
 if(process.env.NODE_ENV==='development'&&debugVisible)defenseMeshes.forEach((mesh,i)=>{const kind=i===0?'STEAL':'BLOCK',p=defenseHand(state.player,input.yaw,kind,state.defense.kind===kind?state.defense.elapsed:(kind==='STEAL'?DEFENSE.steal.prepare:DEFENSE.block.prepare));mesh.position.set(p.x,p.y,p.z);mesh.setEnabled(debugVisible&&state.owner!=='player');});
 const bodies=online?[]:fixedBodies(state.practice.mode,state.owner==='dummy'),extras=(online?[]:fixedPeople(state.practice.mode,state.owner==='dummy')).filter(b=>b.id!=='dummy');
 fixedCharacters.forEach((rig,i)=>{const body=extras[i];rig.root.setEnabled(!!body);if(body)rig.update(characterPose(state,input,'dummy',{x:body.x,y:COURT.floorY,z:body.z,screen:body.screen}));});
 if(process.env.NODE_ENV==='development'&&debugVisible){
  const visible=online?.latest?.players.flatMap(a=>bodyShapes(a.id,a.position,a.screen))??[...bodyShapes('player',state.player,state.screen),...bodies];bodyMeshes.forEach((mesh,i)=>{const p=visible[i];mesh.setEnabled(debugVisible&&!!p);bodyRings[i].setEnabled(debugVisible&&!!p);if(p){mesh.position.set(p.x,COURT.floorY+BODY.height/2,p.z);bodyRings[i].position.set(p.x,COURT.floorY+.02,p.z);}});
  const collision=state.locomotion.collision;bodyNormals.forEach((ray,i)=>{const c=collision?.contacts[i],blocked=i===BODY.iterations?collision?.blocked:null,start=blocked?state.player:c?.point,normal=blocked??c?.normal,length=normal?Math.hypot(normal.x,normal.z):0;ray.setEnabled(debugVisible&&!!start&&length>BODY.tolerance);if(start&&normal&&length>BODY.tolerance)MeshBuilder.CreateLines('body-contact-'+i,{points:[new Vector3(start.x,.09,start.z),new Vector3(start.x+normal.x/length*.7,.09,start.z+normal.z/length*.7)],instance:ray},scene);});
 }
 playerCharacter.update(characterPose(state,input,'player'));
 const correction=online?.prediction.presentationOffset(now)??{x:0,y:0,z:0};playerCharacter.root.position.x+=correction.x;playerCharacter.root.position.y+=correction.y;playerCharacter.root.position.z+=correction.z;
 dummy?.update(state,state.owner==='player'&&isAimingAtDummy(state,input));
 advanceCameraMotion(cameraMotion,state,delta,cameraMotionEnabled,locked&&!document.hidden);
 const eye={x:state.player.x+correction.x,y:state.player.y+CFG.eye+correction.y,z:state.player.z+correction.z};
 let visualEye={x:eye.x+Math.cos(input.yaw)*cameraMotion.side,y:eye.y+cameraMotion.up,z:eye.z-Math.sin(input.yaw)*cameraMotion.side};
 if((cameraMotion.side!==0||cameraMotion.up!==0)&&!isBallPathClear(eye,visualEye)){resetCameraMotion(cameraMotion);visualEye=eye;}
 camera.position.set(visualEye.x,visualEye.y,visualEye.z);camera.rotation.set(input.pitch,input.yaw,0);const ballCorrection=online?.ownsBall?correction:{x:0,y:0,z:0};ball.position.copyFromFloats(state.ball.x+ballCorrection.x,state.ball.y+ballCorrection.y,state.ball.z+ballCorrection.z);if(state.phase==='IN_FLIGHT'||state.phase==='RESOLVING')ball.rotation.x+=delta*5;const eventTime=onlineFrame?.time??state.tick*1000/60,selfTime=online?.latest?.time??eventTime,selfId=online?.room.sessionId??'player';
 if(!online||online.latest&&onlineFrame)net.update(online?.latest?.events??state.events.recent,eventTime);
 audioTimeline.ingest(online?.latest?.events??state.events.recent,now);
 if(locked&&!document.hidden){
  for(const event of audioTimeline.drain(eventTime,selfTime,selfId))audio.play({key:`event:${event.eventId}`,actorId:event.actorId??undefined,kind:event.kind,position:event.position,strength:event.strength,near:event.actorId===selfId&&(event.kind==='jump'||event.kind==='land'||event.kind==='blockJump'||event.kind==='catch')},camera.position,input.yaw,now);
  const audible=[{id:selfId,position:state.player,vy:state.vy,motion:state.playerMotion,locomotion:state.locomotion,owns:state.owner==='player',grounded:state.player.y===0&&state.vy===0,near:true,block:state.defense.kind==='BLOCK'}];
  const remote=onlineFrame?.players.find(a=>a.id!==selfId);
  if(remote)audible.push({id:remote.id,position:remote.position,vy:remote.vy,motion:remote.motion,locomotion:remote.locomotion,owns:onlineFrame?.ownerId===remote.id,grounded:remote.position.y===0&&remote.vy===0,near:false,block:remote.defense.kind==='BLOCK'});
  if(!online)audible.push({id:'dummy',position:DUMMY.position,vy:0,motion:state.dummyMotion,locomotion:dummyLocomotion,owns:state.owner==='dummy',grounded:true,near:false,block:false});
  motionSounds.retain(audible.map(a=>a.id));for(const actor of audible)for(const cue of motionSounds.sample(actor,now,!online))audio.play(cue,camera.position,input.yaw,now);
 }else{audioTimeline.discard();motionSounds.clear();}
 scene.render();frameDiagnostics.end(performance.now(),camera.rotation.y,camera.rotation.x,input.yaw,input.pitch);online?.recordFrame(frameDiagnostics.lastFrameMs,performance.now()-now);if(now-lastUI>50){update();lastUI=now;}});
 update();
 return {reset,scenario,setAudio(settings:AudioSettings){audio.setSettings(settings);},unlockAudio(){void audio.unlock().then(()=>{if(!disposed)update();});},setCameraMotion(enabled:boolean){cameraMotionEnabled=enabled;resetCameraMotion(cameraMotion);camera.position.set(state.player.x,state.player.y+CFG.eye,state.player.z);},async start(){clearAudio();audioTimeline=new AudioTimeline();audioTimeline.ingest(online?.latest?.events??state.events.recent,performance.now());void audio.unlock().then(()=>{if(!disposed)update();});try{await canvas.requestPointerLock();}catch{onError('마우스를 잠글 수 없습니다. 새 탭에서 게임을 열고 다시 눌러주세요.');}},dispose(){if(disposed)return;disposed=true;clearAudio();audio.dispose();liveRuntimes.set(canvas,Math.max(0,(liveRuntimes.get(canvas)??1)-1));if(inputTimer!==undefined)window.clearInterval(inputTimer);if(online)delete (window as unknown as {checkTheBallNetwork?:()=>unknown}).checkTheBallNetwork;if(document.pointerLockElement===canvas)document.exitPointerLock();for(const[t,k,f]of listeners)t.removeEventListener(k,f);engine.stopRenderLoop();scene.dispose();engine.dispose();}};
}
