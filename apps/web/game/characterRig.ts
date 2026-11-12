import {Quaternion,Scene,TransformNode,Vector3} from '@babylonjs/core';
import {CHARACTER,DUMMY,GAIT} from '../../../packages/game-core/src/court';
import type {CharacterPose} from '../../../packages/game-core/src/motion';
// The sole display coordinate/rotation adapter. Never feeds gameplay state.
export function createCharacterRig(scene:Scene,prefix:string){
 const root=new TransformNode(prefix+':root',scene),joints:Record<string,TransformNode>={root},correctives:Record<string,TransformNode>={};
 const joint=(name:string,parent:TransformNode,x=0,y=0,z=0)=>{const n=new TransformNode(prefix+':'+name,scene);n.parent=parent;n.position.set(x,y,z);joints[name]=n;return n;};
 const pelvis=joint('pelvis',root,0,CHARACTER.pelvisY),torso=joint('torso',pelvis,0,DUMMY.torsoY-CHARACTER.pelvisY),neck=joint('neck',torso,0,DUMMY.neckY-DUMMY.torsoY);joint('head',neck,0,DUMMY.headY-DUMMY.neckY);
 const arms:{side:number;shoulder:TransformNode;elbow:TransformNode;wrist:TransformNode;socket:TransformNode}[]=[],legs:TransformNode[]=[];
 const bend=(name:string,parent:TransformNode,y:number)=>{const n=new TransformNode(prefix+':'+name,scene);n.parent=parent;n.position.y=y;n.rotationQuaternion=Quaternion.Identity();correctives[name]=n;};
 for(const side of [-1,1]){const name=side===1?'right':'left',shoulder=joint(name+'Shoulder',torso,side*CHARACTER.shoulderX,CHARACTER.shoulderY-DUMMY.torsoY),elbow=joint(name+'Elbow',shoulder,0,-CHARACTER.upperArm),wrist=joint(name+'Wrist',elbow,0,-CHARACTER.forearm);
  const socket=new TransformNode(prefix+':'+name+'HandSocket',scene);socket.parent=wrist;socket.position.y=-CHARACTER.handLength/2;arms.push({side,shoulder,elbow,wrist,socket});
  const hip=joint(name+'Hip',pelvis,side*DUMMY.legX);legs.push(hip);const knee=joint(name+'Knee',hip,0,-CHARACTER.upperLeg);joint(name+'Ankle',knee,0,-CHARACTER.lowerLeg);
  bend(name+'ElbowBend',shoulder,-CHARACTER.upperArm);bend(name+'KneeBend',hip,-CHARACTER.upperLeg);
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
      const hip=-pose.legBend+sign*pose.step*pose.stepForward-air,sideAngle=sign*(pose.step*pose.stepSide+pose.legSpread);
      const lift=GAIT.footLift*Math.max(0,sign*Math.sin(pose.gaitPhase))*pose.gaitBlend;
      let knee=2*(pose.legBend+air);
      if(pose.gaitBlend>0){const vertical=(CHARACTER.pelvisY-pose.pelvisDrop-CHARACTER.footHeight-lift)/Math.max(.7,Math.cos(sideAngle));const lowerCos=(vertical-CHARACTER.upperLeg*Math.cos(hip))/CHARACTER.lowerLeg;knee=Math.max(0,Math.min(1.5,Math.acos(Math.max(-1,Math.min(1,lowerCos)))-hip));}
      joints[side+'Hip'].rotation.set(hip,0,sideAngle);joints[side+'Knee'].rotation.set(knee,0,0);joints[side+'Ankle'].rotation.set(-hip-knee,0,-sideAngle);
      Quaternion.RotationYawPitchRollToRef(0,knee*.5,0,correctives[side+'KneeBend'].rotationQuaternion!);
    }
    const origin=new Vector3(pose.position.x-Math.sin(pose.yaw)*pose.pelvisBack,pose.position.y-pose.pelvisDrop+pose.shoulderLift,pose.position.z-Math.cos(pose.yaw)*pose.pelvisBack);
    origin.x+=Math.cos(pose.yaw)*pose.torsoSide;origin.z-=Math.sin(pose.yaw)*pose.torsoSide;
    const toLocal=(p:{x:number;y:number;z:number})=>{const x=p.x-origin.x,y=p.y-origin.y,z=p.z-origin.z;return new Vector3(x*Math.cos(pose.yaw)-z*Math.sin(pose.yaw),y,x*Math.sin(pose.yaw)+z*Math.cos(pose.yaw));};
    for(const arm of arms) {
      const palm=toLocal(arm.side===1?pose.rightHand:pose.leftHand),s=new Vector3(arm.side*CHARACTER.shoulderX,CHARACTER.shoulderY,0);
      const flex=arm.side===1?pose.rightWrist:pose.leftWrist;
      const handAxis=palm.subtract(s);
      if(arm.side===1&&pose.shooting>0){
        // In the yaw-only body frame +X is right, +Z is forward.
        // Negative angles cock the raised hand back; positive angles snap it forward.
        // Offset the wrist target from this axis so the palm socket stays at the core target.
        handAxis.normalize();const y=handAxis.y,z=handAxis.z;
        handAxis.y=y*Math.cos(flex)-z*Math.sin(flex);
        handAxis.z=y*Math.sin(flex)+z*Math.cos(flex);
      }else{handAxis.y-=flex*.09;handAxis.z+=flex*.04;handAxis.normalize();}
      const wristTarget=palm.subtract(handAxis.scale(CHARACTER.handLength/2));
      const delta=wristTarget.subtract(s),distance=Math.max(.001,Math.min(CHARACTER.upperArm+CHARACTER.forearm-.0001,delta.length())),dir=delta.normalize();
      const hint=pose.screening>.1?new Vector3(arm.side*.6,-.6,.15):pose.shooting>.1?new Vector3(arm.side*.02,-1,.25):new Vector3(arm.side*.12,-1,-.35),bend=hint.subtract(dir.scale(Vector3.Dot(hint,dir)));
      if(bend.lengthSquared()<1e-8)bend.set(0,0,-1);bend.normalize();
      const along=(CHARACTER.upperArm**2-CHARACTER.forearm**2+distance**2)/(2*distance),height=Math.sqrt(Math.max(0,CHARACTER.upperArm**2-along**2));
      const elbow=s.add(dir.scale(along)).add(bend.scale(height)),wrist=s.add(dir.scale(distance));
      const upper=rotation(elbow.subtract(s)),lower=rotation(wrist.subtract(elbow)),hand=rotation(handAxis);
      arm.shoulder.rotationQuaternion=upper;arm.elbow.rotationQuaternion=upper.conjugate().multiply(lower);arm.wrist.rotationQuaternion=lower.conjugate().multiply(hand);
      Quaternion.SlerpToRef(Quaternion.Identity(),arm.elbow.rotationQuaternion,.5,correctives[(arm.side===1?'right':'left')+'ElbowBend'].rotationQuaternion!);
    }
  }
  function handError() {
    if(!lastPose)return 0;root.computeWorldMatrix(true);let error=0;
    for(const arm of arms){arm.socket.computeWorldMatrix(true);const target=arm.side===1?lastPose.rightHand:lastPose.leftHand;error=Math.max(error,Vector3.Distance(arm.socket.getAbsolutePosition(),new Vector3(target.x,target.y,target.z)));}return error;
  }
 return {root,joints,correctives,arms,legs,jointCount:Object.keys(joints).length,handSockets:arms.map(a=>a.socket),update,handError};
}
