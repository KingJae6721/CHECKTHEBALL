import {CHARACTER as C,DUMMY as D} from '../../../packages/game-core/src/court';
// Deterministic bind-space asset generator. No frame loop, DOM or renderer dependency.
export const BONE_NAMES=['root','pelvis','torso','neck','head','leftShoulder','leftElbow','leftWrist','leftHip','leftKnee','leftAnkle','rightShoulder','rightElbow','rightWrist','rightHip','rightKnee','rightAnkle','leftElbowBend','leftKneeBend','rightElbowBend','rightKneeBend'] as const;
export type CharacterPalette={uniform:string;shorts:string;skin:string;accent:string;shoe:string;eyes:string};
export const DEFAULT_PALETTE:CharacterPalette={uniform:'#326165',shorts:'#284e51',skin:'#eadbb7',accent:'#f39339',shoe:'#293237',eyes:'#203033'};
export const MINIMAL_STYLE={armRadius:.045,legRadius:.045,shortLength:.23,elbowBlend:.055,kneeBlend:.065,segments:16,torsoBevel:.025,shoeBevel:.018};
// Display-only shoulder pivot sits just inside the arm radius at the torso edge.
// Gameplay sockets/colliders and core motion targets are unchanged.
export const SKIN_SHOULDER_X=D.torsoWidth/2+.012;
type P=[number,number,number];type Weights=[string,number][];
export function generateCharacterGeometry(palette:CharacterPalette=DEFAULT_PALETTE){
 const positions:number[]=[],colors:number[]=[],matricesIndices:number[]=[],matricesWeights:number[]=[],groups:number[][]=[[],[],[]],cache=new Map<string,number>();
 const color=(hex:string)=>[parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255,1];
 const v=(p:P,hex:string,w:Weights)=>{const key=p.map(n=>n.toFixed(7)).join(',')+hex+JSON.stringify(w);const found=cache.get(key);if(found!==undefined)return found;const i=positions.length/3;cache.set(key,i);positions.push(...p);colors.push(...color(hex));for(let k=0;k<4;k++){matricesIndices.push(k<w.length?BONE_NAMES.indexOf(w[k][0] as typeof BONE_NAMES[number]):0);matricesWeights.push(k<w.length?w[k][1]:0);}return i;};
 const quad=(g:number,a:number,b:number,c:number,d:number)=>groups[g].push(a,b,c,a,c,d);
 const connect=(g:number,a:number[],b:number[])=>{for(let i=0;i<a.length;i++){const j=(i+1)%a.length;quad(g,a[i],a[j],b[j],b[i]);}};
 const mixWeights=(a:string,b:string,t:number):Weights=>t<=0?[[a,1]]:t>=1?[[b,1]]:[[a,1-t],[b,t]];
 const bend=(d:number,j:number,a:string,m:string,b:string,span:number):Weights=>d<j?mixWeights(a,m,(d-j+span)/span):mixWeights(m,b,(d-j)/span);
 const sphere=(g:number,center:P,radius:P,bone:string,hex:string,lat=8,lon=16)=>{let prev:number[]|undefined;for(let y=0;y<=lat;y++){const angle=Math.PI*y/lat,ring:number[]=[];for(let i=0;i<lon;i++){const a=i*2*Math.PI/lon;ring.push(v([center[0]+radius[0]*Math.sin(angle)*Math.cos(a),center[1]+radius[1]*Math.cos(angle),center[2]+radius[2]*Math.sin(angle)*Math.sin(a)],hex,[[bone,1]]));}if(prev)connect(g,prev,ring);prev=ring;}};
 // Rounded-box projection keeps the original extents and bind coordinates.
 const rounded=(p:P,c:P,size:P,r:number):P=>{const q=p.map((n,i)=>Math.max(c[i]-size[i]/2+r,Math.min(c[i]+size[i]/2-r,n))) as P,delta=p.map((n,i)=>n-q[i]),length=Math.hypot(...delta);return length>0?q.map((n,i)=>n+delta[i]*r/length) as P:p;};
 const surface=(g:number,corners:P[],bone:string,hex:string,shape:(p:P)=>P,steps=4,endHex?:string)=>{const rows:number[][]=[];for(let j=0;j<=steps;j++){const t=j/steps,row:number[]=[];for(let i=0;i<=steps;i++){const u=i/steps,p=corners[0].map((_,k)=>(1-t)*((1-u)*corners[0][k]+u*corners[1][k])+t*((1-u)*corners[3][k]+u*corners[2][k])) as P;row.push(v(shape(p),j===steps?(endHex??hex):hex,[[bone,1]]));}if(j)for(let i=0;i<steps;i++)quad(g,rows[j-1][i],rows[j-1][i+1],row[i+1],row[i]);rows.push(row);}};
 const roundedBox=(g:number,c:P,size:P,r:number,bone:string,hex:string)=>{const points:P[]=[];for(const y of [-1,1])for(const z of [-1,1])for(const x of [-1,1])points.push([c[0]+size[0]*x/2,c[1]+size[1]*y/2,c[2]+size[2]*z/2]);for(const f of [[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]])surface(g,f.map(i=>points[i]),bone,hex,p=>rounded(p,c,size,r));};
 // Rounded torso with real armholes; skin bridges retain shared boundary vertices.

 const low=D.torsoY-D.torsoHeight/2,high=D.torsoY+D.torsoHeight/2,cy=C.shoulderY,x=D.torsoWidth/2,z=D.torsoDepth/2;
 const torsoShape=(p:P)=>rounded(p,[0,D.torsoY,0],[D.torsoWidth,D.torsoHeight,D.torsoDepth],MINIMAL_STYLE.torsoBevel);
 const holes=new Map<number,number[]>(),corners=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]],segments=MINIMAL_STYLE.segments;
 const order=Array.from({length:segments},(_,i)=>{const at=i*8/segments,k=Math.floor(at),t=at-k;return corners[k].map((a,j)=>a+(corners[(k+1)%8][j]-a)*t);});
 const armhole=(side:number,i:number):P=>torsoShape([side*x,cy+Math.cos(i*2*Math.PI/segments)*MINIMAL_STYLE.armRadius,Math.sin(i*2*Math.PI/segments)*MINIMAL_STYLE.armRadius]);
 for(const side of [-1,1]){
  const inner=order.map((_,i)=>v(armhole(side,i),palette.skin,[['torso',1]]));for(let i=0;i<order.length;i++){const j=(i+1)%order.length,point=(k:number,hole:boolean):P=>{const [a,b]=order[k];return hole?armhole(side,k):[side*x,a===1?high:a===-1?low:cy,b*z];};surface(0,[point(i,false),point(j,false),point(j,true),point(i,true)],'torso',palette.uniform,torsoShape,4,palette.skin);}holes.set(side,inner);
 }
 for(const depth of [-z,z]){const ys=[low,cy,high];for(let i=0;i<2;i++){const q=[[-x,ys[i],depth],[x,ys[i],depth],[x,ys[i+1],depth],[-x,ys[i+1],depth]] as P[];surface(0,q,'torso',palette.uniform,torsoShape);}}
 for(const y of [low,high])for(const depths of [[-z,0],[0,z]])surface(0,[[-x,y,depths[0]],[x,y,depths[0]],[x,y,depths[1]],[-x,y,depths[1]]],'torso',palette.uniform,torsoShape);
 sphere(0,[0,D.neckY,0],[D.neckRadius,D.neckHeight/2,D.neckRadius],'neck',palette.skin,4,12);
 sphere(0,[0,D.headY,0],[D.headRadius,D.headRadius,D.headRadius],'head',palette.skin,10,16);
 let band:number[]|undefined;for(const h of [.065,.095]){const r=Math.sqrt(D.headRadius**2-h*h)*1.018,ring=Array.from({length:24},(_,i)=>{const a=i*Math.PI/12;return v([Math.cos(a)*r,D.headY+h,Math.sin(a)*r],palette.accent,[['head',1]]);});if(band)connect(0,band,ring);band=ring;}
 for(const side of [-1,1])sphere(0,[side*.045,D.headY+.014,Math.sqrt(D.headRadius**2-.045**2-.014**2)+.001],[.009,.025,.004],'head',palette.eyes,6,8);
 roundedBox(2,[0,C.pelvisY,0],[D.torsoWidth*.95,C.pelvisHeight,D.torsoDepth],.018,'pelvis',palette.shorts);
 for(const side of [-1,1]){
  const name=side===1?'right':'left',shoulder=name+'Shoulder',elbow=name+'Elbow',wrist=name+'Wrist',hip=name+'Hip',knee=name+'Knee',ankle=name+'Ankle';
  let prev=holes.get(side)!;const armDistances=[.04,.09,.14,C.upperArm-.055,C.upperArm-.025,C.upperArm,C.upperArm+.025,C.upperArm+.055,.44,C.upperArm+C.forearm-.025,C.upperArm+C.forearm,C.upperArm+C.forearm+.025,C.upperArm+C.forearm+.065,C.upperArm+C.forearm+C.handLength-.015,C.upperArm+C.forearm+C.handLength];
  // Short curved shoulder sleeve: matched circular sections turn from the torso
  // side into the upper arm. No long diagonal web between different ring planes.
  for(const t of [.2,.4,.6,.8]){
   const theta=t*Math.PI/2,center:P=[side*(x+(SKIN_SHOULDER_X-x)*(2*t-t*t)),cy-.04*t*t,0];
   const ring=order.map((_,i)=>{const a=i*2*Math.PI/segments,r=MINIMAL_STYLE.armRadius;
    return v([center[0]+side*Math.sin(theta)*Math.cos(a)*r,center[1]+Math.cos(theta)*Math.cos(a)*r,Math.sin(a)*r],palette.skin,mixWeights('torso',shoulder,t));});
   connect(1,prev,ring);prev=ring;
  }
  for(const d of armDistances){const hand=d>C.upperArm+C.forearm,r=MINIMAL_STYLE.armRadius;
   const w=d>C.upperArm+C.forearm-.025?mixWeights(elbow,wrist,(d-C.upperArm-C.forearm+.025)/.05):bend(d,C.upperArm,shoulder,name+'ElbowBend',elbow,MINIMAL_STYLE.elbowBlend);
   const tip=d===armDistances.at(-1) ? .15 : d>armDistances.at(-1)!-.02 ? .6 : 1;
   const ring=Array.from({length:segments},(_,i)=>{const a=i*2*Math.PI/segments;return v([side*(SKIN_SHOULDER_X+Math.cos(a)*(hand?C.handWidth/2*tip:r)),C.shoulderY-d,Math.sin(a)*(hand?C.handWidth*.325*tip:r)],palette.skin,w);});connect(1,prev,ring);prev=ring;
  }
  const palmEnd=v([side*SKIN_SHOULDER_X,C.shoulderY-C.upperArm-C.forearm-C.handLength,0],palette.skin,[[wrist,1]]);for(let i=0;i<segments;i++)groups[1].push(prev[i],prev[(i+1)%segments],palmEnd);
  let leg:number[]|undefined;for(const d of [0,.04,.14,MINIMAL_STYLE.shortLength-.002,MINIMAL_STYLE.shortLength,C.upperLeg-.065,C.upperLeg-.03,C.upperLeg,C.upperLeg+.03,C.upperLeg+.065,.60,.72,C.upperLeg+C.lowerLeg]){
   const short=d<MINIMAL_STYLE.shortLength,r=short?.078:MINIMAL_STYLE.legRadius,w=bend(d,C.upperLeg,hip,name+'KneeBend',knee,MINIMAL_STYLE.kneeBlend);
   const ring=Array.from({length:8},(_,i)=>{const a=i*Math.PI/4;return v([side*D.legX+Math.cos(a)*r,C.pelvisY-d,Math.sin(a)*(short?.09:r)],short?palette.shorts:palette.skin,w);});if(leg)connect(2,leg,ring);leg=ring;
  }
  const ay=C.pelvisY-C.upperLeg-C.lowerLeg,bottom=ay-C.footHeight,fx=side*D.legX;
  // All shoe detail follows the ankle; soles preserve the original floor contact.
  roundedBox(2,[fx,bottom+.005,.035],[C.footWidth,.01,C.footLength],.004,ankle,palette.accent);
  roundedBox(2,[fx,bottom+.014,.035],[C.footWidth,.018,C.footLength],.008,ankle,palette.skin);
  roundedBox(2,[fx,bottom+.049,.03],[C.footWidth*.94,.062,C.footLength*.94],MINIMAL_STYLE.shoeBevel,ankle,palette.shoe);
  roundedBox(2,[fx,ay+.005,-.018],[.098,.025,.09],.01,ankle,palette.accent);
  roundedBox(2,[fx,ay-.006,.025],[.065,.018,.085],.01,ankle,palette.uniform);
  for(const z of [.025,.052,.079])sphere(2,[fx,ay+.009-(z-.025)*.05,z],[.047,.005,.006],ankle,palette.skin,4,8);
 }
 const ranges=groups.map((g,i)=>({indexStart:groups.slice(0,i).reduce((n,x)=>n+x.length,0),indexCount:g.length})),indices=groups.flat();
 return {positions,colors,matricesIndices,matricesWeights,indices,ranges};
}
