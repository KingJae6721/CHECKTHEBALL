import {BODY,SCREEN} from './court';
import {bodyShapes,validBodyPosition,type FixedBody} from './bodies';
import type {Input,State} from './simulation';
export type ScreenState={active:boolean;yaw:number;blend:number};
export const createScreen=():ScreenState=>({active:false,yaw:0,blend:0});
export function toggleScreen(s:State,input:Input,obstacles:readonly FixedBody[]){
 if(s.screen.active){s.screen.active=false;s.message='스크린 해제';return true;}
 if(s.owner==='player'||s.player.y>0||s.vy!==0||input.x!==0||input.z!==0||s.defense.kind||s.playerMotion.pending){s.message='공 없이 지상에 멈춰서 E: 스크린';return false;}
 const candidate={active:true,yaw:input.yaw,blend:0};
 if(!bodyShapes('screen',s.player,candidate).every(p=>validBodyPosition(p,obstacles,BODY.radius))){s.message='스크린을 펼칠 공간이 부족합니다';return false;}
 Object.assign(s.screen,candidate);s.message='스크린 유지 · 이동하면 해제';return true;
}
export function advanceScreen(screen:ScreenState,moving:boolean,airborne:boolean,dt:number){
 if(moving||airborne)screen.active=false;
 const target=screen.active?1:0;
 screen.blend=target+(screen.blend-target)*Math.exp(-SCREEN.response*dt);
 if(Math.abs(screen.blend-target)<.001)screen.blend=target;
}
