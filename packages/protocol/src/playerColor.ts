// Cosmetic profile only: independent of teams, seats, possession and match rules.
export const PLAYER_COLORS={
 teal:{label:'청록',uniform:'#326165',shorts:'#284e51',accent:'#f39339',ui:'#79c9c2'},
 orange:{label:'주황',uniform:'#ca6938',shorts:'#824027',accent:'#ffd29a',ui:'#ffab73'},
 blue:{label:'파랑',uniform:'#3b71ae',shorts:'#274975',accent:'#9fd2ff',ui:'#8fc7ff'},
 purple:{label:'보라',uniform:'#8c5ca8',shorts:'#573968',accent:'#dcb9ef',ui:'#d4a4ed'},
 yellow:{label:'노랑',uniform:'#d6b64f',shorts:'#8b6b2e',accent:'#ffe4a0',ui:'#f1d575'},
 charcoal:{label:'차콜',uniform:'#414d58',shorts:'#252e36',accent:'#b8ccd5',ui:'#bdcbd5'},
} as const;
export type PlayerColor=keyof typeof PLAYER_COLORS;
export const DEFAULT_PLAYER_COLOR:PlayerColor='teal';
export const PLAYER_COLOR_KEY='check-the-ball.character-color.v1';
export function isPlayerColor(value:unknown):value is PlayerColor{return typeof value==='string'&&Object.hasOwn(PLAYER_COLORS,value);}
export function playerColor(value:unknown):PlayerColor{return isPlayerColor(value)?value:DEFAULT_PLAYER_COLOR;}
export function playerPalette(value:unknown){return PLAYER_COLORS[playerColor(value)];}
