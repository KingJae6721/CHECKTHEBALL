import {createCharacterRig} from './characterRig';
import { Color3, Mesh, MeshBuilder, Quaternion, Scene, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import { CHARACTER, DUMMY, GAIT } from '../../../packages/game-core/src/court';
import type { CharacterPose } from '../../../packages/game-core/src/motion';

// Display adapter only. No meshes/sockets are used to decide gameplay.
export function createLegacyCharacter(scene:Scene,options:{name:string;firstPerson:boolean}) {
  const prefix=options.name,rig=createCharacterRig(scene,prefix),{root,joints}=rig;
  const material=(name:string,hex:string)=>{const m=new StandardMaterial(prefix+':'+name,scene);m.diffuseColor=Color3.FromHexString(hex);m.specularColor=new Color3(.12,.12,.12);return m;};
  const uniform=material('uniform',options.firstPerson?'#475f69':'#8fbfb4'),skin=material('skin','#d8b08b'),trousers=material('trousers','#283d48'),shoe=material('shoe','#1d2b33');
  const box=(name:string,parent:TransformNode,width:number,height:number,depth:number,x:number,y:number,z:number,mat:StandardMaterial,body=false)=>{
    const mesh=MeshBuilder.CreateBox(prefix+':'+name,{width,height,depth},scene);mesh.parent=parent;mesh.position.set(x,y,z);mesh.material=mat;mesh.isPickable=false;if(body&&options.firstPerson)mesh.setEnabled(false);return mesh;
  };
  const sphere=(name:string,parent:TransformNode,radius:number,mat:StandardMaterial,body=false)=>{const mesh=MeshBuilder.CreateSphere(prefix+':'+name,{diameter:radius*2,segments:12},scene);mesh.parent=parent;mesh.material=mat;mesh.isPickable=false;if(body&&options.firstPerson)mesh.setEnabled(false);return mesh;};
  const pelvis=joints['pelvis'];
  const pelvisMesh=box('pelvis-mesh',pelvis,DUMMY.torsoWidth*.95,CHARACTER.pelvisHeight,DUMMY.torsoDepth,0,0,0,trousers);
  const torso=joints['torso'];
  const torsoMesh=box('torso-mesh',torso,DUMMY.torsoWidth,DUMMY.torsoHeight,DUMMY.torsoDepth,0,0,0,uniform);
  const neck=joints['neck'];
  const neckMesh=MeshBuilder.CreateCylinder(prefix+':neck-mesh',{height:DUMMY.neckHeight,diameter:DUMMY.neckRadius*2},scene);neckMesh.parent=neck;neckMesh.material=skin;neckMesh.isPickable=false;neckMesh.setEnabled(!options.firstPerson);
  const head=joints.head;sphere('head-mesh',head,DUMMY.headRadius,skin,true);

  const legs:TransformNode[]=[];let bodyVisible=true;
  for(const side of [-1,1]) {
    const name=side===1?'right':'left';
    const shoulder=joints[name+'Shoulder'];
    sphere(name+'Shoulder-mesh',shoulder,CHARACTER.jointRadius,uniform);
    box(name+'UpperArm',shoulder,DUMMY.armWidth,CHARACTER.upperArm,DUMMY.armWidth,0,-CHARACTER.upperArm/2,0,uniform);
    const elbow=joints[name+'Elbow'];
    sphere(name+'Elbow-mesh',elbow,CHARACTER.jointRadius,skin);
    box(name+'Forearm',elbow,DUMMY.armWidth*.85,CHARACTER.forearm,DUMMY.armWidth*.85,0,-CHARACTER.forearm/2,0,skin);
    const wrist=joints[name+'Wrist'];
    box(name+'Hand',wrist,CHARACTER.handWidth,CHARACTER.handLength,CHARACTER.handWidth*.65,0,-CHARACTER.handLength/2,0,skin);
    const hip=joints[name+'Hip'];
    legs.push(hip);
    sphere(name+'Hip-mesh',hip,CHARACTER.kneeRadius,trousers);
    box(name+'UpperLeg',hip,DUMMY.legWidth,CHARACTER.upperLeg,DUMMY.legDepth,0,-CHARACTER.upperLeg/2,0,trousers);
    const knee=joints[name+'Knee'];sphere(name+'Knee-mesh',knee,CHARACTER.kneeRadius,trousers);
    box(name+'LowerLeg',knee,DUMMY.legWidth*.9,CHARACTER.lowerLeg,DUMMY.legDepth*.9,0,-CHARACTER.lowerLeg/2,0,trousers);
    const ankle=joints[name+'Ankle'];
    box(name+'Foot',ankle,CHARACTER.footWidth,CHARACTER.footHeight,CHARACTER.footLength,0,-CHARACTER.footHeight/2,.035,shoe);
  }
  function update(pose:CharacterPose){rig.update(pose);const showBody=!pose.attacking;if(options.firstPerson&&bodyVisible!==showBody){bodyVisible=showBody;pelvisMesh.setEnabled(showBody);torsoMesh.setEnabled(showBody);for(const leg of legs)leg.setEnabled(showBody);}}
 return {...rig,update,meshes:root.getChildMeshes(false),skeleton:null};
}
