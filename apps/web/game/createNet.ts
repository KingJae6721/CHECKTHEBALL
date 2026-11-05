import {MeshBuilder,Vector3,type Mesh,type Scene,type StandardMaterial} from '@babylonjs/core';
import {COURT} from '../../../packages/game-core/src/court';
import type {GameEvent} from '../../../packages/game-core/src/gameEvents';

// Visual tuning only: metres/seconds. No cloth physics or gameplay collision changes.
export const NET_MOTION={ropes:12,segments:8,height:.39,bottomRadius:.14,twist:.35,
 duration:.95,attack:.07,pull:.16,flare:.045,sway:.025,lateMs:200};
const smooth=(x:number)=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};
type Strand={mesh:Mesh;path:Vector3[];points:{angle:number;depth:number}[]};

export function createNet(scene:Scene,material:StandardMaterial){
 const strands:Strand[]=[];let initialized=false,watermark=0,pending:GameEvent[]=[],started:number|null=null,deformed=false;
 function point(out:Vector3,angle:number,depth:number,age:number){
  const active=age>=0&&age<NET_MOTION.duration;
  const fade=active?1-smooth((age-(NET_MOTION.duration-.2))/.2):0;
  const pull=active?smooth(age/NET_MOTION.attack)*Math.exp(-7*Math.max(0,age-NET_MOTION.attack))*fade:0;
  const tail=Math.max(0,age-.12);
  const recoil=active?Math.sin(tail*19)*Math.exp(-6*tail)*smooth(tail/.06)*fade:0;
  const weight=depth*depth;
  const radius=COURT.rimRadius-.01+(NET_MOTION.bottomRadius-(COURT.rimRadius-.01))*depth
   +NET_MOTION.flare*weight*pull-.025*Math.sin(Math.PI*depth)*pull;
  const a=angle+NET_MOTION.twist*depth;
  out.set(COURT.rim.x+Math.sin(a)*radius+NET_MOTION.sway*weight*recoil,
   COURT.rim.y-.01-NET_MOTION.height*depth-NET_MOTION.pull*depth**1.5*pull+.025*weight*recoil,
   COURT.rim.z+Math.cos(a)*radius+NET_MOTION.sway*.45*weight*recoil);
 }
 function strand(name:string,points:Strand['points'],radius:number){
  const path=points.map(p=>{const out=new Vector3();point(out,p.angle,p.depth,-1);return out;});
  const mesh=MeshBuilder.CreateTube(name,{path,radius,tessellation:6,updatable:true},scene);
  mesh.material=material;mesh.isPickable=false;strands.push({mesh,path,points});
 }
 for(let i=0;i<NET_MOTION.ropes;i++)strand('net',Array.from({length:NET_MOTION.segments+1},(_,j)=>({angle:i/NET_MOTION.ropes*Math.PI*2,depth:j/NET_MOTION.segments})),.007);
 for(const depth of [.24,.62])strand('net-ring',Array.from({length:25},(_,i)=>({angle:i/24*Math.PI*2,depth})),.006);
 function shape(age:number){
  for(const s of strands){s.points.forEach((p,i)=>point(s.path[i],p.angle,p.depth,age));
   MeshBuilder.CreateTube(s.mesh.name,{path:s.path,instance:s.mesh},scene);
  }
 }
 return {
  update(events:GameEvent[],displayTime:number){
   if(!initialized){initialized=true;for(const e of events)watermark=Math.max(watermark,e.eventId);return;}
   for(const event of events){if(event.eventId<=watermark)continue;watermark=event.eventId;if(event.kind==='net')pending.push(event);}
   if(pending.length>8)pending.splice(0,pending.length-8);
   const future:GameEvent[]=[];
   for(const event of pending){if(event.time>displayTime)future.push(event);
    else if(displayTime-event.time<=NET_MOTION.lateMs)started=event.time;
   }pending=future;
   if(started===null)return;
   const age=(displayTime-started)/1000;
   if(age>=NET_MOTION.duration){if(deformed)shape(-1);deformed=false;started=null;return;}
   shape(age);deformed=true;
  },
  reset(){initialized=false;watermark=0;pending=[];started=null;if(deformed)shape(-1);deformed=false;},
 };
}
