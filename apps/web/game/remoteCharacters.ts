import {teamMode} from '../../../packages/game-core/src/match';
import type {Scene,Mesh} from '@babylonjs/core';
import {createCharacter,type CharacterAppearance} from './createCharacter';
import {createNameplate} from './createNameplate';
import {createState} from '../../../packages/game-core/src/simulation';
import {characterPose} from '../../../packages/game-core/src/motion';
import {TEAM} from '../../../packages/game-core/src/teams';
import {playerColor,playerPalette} from '../../../packages/protocol/src/playerColor';
import type {WorldSnapshot} from '../../../packages/game-core/src/online';
import {actorView} from './onlineClient';
export function createRemoteCharacters(scene:Scene,selfId:string,appearance:CharacterAppearance,occluders:Mesh[]){
 const characters=new Map<string,{rig:ReturnType<typeof createCharacter>;label:ReturnType<typeof createNameplate>;view:ReturnType<typeof createState>;color:string}>();
 function remove(id:string){const entry=characters.get(id);if(!entry)return;entry.label.dispose();const ownedMaterials=appearance==='legacy'?new Set(entry.rig.meshes.map(m=>m.material)):null;entry.rig.root.dispose(false,false);for(const material of ownedMaterials??[])material?.dispose();entry.rig.skeleton?.dispose();characters.delete(id);}
 function update(frame:WorldSnapshot|undefined,now:number,connected:boolean){
  const players=frame?.players.filter(a=>a.id!==selfId)??[],active=new Set(players.map(p=>p.id));
  for(const id of characters.keys())if(!active.has(id))remove(id);
  if(!frame)return;
  for(const actor of players){
   let entry=characters.get(actor.id);const color=playerColor(teamMode(frame.mode)&&actor.teamId?TEAM.colors[actor.teamId]:actor.color);
   if(!entry){const rig=createCharacter(scene,{name:'remote-'+actor.id,firstPerson:false,appearance,colors:playerPalette(color)});entry={rig,label:createNameplate(scene,rig.root,'name-'+actor.id,occluders),view:createState(),color};characters.set(actor.id,entry);}
   if(entry.color!==color){entry.rig.setColors(playerPalette(color));entry.color=color;}
   entry.rig.update(characterPose(actorView(frame,actor,entry.view),actor.input,'player'));
   entry.label.update((actor.teamId?'['+actor.teamId+'] ':'')+(actor.nickname||'Player'),connected,now);
  }
 }
 const dispose=()=>{for(const id of characters.keys())remove(id);};scene.onDisposeObservable.addOnce(dispose);
 return {characters,update,dispose};
}
