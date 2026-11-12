import {fixedPeople,isBodyCollisionPractice} from '../../../packages/game-core/src/bodies';
import { createCharacter,type CharacterAppearance } from './createCharacter';
import { characterPose } from '../../../packages/game-core/src/motion';
import { Color3, Mesh, MeshBuilder, Scene, StandardMaterial } from '@babylonjs/core';
import {createNameplate} from './createNameplate';
import { DUMMY, COURT } from '../../../packages/game-core/src/court';
import { zeroInput, type State } from '../../../packages/game-core/src/simulation';

export function createDummy(scene: Scene,appearance:CharacterAppearance='minimal',occluders:readonly Mesh[]=[]) {
  const character=createCharacter(scene,{name:'dummy',firstPerson:false,appearance});
  const markerMaterial=new StandardMaterial('partner-marker',scene);markerMaterial.diffuseColor=Color3.FromHexString('#c7e89c');markerMaterial.emissiveColor=markerMaterial.diffuseColor.scale(.4);
  const marker=MeshBuilder.CreateTorus('partner-floor-marker',{diameter:DUMMY.markerRadius*2,thickness:DUMMY.markerThickness,tessellation:48},scene);marker.position.set(DUMMY.position.x,COURT.floorY+.02,DUMMY.position.z);marker.material=markerMaterial;
  const label=createNameplate(scene,character.root,'partner-name',occluders);
  return { jointCount:character.jointCount, handError:character.handError, updateLabel(now:number){label.update('PASS PARTNER',true,now);}, update(state: State, aimed: boolean) { const fixed=isBodyCollisionPractice(state.practice.mode)&&state.owner!=='dummy'?fixedPeople(state.practice.mode).find(p=>p.id==='dummy'):undefined;character.update(characterPose(state,zeroInput(),'dummy',fixed?{x:fixed.x,y:DUMMY.position.y,z:fixed.z,screen:fixed.screen}:undefined));markerMaterial.emissiveColor=markerMaterial.diffuseColor.scale(aimed?1:.4); } };
}
