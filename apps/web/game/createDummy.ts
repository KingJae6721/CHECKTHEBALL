import {fixedPeople,isBodyCollisionPractice} from '../../../packages/game-core/src/bodies';
import { createCharacter } from './createCharacter';
import { characterPose } from '../../../packages/game-core/src/motion';
import { Color3, DynamicTexture, Mesh, MeshBuilder, Scene, StandardMaterial } from '@babylonjs/core';
import { DUMMY, COURT } from '../../../packages/game-core/src/court';
import { zeroInput, type State } from '../../../packages/game-core/src/simulation';

export function createDummy(scene: Scene) {
  const character=createCharacter(scene,{name:'dummy',firstPerson:false});
  const markerMaterial=new StandardMaterial('partner-marker',scene);markerMaterial.diffuseColor=Color3.FromHexString('#c7e89c');markerMaterial.emissiveColor=markerMaterial.diffuseColor.scale(.4);
  const marker=MeshBuilder.CreateTorus('partner-floor-marker',{diameter:DUMMY.markerRadius*2,thickness:DUMMY.markerThickness,tessellation:48},scene);marker.position.set(DUMMY.position.x,COURT.floorY+.02,DUMMY.position.z);marker.material=markerMaterial;
  const labelTexture=new DynamicTexture('partner-name',{width:512,height:96},scene,false);labelTexture.hasAlpha=true;labelTexture.drawText('PASS PARTNER',null,64,'bold 42px sans-serif','#eaf2d5','transparent',true);
  const labelMaterial=new StandardMaterial('partner-name-material',scene);labelMaterial.diffuseTexture=labelTexture;labelMaterial.useAlphaFromDiffuseTexture=true;labelMaterial.emissiveColor=Color3.White();labelMaterial.disableLighting=true;labelMaterial.backFaceCulling=false;
  const label=MeshBuilder.CreatePlane('partner-name',{width:DUMMY.labelWidth,height:DUMMY.labelHeight},scene);label.position.set(DUMMY.position.x,DUMMY.position.y+DUMMY.labelY,DUMMY.position.z);label.billboardMode=Mesh.BILLBOARDMODE_ALL;label.material=labelMaterial;
  return { jointCount:character.jointCount, handError:character.handError, update(state: State, aimed: boolean) { const fixed=isBodyCollisionPractice(state.practice.mode)&&state.owner!=='dummy'?fixedPeople(state.practice.mode).find(p=>p.id==='dummy'):undefined;character.update(characterPose(state,zeroInput(),'dummy',fixed?{x:fixed.x,y:DUMMY.position.y,z:fixed.z,screen:fixed.screen}:undefined));markerMaterial.emissiveColor=markerMaterial.diffuseColor.scale(aimed?1:.4); } };
}
