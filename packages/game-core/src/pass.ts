import { PASS, PLAYER } from './court';
import type { Input, Vec } from './simulation';
// Babylon default left-handed scene: +Z forward, +yaw right, +pitch down.
export function passDirection(yaw: number,pitch: number): Vec {
  yaw=Number.isFinite(yaw)?yaw:0;pitch=Number.isFinite(pitch)?pitch:0;
  const v={x:Math.sin(yaw)*Math.cos(pitch),y:-Math.sin(pitch),z:Math.cos(yaw)*Math.cos(pitch)};
  const length=Math.hypot(v.x,v.y,v.z);return {x:v.x/length,y:v.y/length,z:v.z/length};
}
export function passSpeed(charge: number) {
  const power=Math.max(0,Math.min(1,(Number.isNaN(charge)?0:charge)/PASS.maxCharge));
  return PASS.minSpeed+(PASS.maxSpeed-PASS.minSpeed)*power;
}
export function playerPassLaunch(player: Vec,input: Input,charge: number) {
  const direction=passDirection(input.yaw,input.pitch),speed=passSpeed(charge);
  const origin={x:player.x,y:player.y+PLAYER.eyeHeight,z:player.z};
  const position={x:origin.x+direction.x*PASS.releaseOffset,y:origin.y+direction.y*PASS.releaseOffset,z:origin.z+direction.z*PASS.releaseOffset};
  return {origin,position,direction,speed,charge,velocity:{x:direction.x*speed,y:direction.y*speed,z:direction.z*speed}};
}
export type PlayerPassLaunch = ReturnType<typeof playerPassLaunch>;
