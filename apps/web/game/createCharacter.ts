import { Color3, Mesh, MeshBuilder, Quaternion, Scene, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import { CHARACTER, DUMMY, GAIT } from '../../../packages/game-core/src/court';
import type { CharacterPose } from '../../../packages/game-core/src/motion';

// Display adapter only. No meshes/sockets are used to decide gameplay.
export function createCharacter(scene:Scene,options:{name:string;firstPerson:boolean}) {
  const prefix=options.name,root=new TransformNode(prefix+':root',scene);
  const joints:Record<string,TransformNode>={root};
  const joint=(name:string,parent:TransformNode,x=0,y=0,z=0)=>{const node=new TransformNode(prefix+':'+name,scene);node.parent=parent;node.position.set(x,y,z);joints[name]=node;return node;};
  const material=(name:string,hex:string)=>{const m=new StandardMaterial(prefix+':'+name,scene);m.diffuseColor=Color3.FromHexString(hex);m.specularColor=new Color3(.12,.12,.12);return m;};
  const uniform=material('uniform',options.firstPerson?'#475f69':'#8fbfb4'),skin=material('skin','#d8b08b'),trousers=material('trousers','#283d48'),shoe=material('shoe','#1d2b33');
  const box=(name:string,parent:TransformNode,width:number,height:number,depth:number,x:number,y:number,z:number,mat:StandardMaterial,body=false)=>{
    const mesh=MeshBuilder.CreateBox(prefix+':'+name,{width,height,depth},scene);mesh.parent=parent;mesh.position.set(x,y,z);mesh.material=mat;mesh.isPickable=false;if(body&&options.firstPerson)mesh.setEnabled(false);return mesh;
  };
  const sphere=(name:string,parent:TransformNode,radius:number,mat:StandardMaterial,body=false)=>{const mesh=MeshBuilder.CreateSphere(prefix+':'+name,{diameter:radius*2,segments:12},scene);mesh.parent=parent;mesh.material=mat;mesh.isPickable=false;if(body&&options.firstPerson)mesh.setEnabled(false);return mesh;};
  const pelvis=joint('pelvis',root,0,CHARACTER.pelvisY);
  box('pelvis-mesh',pelvis,DUMMY.torsoWidth*.95,CHARACTER.pelvisHeight,DUMMY.torsoDepth,0,0,0,trousers);
  const torso=joint('torso',pelvis,0,DUMMY.torsoY-CHARACTER.pelvisY);
  box('torso-mesh',torso,DUMMY.torsoWidth,DUMMY.torsoHeight,DUMMY.torsoDepth,0,0,0,uniform);
  const neck=joint('neck',torso,0,DUMMY.neckY-DUMMY.torsoY);
  const neckMesh=MeshBuilder.CreateCylinder(prefix+':neck-mesh',{height:DUMMY.neckHeight,diameter:DUMMY.neckRadius*2},scene);neckMesh.parent=neck;neckMesh.material=skin;neckMesh.isPickable=false;neckMesh.setEnabled(!options.firstPerson);
  const head=joint('head',neck,0,DUMMY.headY-DUMMY.neckY);sphere('head-mesh',head,DUMMY.headRadius,skin,true);
  const arms:{side:number;shoulder:TransformNode;elbow:TransformNode;wrist:TransformNode;socket:TransformNode}[]=[];
  for(const side of [-1,1]) {
    const name=side===1?'right':'left';
    const shoulder=joint(name+'Shoulder',torso,side*CHARACTER.shoulderX,CHARACTER.shoulderY-DUMMY.torsoY);
    sphere(name+'Shoulder-mesh',shoulder,CHARACTER.jointRadius,uniform);
    box(name+'UpperArm',shoulder,DUMMY.armWidth,CHARACTER.upperArm,DUMMY.armWidth,0,-CHARACTER.upperArm/2,0,uniform);
    const elbow=joint(name+'Elbow',shoulder,0,-CHARACTER.upperArm);
    sphere(name+'Elbow-mesh',elbow,CHARACTER.jointRadius,skin);
    box(name+'Forearm',elbow,DUMMY.armWidth*.85,CHARACTER.forearm,DUMMY.armWidth*.85,0,-CHARACTER.forearm/2,0,skin);
    const wrist=joint(name+'Wrist',elbow,0,-CHARACTER.forearm);
    box(name+'Hand',wrist,CHARACTER.handWidth,CHARACTER.handLength,CHARACTER.handWidth*.65,0,-CHARACTER.handLength/2,0,skin);
    const socket=new TransformNode(prefix+':'+name+'HandSocket',scene);socket.parent=wrist;socket.position.y=-CHARACTER.handLength/2;
    arms.push({side,shoulder,elbow,wrist,socket});
    const hip=joint(name+'Hip',pelvis,side*DUMMY.legX,0);
    sphere(name+'Hip-mesh',hip,CHARACTER.kneeRadius,trousers);
    box(name+'UpperLeg',hip,DUMMY.legWidth,CHARACTER.upperLeg,DUMMY.legDepth,0,-CHARACTER.upperLeg/2,0,trousers);
    const knee=joint(name+'Knee',hip,0,-CHARACTER.upperLeg);sphere(name+'Knee-mesh',knee,CHARACTER.kneeRadius,trousers);
    box(name+'LowerLeg',knee,DUMMY.legWidth*.9,CHARACTER.lowerLeg,DUMMY.legDepth*.9,0,-CHARACTER.lowerLeg/2,0,trousers);
    const ankle=joint(name+'Ankle',knee,0,-CHARACTER.lowerLeg);
    box(name+'Foot',ankle,CHARACTER.footWidth,CHARACTER.footHeight,CHARACTER.footLength,0,-CHARACTER.footHeight/2,.035,shoe);
  }
  const down=new Vector3(0,-1,0);
  const rotation=(direction:Vector3)=>{const q=new Quaternion();Quaternion.FromUnitVectorsToRef(down,direction.normalize(),q);return q;};
  let lastPose:CharacterPose|null=null;
  function update(pose:CharacterPose) {
    lastPose=pose;
    root.position.set(pose.position.x,pose.position.y,pose.position.z);root.rotation.set(0,pose.yaw,0);
    pelvis.position.set(pose.pelvisSway,CHARACTER.pelvisY-pose.pelvisDrop,-pose.pelvisBack);
    // Aim with the arms, without rotating the torso around the camera eye.
    // Shared by the first-person body and the remote/full-body character.
    torso.position.set(pose.torsoSide-pose.pelvisSway,DUMMY.torsoY-CHARACTER.pelvisY+pose.shoulderLift,0);
    torso.rotation.x=0;
    for(const side of ['left','right']){
      const sign=side==='right'?1:-1,air=pose.airborne?GAIT.airBend*(1-pose.shooting):0;
      const hip=-pose.legBend+sign*pose.step*pose.stepForward-air,sideAngle=sign*pose.step*pose.stepSide;
      const lift=GAIT.footLift*Math.max(0,sign*Math.sin(pose.gaitPhase))*pose.gaitBlend;
      let knee=2*(pose.legBend+air);
      if(pose.gaitBlend>0){const vertical=(CHARACTER.pelvisY-pose.pelvisDrop-CHARACTER.footHeight-lift)/Math.max(.7,Math.cos(sideAngle));const lowerCos=(vertical-CHARACTER.upperLeg*Math.cos(hip))/CHARACTER.lowerLeg;knee=Math.max(0,Math.min(1.5,Math.acos(Math.max(-1,Math.min(1,lowerCos)))-hip));}
      joints[side+'Hip'].rotation.set(hip,0,sideAngle);joints[side+'Knee'].rotation.set(knee,0,0);joints[side+'Ankle'].rotation.set(-hip-knee,0,-sideAngle);
    }
    const origin=new Vector3(pose.position.x-Math.sin(pose.yaw)*pose.pelvisBack,pose.position.y-pose.pelvisDrop+pose.shoulderLift,pose.position.z-Math.cos(pose.yaw)*pose.pelvisBack);
    origin.x+=Math.cos(pose.yaw)*pose.torsoSide;origin.z-=Math.sin(pose.yaw)*pose.torsoSide;
    const toLocal=(p:{x:number;y:number;z:number})=>{const x=p.x-origin.x,y=p.y-origin.y,z=p.z-origin.z;return new Vector3(x*Math.cos(pose.yaw)-z*Math.sin(pose.yaw),y,x*Math.sin(pose.yaw)+z*Math.cos(pose.yaw));};
    for(const arm of arms) {
      const palm=toLocal(arm.side===1?pose.rightHand:pose.leftHand),s=new Vector3(arm.side*CHARACTER.shoulderX,CHARACTER.shoulderY,0);
      const flex=arm.side===1?pose.rightWrist:pose.leftWrist;
      const handAxis=palm.subtract(s);handAxis.y-=flex*.09;handAxis.z+=flex*.04;handAxis.normalize();
      const wristTarget=palm.subtract(handAxis.scale(CHARACTER.handLength/2));
      const delta=wristTarget.subtract(s),distance=Math.max(.001,Math.min(CHARACTER.upperArm+CHARACTER.forearm-.0001,delta.length())),dir=delta.normalize();
      const hint=pose.shooting>.1?new Vector3(arm.side*.02,-1,.25):new Vector3(arm.side*.12,-1,-.35),bend=hint.subtract(dir.scale(Vector3.Dot(hint,dir)));
      if(bend.lengthSquared()<1e-8)bend.set(0,0,-1);bend.normalize();
      const along=(CHARACTER.upperArm**2-CHARACTER.forearm**2+distance**2)/(2*distance),height=Math.sqrt(Math.max(0,CHARACTER.upperArm**2-along**2));
      const elbow=s.add(dir.scale(along)).add(bend.scale(height)),wrist=s.add(dir.scale(distance));
      const upper=rotation(elbow.subtract(s)),lower=rotation(wrist.subtract(elbow)),hand=rotation(handAxis);
      arm.shoulder.rotationQuaternion=upper;arm.elbow.rotationQuaternion=upper.conjugate().multiply(lower);arm.wrist.rotationQuaternion=lower.conjugate().multiply(hand);
    }
  }
  function handError() {
    if(!lastPose)return 0;root.computeWorldMatrix(true);let error=0;
    for(const arm of arms){arm.socket.computeWorldMatrix(true);const target=arm.side===1?lastPose.rightHand:lastPose.leftHand;error=Math.max(error,Vector3.Distance(arm.socket.getAbsolutePosition(),new Vector3(target.x,target.y,target.z)));}return error;
  }
  return {root,joints,handSockets:arms.map(a=>a.socket),jointCount:Object.keys(joints).length,update,handError};
}
