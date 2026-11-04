import { COURT, PHYSICS, rimSegments } from './court';
import type { Vec } from './simulation';
type Body = { ball: Vec; ballVelocity: Vec };
type Contact = { normal: Vec; depth: number; material: typeof PHYSICS.floor };
export type ImpactObserver=(kind:'floor'|'rim'|'board',position:Vec,strength:number)=>void;
const axes = ['x', 'y', 'z'] as const;
const dot = (a: Vec, b: Vec) => a.x*b.x+a.y*b.y+a.z*b.z;
const length = (v: Vec) => Math.hypot(v.x,v.y,v.z);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo,Math.min(hi,v));
const segments = rimSegments();
export function reflectVelocity(v: Vec, normal: Vec, restitution: number) {
  const approach = dot(v,normal);
  if (approach >= 0) return;
  const impulse = (1+clamp(restitution,0,1))*approach;
  for (const axis of axes) v[axis] -= impulse*normal[axis];
}
function apply(body: Body, contact: Contact,observer?:ImpactObserver,kind:'floor'|'rim'|'board'='floor') {
  const { normal, depth, material } = contact;
  for (const axis of axes) body.ball[axis] += normal[axis]*(depth+1e-9);
  if (dot(body.ballVelocity,normal) < 0) {
    observer?.(kind,{...body.ball},-dot(body.ballVelocity,normal));
    reflectVelocity(body.ballVelocity,normal,material.restitution);
    const vn=dot(body.ballVelocity,normal);
    for (const axis of axes) body.ballVelocity[axis] = normal[axis]*vn+(body.ballVelocity[axis]-normal[axis]*vn)*(1-material.friction);
  }
}
function boardContact(p: Vec): Contact | null {
  const b=COURT.board, half={x:b.width/2,y:b.height/2,z:b.depth/2};
  const q={x:0,y:0,z:0}, delta={x:0,y:0,z:0};
  for(const axis of axes) { q[axis]=clamp(p[axis],b.center[axis]-half[axis],b.center[axis]+half[axis]); delta[axis]=p[axis]-q[axis]; }
  const distance=length(delta);
  if(distance>=COURT.ballRadius) return null;
  if(distance>1e-10) return {normal:{x:delta.x/distance,y:delta.y/distance,z:delta.z/distance},depth:COURT.ballRadius-distance,material:PHYSICS.board};
  // Inside the box: exit through the nearest face, including the exact centre.
  let axis: typeof axes[number]='x', gap=Infinity;
  for(const a of axes) {const d=half[a]-Math.abs(p[a]-b.center[a]);if(d<gap){gap=d;axis=a;}}
  const normal={x:0,y:0,z:0};normal[axis]=p[axis]>=b.center[axis]?1:-1;
  return {normal,depth:COURT.ballRadius+gap,material:PHYSICS.board};
}
function rimContact(p: Vec, velocity: Vec): Contact | null {
  let deepest: Contact | null=null;
  for(const {a,b} of segments) {
    const ab={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z}, ap={x:p.x-a.x,y:p.y-a.y,z:p.z-a.z};
    const t=clamp(dot(ap,ab)/dot(ab,ab),0,1);
    const d={x:ap.x-ab.x*t,y:ap.y-ab.y*t,z:ap.z-ab.z*t};
    const distance=length(d), depth=COURT.ballRadius+COURT.rimTubeRadius-distance;
    if(depth<=0 || (deepest && depth<=deepest.depth)) continue;
    // Degenerate exact centreline contact: oppose velocity, or use upward normal.
    const speed=length(velocity);
    const normal=distance>1e-10?{x:d.x/distance,y:d.y/distance,z:d.z/distance}:speed>1e-10?{x:-velocity.x/speed,y:-velocity.y/speed,z:-velocity.z/speed}:{x:0,y:1,z:0};
    deepest={normal,depth,material:PHYSICS.rim};
  }
  return deepest;
}
// Gravity-free contact stage, also used to test energy invariants.
export function solveContacts(body: Body,observer?:ImpactObserver) {
  let floor=false;
  for(let i=0;i<PHYSICS.contactIterations;i++) {
    if(body.ball.y<COURT.floorY+COURT.ballRadius) {
      floor=true;
      const approaching=body.ballVelocity.y<0;
      apply(body,{normal:{x:0,y:1,z:0},depth:COURT.floorY+COURT.ballRadius-body.ball.y,material:{...PHYSICS.floor,friction:0}},observer,'floor');
      if(approaching && Math.abs(body.ballVelocity.y)<PHYSICS.sleepVertical) body.ballVelocity.y=0;
    }
    const board=boardContact(body.ball);if(board) apply(body,board,observer,'board');
    // Resolve only the deepest capsule per iteration; never sum neighbouring impulses.
    const rim=rimContact(body.ball,body.ballVelocity);if(rim) apply(body,rim,observer,'rim');
  }
  return floor;
}
export function advanceBall(body: Body, dt: number, onPath?: (a: Vec,b: Vec,floor: boolean,collided: boolean,t0:number,t1:number) => void | boolean, gravity=9.81,observer?:ImpactObserver) {
  if(!Number.isFinite(dt)||dt<=0||dt>PHYSICS.maxStep) throw new RangeError('Ball step must be in (0, 1/30] seconds');
  const v=body.ballVelocity, speed=length(v);
  if(speed>PHYSICS.maxSpeed) for(const axis of axes) v[axis]*=PHYSICS.maxSpeed/speed;
  // At most half the smallest collision feature per step, even under gravity.
  const maxTravel=Math.min(COURT.ballRadius,COURT.board.depth,COURT.rimTubeRadius*2)/2;
  const count=Math.min(PHYSICS.maxSubsteps,Math.max(1,Math.ceil((length(v)+Math.abs(gravity)*dt)*dt/maxTravel)));
  const h=dt/count, ground=COURT.floorY+COURT.ballRadius;
  for(let i=0;i<count;i++) {
    const prev={...body.ball};
    const resting=body.ball.y<=ground+1e-7 && v.y===0;
    body.ball.x+=v.x*h;body.ball.z+=v.z*h;
    if(!resting) {body.ball.y+=v.y*h-.5*gravity*h*h;v.y-=gravity*h;}
    const beforeContact={...body.ball};
    const floor=solveContacts(body,observer);
    const collided=axes.some(axis=>Math.abs(body.ball[axis]-beforeContact[axis])>1e-10);
    if(floor||resting) {
      const damping=Math.exp(-PHYSICS.floor.friction*h);v.x*=damping;v.z*=damping;
      if(Math.hypot(v.x,v.z)<PHYSICS.sleepHorizontal) {v.x=0;v.z=0;}
      if(v.y===0) body.ball.y=ground;
    }
    // A catch can stop this integrator immediately; never integrate an owned ball.
    if(onPath?.(prev,{...body.ball},floor,collided,i/count,(i+1)/count)===false) break;
  }
}

// Conservative visibility from a prospective catch to the receiver's hands.
// Prevents a catch volume overlapping a board/rim from grabbing through it.
export function isBallPathClear(a: Vec,b: Vec) {
  const distance=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);
  const spacing=Math.min(COURT.board.depth,COURT.rimTubeRadius*2,COURT.ballRadius)/2;
  const count=Math.max(1,Math.ceil(distance/spacing));
  for(let i=0;i<=count;i++) {
    const t=i/count,p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t};
    if(boardContact(p)||rimContact(p,{x:0,y:0,z:0})) return false;
  }
  return true;
}
