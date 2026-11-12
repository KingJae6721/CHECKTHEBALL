import {ArcRotateCamera,Color3,Color4,DirectionalLight,Engine,HemisphericLight,MeshBuilder,Scene,SceneInstrumentation,StandardMaterial,UniversalCamera,Vector3} from '@babylonjs/core';
import {createCharacter,type CharacterAppearance} from './createCharacter';
import {characterPose,requestCrossover} from '../../../packages/game-core/src/motion';
import {createState,stepGame,zeroInput,startCharge,releaseShot,startPassCharge,releasePass,giveBall,CFG} from '../../../packages/game-core/src/simulation';
import {startDefense} from '../../../packages/game-core/src/defense';
import {toggleScreen} from '../../../packages/game-core/src/screen';
import {COURT} from '../../../packages/game-core/src/court';
import {Samples} from '../../../packages/protocol/src/diagnostics';
export const PREVIEW_POSES=['IDLE','WALK','RUN','JUMP','DRIBBLE_RIGHT','DRIBBLE_LEFT','CROSSOVER','GATHER','SHOT_CHARGE','SHOT','JUMP_SHOT','PASS_CHARGE','PASS','CATCH','DEFENSE','STEAL','BLOCK','SCREEN'] as const;
type PoseName=typeof PREVIEW_POSES[number];
export type PreviewConfig={appearance:CharacterAppearance|'hidden';count:1|2|8;pose:PoseName;view:'front'|'side'|'back'|'firstPerson';pitch:number;paused:boolean;time:number};
export function createCharacterPreview(canvas:HTMLCanvasElement){
 const engine=new Engine(canvas,true);engine.setHardwareScalingLevel(1);let scene:Scene,instrument:SceneInstrumentation,rigs:ReturnType<typeof createCharacter>[]=[],states:ReturnType<typeof createState>[]=[],balls:ReturnType<typeof MeshBuilder.CreateSphere>[]=[],inputs:ReturnType<typeof zeroInput>[]=[],clock=0,accumulator=0,last=performance.now(),frameCount=0;
 let config:PreviewConfig={appearance:'minimal',count:1,pose:'IDLE',view:'front',pitch:0,paused:false,time:0};const frames=new Samples(600),cpu=new Samples(600);
 function seed(){states=Array.from({length:config.count},()=>{const s=createState(),p=config.pose;
  if(['IDLE','WALK','RUN','JUMP','DEFENSE','STEAL','BLOCK','SCREEN'].includes(p)){s.owner='none';s.ball={x:6,y:100,z:4};s.phase='RESOLVING';s.practice.mode='STEAL';}
  if(p==='DRIBBLE_LEFT')s.playerMotion.currentDribbleHand='left';
  if(['GATHER','SHOT_CHARGE','SHOT','JUMP_SHOT'].includes(p))startCharge(s);
  if(['PASS_CHARGE','PASS'].includes(p))startPassCharge(s);
  if(p==='CATCH')giveBall(s,'player',{x:.5,y:.45,z:-.8});
  if(p==='STEAL')startDefense(s,zeroInput(),'STEAL');if(p==='BLOCK')startDefense(s,zeroInput(),'BLOCK');if(p==='SCREEN')toggleScreen(s,zeroInput(),[]);
  return s;});inputs=states.map(()=>({...zeroInput(),pitch:config.pitch}));clock=0;
 }
 function step(){const before=clock;clock+=CFG.dt;states.forEach((s,i)=>{const p=config.pose,input=inputs[i];s.player.x=0;s.player.z=-1.5;input.x=p==='WALK'?.25:0;input.z=p==='WALK'||p==='RUN'?1:0;input.sprint=p==='RUN';input.jump=(p==='JUMP'||p==='JUMP_SHOT')&&before<.35&&clock>=.35;
  if(p==='CROSSOVER'&&before<.12&&clock>=.12)requestCrossover(s);
  if((p==='SHOT'||p==='JUMP_SHOT')&&before<.7&&clock>=.7)releaseShot(s,input);
  if(p==='PASS'&&before<.7&&clock>=.7)releasePass(s,input);
  stepGame(s,input);input.jump=false;
 });}
 function display(){states.forEach((s,i)=>{const pose=characterPose(s,inputs[i],'player'),x=config.count===1?0:(i%4-(Math.min(config.count,4)-1)/2)*1.4,z=config.count<=4?0:Math.floor(i/4)*1.7;
  const dx=x-pose.position.x,dz=z-pose.position.z;pose.position.x+=dx;pose.position.z+=dz;for(const p of [pose.rightHand,pose.leftHand]){p.x+=dx;p.z+=dz;}if(pose.ballSocket){pose.ballSocket.x+=dx;pose.ballSocket.z+=dz;}
  rigs[i].update(pose);balls[i].setEnabled(s.owner==='player');balls[i].position.set(s.ball.x+dx,s.ball.y,s.ball.z+dz);
  if(config.view==='firstPerson'){scene.activeCamera!.position.set(x,pose.position.y+CFG.eye,z);(scene.activeCamera as UniversalCamera).rotation.set(config.pitch,0,0);}
 });}
 function build(){scene?.dispose();scene=new Scene(engine);scene.clearColor=new Color4(.065,.09,.12,1);const h=new HemisphericLight('sky',Vector3.Up(),scene);h.intensity=.85;h.groundColor=new Color3(.18,.22,.25);const sun=new DirectionalLight('sun',new Vector3(-.4,-1,.5),scene);sun.intensity=1.25;sun.diffuse=new Color3(1,.89,.72);
  if(config.view==='firstPerson'){const c=new UniversalCamera('first-person',new Vector3(0,CFG.eye,0),scene);c.inputs.clear();c.minZ=.06;c.fov=1.22;scene.activeCamera=c;}else{const alpha=config.view==='front'?Math.PI/2:config.view==='back'?-Math.PI/2:0,c=new ArcRotateCamera('comparison',alpha,1.40,config.count===8?8:4.8,new Vector3(0,1.4,config.count===8?.8:0),scene);c.minZ=.03;scene.activeCamera=c;}
  const floor=MeshBuilder.CreateGround('floor',{width:20,height:20},scene),fm=new StandardMaterial('floor',scene);fm.diffuseColor=Color3.FromHexString('#3f5553');floor.material=fm;floor.position.y=COURT.floorY;
  const bm=new StandardMaterial('ball',scene);bm.diffuseColor=Color3.FromHexString('#db762c');
  rigs=Array.from({length:config.count},(_,i)=>createCharacter(scene,{name:'preview-'+i,firstPerson:config.view==='firstPerson',appearance:config.appearance==='legacy'?'legacy':'minimal'}));for(const r of rigs)r.root.setEnabled(config.appearance!=='hidden');
  balls=rigs.map((_,i)=>{const m=MeshBuilder.CreateSphere('ball-'+i,{diameter:COURT.ballRadius*2,segments:12},scene);m.material=bm;return m;});instrument=new SceneInstrumentation(scene);seed();for(let t=0;t<config.time-CFG.dt/2;t+=CFG.dt)step();display();frames.clear();cpu.clear();frameCount=0;accumulator=0;last=performance.now();
 }
 function configure(next:Partial<PreviewConfig>){config={...config,...next};build();}
 build();
 engine.runRenderLoop(()=>{const now=performance.now(),dt=Math.min(.1,(now-last)/1000);frames.add(now-last);last=now;
  if(!config.paused){accumulator+=dt;while(accumulator>=CFG.dt){if(clock>=1.6&&!['IDLE','SHOT_CHARGE','PASS_CHARGE','GATHER','DRIBBLE_RIGHT','DRIBBLE_LEFT','DEFENSE','SCREEN','WALK','RUN'].includes(config.pose))seed();step();accumulator-=CFG.dt;}}
  display();const started=performance.now();scene.render();cpu.add(performance.now()-started);frameCount++;
 });
 const resize=()=>engine.resize();window.addEventListener('resize',resize);
 function metrics(){const meshes=rigs.flatMap(r=>r.meshes),geometries=new Set(meshes.map(m=>m.geometry).filter(Boolean));return {config:{...config},frames:frameCount,frameMs:frames.summary(),renderCpuMs:cpu.summary(),drawCalls:instrument.drawCallsCounter.current,characterMeshes:meshes.length,enabledCharacterMeshes:meshes.filter(m=>m.isEnabled()).length,gpuSkinnedMeshes:meshes.filter(m=>m.skeleton&&m.computeBonesUsingShaders).length,materials:new Set(meshes.map(m=>m.material)).size,verticesInstanced:rigs.reduce((n,r)=>n+[...new Set(r.meshes.map(m=>m.geometry).filter(Boolean))].reduce((a,g)=>a+g!.getTotalVertices(),0),0),trianglesInstanced:meshes.reduce((n,m)=>n+(m.subMeshes?.reduce((a,s)=>a+s.indexCount,0)??0)/3,0),uniqueGeometryVertices:[...geometries].reduce((n,g)=>n+g!.getTotalVertices(),0),bones:rigs.reduce((n,r)=>n+(r.skeleton?.bones.length??0),0),handError:Math.max(...rigs.map(r=>r.handError())),gpuTimeMs:null,gpuTimeNote:'not measured'};}
 return {configure,metrics,resetStats(){frames.clear();cpu.clear();frameCount=0;},dispose(){window.removeEventListener('resize',resize);engine.stopRenderLoop();scene.dispose();engine.dispose();}};
}
