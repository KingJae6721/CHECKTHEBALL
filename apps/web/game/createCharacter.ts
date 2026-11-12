import type {Scene} from '@babylonjs/core';
import {createLegacyCharacter} from './createLegacyCharacter';
import {createSkinnedCharacter} from './createSkinnedCharacter';
import type {CharacterPalette} from './characterGeometry';
export type CharacterAppearance='minimal'|'legacy';
export function createCharacter(scene:Scene,options:{name:string;firstPerson:boolean;appearance?:CharacterAppearance;colors?:Partial<CharacterPalette>}){
 return options.appearance==='legacy'?createLegacyCharacter(scene,options):createSkinnedCharacter(scene,options);
}
