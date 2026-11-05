import {BODY,DUMMY,COURT,SCREEN} from './court';
import type {ScreenState} from './screen';
export type XZ={x:number;z:number};
export type FixedBody={id:string;x:number;z:number;radius:number};
// Three overlapping vertical cylinders widen the planted body only sideways.
export function bodyShapes(id:string,p:XZ,screen?:ScreenState):FixedBody[]{
 const offsets=screen?.active?[-SCREEN.sideOffset,0,SCREEN.sideOffset]:[0];
 return offsets.map((side,i)=>({id:id+':'+i,x:p.x+Math.cos(screen?.yaw??0)*side,z:p.z-Math.sin(screen?.yaw??0)*side,radius:BODY.radius}));
}
export type BodyContact={normal:XZ;point:XZ;id:string};
export type BodyMove={position:XZ;contacts:BodyContact[];blocked:XZ;recovered:boolean;safeReset:boolean};
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
const bounds=BODY.bounds;
export type FixedPerson=FixedBody&{screen?:ScreenState};
export const isBodyCollisionPractice=(mode:string)=>mode==='SCREEN'||mode==='GAP'||mode==='EDGE';
// Character roots are separate from the multiple cylinders of a screen.
export function fixedPeople(mode:string,dummyHasBall=false):FixedPerson[]{
 const result:FixedPerson[]=[{id:'dummy',x:DUMMY.position.x,z:DUMMY.position.z,radius:BODY.radius}];
 if(mode==='SCREEN')result.push({id:'screen',x:0,z:1,radius:BODY.radius});
 if(mode==='GAP')result.push({id:'gap-left',x:-.7,z:1,radius:BODY.radius},{id:'gap-right',x:.7,z:1,radius:BODY.radius});
 if(mode==='EDGE')result.push({id:'edge',x:BODY.bounds.maxX-BODY.radius-SCREEN.sideOffset,z:1,radius:BODY.radius});
 if(isBodyCollisionPractice(mode))for(const p of result)if(p.id!=='dummy'||!dummyHasBall)p.screen={active:true,yaw:Math.PI,blend:1};
 return result;
}
export function fixedBodies(mode:string,dummyHasBall=false):FixedBody[]{
 return fixedPeople(mode,dummyHasBall).flatMap(p=>p.screen?bodyShapes(p.id,p,p.screen):[p]);
}
export function validBodyPosition(p:XZ,bodies:readonly FixedBody[],radius=BODY.radius){
 return Number.isFinite(p.x)&&Number.isFinite(p.z)&&p.x>=bounds.minX-BODY.tolerance&&p.x<=bounds.maxX+BODY.tolerance&&p.z>=bounds.minZ-BODY.tolerance&&p.z<=bounds.maxZ+BODY.tolerance&&bodies.every(b=>Math.hypot(p.x-b.x,p.z-b.z)>=radius+b.radius-BODY.tolerance);
}
function clampPosition(p:XZ):XZ{return {x:clamp(p.x,bounds.minX,bounds.maxX),z:clamp(p.z,bounds.minZ,bounds.maxZ)};}
// Separate recovery: deterministic normals, validate against EVERY body and boundary.
export function recoverBody(start:XZ,bodies:readonly FixedBody[],radius=BODY.radius){
 let p=clampPosition(start);
 if(!Number.isFinite(p.x)||!Number.isFinite(p.z))p={...BODY.safe};
 for(let i=0;i<BODY.recoveryIterations;i++){
  if(validBodyPosition(p,bodies,radius))return {position:p,safeReset:false};
  for(const [index,b] of bodies.entries()){
   const dx=p.x-b.x,dz=p.z-b.z,d=Math.hypot(dx,dz),r=radius+b.radius;
   if(d>=r)continue;
   const angle=index*2.399963229728653,normal=d>BODY.tolerance?{x:dx/d,z:dz/d}:{x:Math.cos(angle),z:Math.sin(angle)};
   p=clampPosition({x:b.x+normal.x*(r+BODY.skin),z:b.z+normal.z*(r+BODY.skin)});
  }
 }
 // Explicit safe spawn, then deterministic bounded lattice if that spawn is occupied.
 const candidates:XZ[]=[BODY.safe];
 for(let z=bounds.minZ;z<=bounds.maxZ;z+=radius)for(let x=bounds.minX;x<=bounds.maxX;x+=radius)candidates.push({x,z});
 const safe=candidates.find(c=>validBodyPosition(c,bodies,radius));
 if(!safe)throw new RangeError('No safe body spawn: fixed layout has no supported recovery position');
 return {position:{...safe},safeReset:true};
}
export function moveBody(start:XZ,delta:XZ,bodies:readonly FixedBody[],radius=BODY.radius):BodyMove{
 const recovery=recoverBody(start,bodies,radius);let p=recovery.position,remaining={...delta};const origin={...p},contacts:BodyContact[]=[];
 if(!Number.isFinite(delta.x)||!Number.isFinite(delta.z))remaining={x:0,z:0};
 for(let iteration=0;iteration<BODY.iterations;iteration++){
  const speed2=remaining.x**2+remaining.z**2;if(speed2<BODY.tolerance**2)break;
  let time=1,hit:BodyContact|null=null;
  const offer=(t:number,normal:XZ,id:string)=>{if(t< -BODY.tolerance||t>time||remaining.x*normal.x+remaining.z*normal.z>=-BODY.tolerance)return;time=Math.max(0,t);hit={normal,id,point:{x:p.x+remaining.x*time,z:p.z+remaining.z*time}};};
  for(const b of bodies){
   const dx=p.x-b.x,dz=p.z-b.z,r=radius+b.radius,B=dx*remaining.x+dz*remaining.z,C=dx*dx+dz*dz-r*r,discriminant=B*B-speed2*C;
   if(C<=BODY.tolerance&&B<0){const d=Math.hypot(dx,dz);if(d>BODY.tolerance)offer(0,{x:dx/d,z:dz/d},b.id);}
   if(discriminant<0)continue;
   const t=(-B-Math.sqrt(discriminant))/speed2;
   const hx=dx+remaining.x*t,hz=dz+remaining.z*t,length=Math.hypot(hx,hz);
   if(length>BODY.tolerance)offer(t,{x:hx/length,z:hz/length},b.id);
  }
  if(remaining.x<0)offer((bounds.minX-p.x)/remaining.x,{x:1,z:0},'court-left');
  if(remaining.x>0)offer((bounds.maxX-p.x)/remaining.x,{x:-1,z:0},'court-right');
  if(remaining.z<0)offer((bounds.minZ-p.z)/remaining.z,{x:0,z:1},'court-near');
  if(remaining.z>0)offer((bounds.maxZ-p.z)/remaining.z,{x:0,z:-1},'court-far');
  if(!hit){p={x:p.x+remaining.x,z:p.z+remaining.z};remaining={x:0,z:0};break;}
  const contact=hit as BodyContact;
  const travel=Math.max(0,time-BODY.skin/Math.sqrt(speed2));
  p={x:p.x+remaining.x*travel,z:p.z+remaining.z*travel};contacts.push(contact);
  remaining={x:remaining.x*(1-time),z:remaining.z*(1-time)};
  const inward=remaining.x*contact.normal.x+remaining.z*contact.normal.z;
  if(inward<0){remaining.x-=contact.normal.x*inward;remaining.z-=contact.normal.z*inward;}
 }
 // Iteration exhaustion discards the remaining displacement. Never teleport through.
 if(!validBodyPosition(p,bodies,radius))p={...origin};
 return {position:p,contacts,blocked:{x:delta.x-(p.x-origin.x),z:delta.z-(p.z-origin.z)},recovered:!Number.isFinite(start.x)||!Number.isFinite(start.z)||Math.hypot(origin.x-start.x,origin.z-start.z)>BODY.tolerance,safeReset:recovery.safeReset};
}
// Simultaneous relative sweep, without an actor-order advantage or contact pushing.
export type PairDiagnostics={recovered:boolean;reason:string};
export function movePair(starts:XZ[],deltas:XZ[],diagnostics?:PairDiagnostics):XZ[]{
 if(diagnostics){diagnostics.recovered=false;diagnostics.reason='movement';}
 if(starts.length<2)return starts.map((p,i)=>moveBody(p,deltas[i],[]).position);
 let [a,b]=starts.map(p=>({...p})),[da,db]=deltas.map(d=>({...d}));const safe=()=>[{x:-1,z:-1.5},{x:1,z:-1.5}];
 if(!starts.every(p=>validBodyPosition(p,[]))||Math.hypot(a.x-b.x,a.z-b.z)<2*BODY.radius-BODY.tolerance){
  if(diagnostics){diagnostics.recovered=true;diagnostics.reason='overlap-local-recovery';}
  a=recoverBody(a,[]).position;b=recoverBody(b,[]).position;
  for(let i=0;i<BODY.recoveryIterations;i++){
   const d=Math.hypot(a.x-b.x,a.z-b.z);if(d>=2*BODY.radius-BODY.tolerance)break;
   const n=d>BODY.tolerance?{x:(a.x-b.x)/d,z:(a.z-b.z)/d}:{x:-1,z:0},amount=(2*BODY.radius+BODY.skin-d)/2;
   a=recoverBody({x:a.x+n.x*amount,z:a.z+n.z*amount},[]).position;b=recoverBody({x:b.x-n.x*amount,z:b.z-n.z*amount},[]).position;
  }
  if(Math.hypot(a.x-b.x,a.z-b.z)<2*BODY.radius-BODY.tolerance){[a,b]=safe();if(diagnostics)diagnostics.reason='overlap-safe-reset';}
 }
 for(let i=0;i<BODY.iterations;i++){
  const ca=moveBody(a,da,[]).position,cb=moveBody(b,db,[]).position;da={x:ca.x-a.x,z:ca.z-a.z};db={x:cb.x-b.x,z:cb.z-b.z};
  const r={x:a.x-b.x,z:a.z-b.z},v={x:da.x-db.x,z:da.z-db.z},A=v.x*v.x+v.z*v.z,B=r.x*v.x+r.z*v.z,C=r.x*r.x+r.z*r.z-(2*BODY.radius)**2,disc=B*B-A*C;
  let t=1,hit=false;if(A>1e-14&&B<0&&disc>=0){const entry=(-B-Math.sqrt(disc))/A;if(entry>=-BODY.tolerance&&entry<=1){t=Math.max(0,entry);hit=true;}}
  const travel=hit?Math.max(0,t-BODY.skin/Math.max(1e-8,Math.sqrt(A))):1;
  a={x:a.x+da.x*travel,z:a.z+da.z*travel};b={x:b.x+db.x*travel,z:b.z+db.z*travel};if(!hit)break;
  da={x:da.x*(1-t),z:da.z*(1-t)};db={x:db.x*(1-t),z:db.z*(1-t)};
  const distance=Math.hypot(a.x-b.x,a.z-b.z),n={x:(a.x-b.x)/distance,z:(a.z-b.z)/distance};
  const inwardA=Math.min(0,da.x*n.x+da.z*n.z),inwardB=Math.max(0,db.x*n.x+db.z*n.z);
  da.x-=n.x*inwardA;da.z-=n.z*inwardA;db.x-=n.x*inwardB;db.z-=n.z*inwardB;
 }
 if(Math.hypot(a.x-b.x,a.z-b.z)>=2*BODY.radius-BODY.tolerance)return [a,b];
 if(diagnostics){diagnostics.recovered=true;diagnostics.reason='solver-safe-reset';}return safe();
}

