import {Color3,Color4,DynamicTexture,HemisphericLight,DirectionalLight,Mesh,MeshBuilder,Quaternion,Scene,StandardMaterial,Texture,Vector3,VertexData} from '@babylonjs/core';
import {COURT} from '../../../packages/game-core/src/court';
import {CFG} from '../../../packages/game-core/src/simulation';

// Display settings only. The existing half-court bounds, hoop and physics stay in game-core.
export const GYM={
 width:21,depth:23,centerZ:-1.25,eaves:7.6,ridge:9.8,bays:6,
 windowBottom:3.65,windowHeight:3,woodTextureSize:1536,
 floor:'#d5ad73',line:'#7b302d',wall:'#b8a58b',panel:'#a1835e',steel:'#514e43',frame:'#e2d8bf',roof:'#956c49',padding:'#293e3d',
 daylight:.95,sun:1.25,sunDirection:new Vector3(-.9,-1,-.38),
} as const;

function random(seed:number){let value=seed;return()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;};}
function woodTexture(scene:Scene,name:string,size:number){
 const texture=new DynamicTexture(name,{width:size,height:size},scene,true),ctx=texture.getContext() as CanvasRenderingContext2D,rng=random(7124);
 const colors=['#d2a467','#dbb274','#c89b5d','#e2bc80','#cfa064','#d9ae70','#e6c28a'];
 ctx.fillStyle=colors[0];ctx.fillRect(0,0,size,size);
 const plank=24,course=220;
 for(let x=0,column=0;x<size;x+=plank,column++){
  for(let y=-(column%3)*course/3;y<size;y+=course){
   const length=course-1;ctx.fillStyle=colors[Math.floor(rng()*colors.length)];ctx.fillRect(x,y,plank-1,length);
   const wash=ctx.createLinearGradient(x,0,x+plank,0);wash.addColorStop(0,'rgba(255,243,211,0.12)');wash.addColorStop(.55,'rgba(255,240,209,0)');wash.addColorStop(1,'rgba(81,47,22,0.1)');ctx.fillStyle=wash;ctx.fillRect(x,y,plank-1,length);
   // Long, fine grain within each board, baked once rather than separate floor meshes.
   for(let line=0;line<12;line++){const gx=x+1+rng()*(plank-3);ctx.strokeStyle=`rgba(93,55,24,${.035+rng()*.065})`;ctx.lineWidth=.35+rng()*.45;ctx.beginPath();ctx.moveTo(gx,y);ctx.bezierCurveTo(gx-2+rng()*4,y+65,gx-2+rng()*4,y+145,gx,y+length);ctx.stroke();}
   ctx.fillStyle='rgba(78,48,25,0.2)';ctx.fillRect(x,y,plank,.7);ctx.fillRect(x,y,.6,course);
  }
 }
 texture.anisotropicFilteringLevel=8;texture.update();return texture;
}
function windowTexture(scene:Scene){
 const texture=new DynamicTexture('gym:window-view',{width:512,height:256},scene,true),ctx=texture.getContext(),rng=random(811);
 const sky=ctx.createLinearGradient(0,0,0,256);sky.addColorStop(0,'#f2eee0');sky.addColorStop(.58,'#e9edde');sky.addColorStop(1,'#91a179');ctx.fillStyle=sky;ctx.fillRect(0,0,512,256);
 for(let i=0;i<150;i++){const x=rng()*560-24,y=182+rng()*85,r=9+rng()*30;ctx.fillStyle=['#a6b48a','#87996d','#bcc49c','#738762','#cbd0ac'][Math.floor(rng()*5)];ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
 const haze=ctx.createLinearGradient(0,0,0,256);haze.addColorStop(0,'rgba(255,250,229,0.4)');haze.addColorStop(1,'rgba(255,248,218,0.13)');ctx.fillStyle=haze;ctx.fillRect(0,0,512,256);texture.update();return texture;
}

export function createIndoorGym(scene:Scene){
 scene.clearColor=new Color4(.42,.37,.29,1);scene.fogMode=Scene.FOGMODE_NONE;
 scene.imageProcessingConfiguration.exposure=.9;scene.imageProcessingConfiguration.contrast=1.08;
 const ambient=new HemisphericLight('gym:daylight',Vector3.Up(),scene);ambient.intensity=GYM.daylight;ambient.diffuse=Color3.FromHexString('#fff3dc');ambient.groundColor=Color3.FromHexString('#897258');
 const sun=new DirectionalLight('gym:sun',GYM.sunDirection.clone(),scene);sun.intensity=GYM.sun;sun.diffuse=Color3.FromHexString('#fff0ce');
 const material=(name:string,color:string)=>{const m=new StandardMaterial('gym:'+name,scene);m.diffuseColor=Color3.FromHexString(color);m.specularColor=new Color3(.05,.045,.035);return m;};
 const floorMat=material('maple',GYM.floor),walls=material('plaster',GYM.wall),panel=material('wainscot',GYM.panel),steel=material('truss',GYM.steel),frame=material('window-frames',GYM.frame),roof=material('ceiling',GYM.roof),padding=material('wall-padding',GYM.padding),markings=material('burgundy-lines',GYM.line);
 const timber=woodTexture(scene,'gym:maple-boards',GYM.woodTextureSize);floorMat.diffuseTexture=timber;floorMat.diffuseColor=Color3.White();floorMat.specularColor=new Color3(.62,.53,.37);floorMat.specularPower=100;
 const wallTimber=new DynamicTexture('gym:vertical-panels',{width:1024,height:512},scene,true),wc=wallTimber.getContext(),wallRandom=random(931);
 for(let x=0;x<1024;x+=14){const tone=132+Math.floor(wallRandom()*18);wc.fillStyle=`rgb(${tone+23},${tone},${tone-36})`;wc.fillRect(x,0,14,512);wc.fillStyle='rgba(50,35,20,0.14)';wc.fillRect(x,0,.7,512);for(let i=0;i<5;i++){wc.fillStyle='rgba(64,44,23,0.035)';wc.fillRect(x+1+wallRandom()*12,0,.45,512);}}wallTimber.update();
 panel.diffuseTexture=wallTimber;panel.diffuseColor=Color3.FromHexString('#c6b18d');roof.diffuseTexture=timber;roof.diffuseColor=Color3.FromHexString('#9d795a');
 // Low-cost static room reflection. No mirror camera or extra scene rendering per frame.
 const reflection=new DynamicTexture('gym:varnish-reflection',{width:512,height:256},scene,true),rc=reflection.getContext();
 rc.fillStyle='#524338';rc.fillRect(0,0,512,256);rc.fillStyle='#9d805b';rc.fillRect(0,112,512,144);
 for(let i=0;i<8;i++){rc.fillStyle='#e9e5ca';rc.fillRect(i*64+10,92,42,34);rc.fillStyle='#81755e';rc.fillRect(i*64+29,92,3,34);rc.fillRect(i*64+10,107,42,3);}
 reflection.update();reflection.coordinatesMode=Texture.EQUIRECTANGULAR_MODE;reflection.level=.12;floorMat.reflectionTexture=reflection;
 const occluders:Mesh[]=[],structure:Mesh[]=[],frames:Mesh[]=[];
 const box=(name:string,width:number,height:number,depth:number,x:number,y:number,z:number,mat:StandardMaterial,blocks=false)=>{const mesh=MeshBuilder.CreateBox('gym:'+name,{width,height,depth},scene);mesh.position.set(x,y,z);mesh.material=mat;mesh.isPickable=false;if(blocks)occluders.push(mesh);return mesh;};
 const beam=(name:string,a:Vector3,b:Vector3,thickness:number,mat:StandardMaterial,batch:Mesh[])=>{const direction=b.subtract(a),mesh=box(name,thickness,direction.length(),thickness,(a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2,mat);mesh.rotationQuaternion=Quaternion.Identity();Quaternion.FromUnitVectorsToRef(Vector3.Up(),direction.normalize(),mesh.rotationQuaternion);batch.push(mesh);return mesh;};
 const floor=MeshBuilder.CreateGround('court',{width:GYM.width,height:GYM.depth},scene);floor.position.set(0,COURT.floorY,GYM.centerZ);floor.material=floorMat;floor.isPickable=false;
 // Same playable markings and basket references as the previous outdoor half-court.
 const line=(name:string,points:Vector3[],radius=.024)=>{const mesh=MeshBuilder.CreateTube(name,{path:points,radius,tessellation:6},scene);mesh.material=markings;mesh.isPickable=false;return mesh;};
 const segment=(name:string,x1:number,z1:number,x2:number,z2:number)=>line(name,[new Vector3(x1,.035,z1),new Vector3(x2,.035,z2)]);
 segment('baseline',-7.35,7.1,7.35,7.1);segment('left',-7.35,-7.1,-7.35,7.1);segment('right',7.35,-7.1,7.35,7.1);segment('half',-7.35,-7.1,7.35,-7.1);
 segment('key-left',-2.45,7.1,-2.45,1.45);segment('key-right',2.45,7.1,2.45,1.45);segment('free-throw',-2.45,1.45,2.45,1.45);
 const arc=(name:string,cx:number,cz:number,radius:number,start:number,end:number)=>{const points=[];for(let i=0;i<=100;i++){const angle=start+(end-start)*i/100;points.push(new Vector3(cx+Math.sin(angle)*radius,.04,cz+Math.cos(angle)*radius));}line(name,points);};
 arc('two-point-arc',0,CFG.rim.z,CFG.arc,Math.acos((7.1-CFG.rim.z)/CFG.arc),2*Math.PI-Math.acos((7.1-CFG.rim.z)/CFG.arc));arc('free-throw-circle',0,1.45,1.8,0,2*Math.PI);arc('center',0,-7.1,1.8,-Math.PI/2,Math.PI/2);
 const half=GYM.width/2,near=GYM.centerZ-GYM.depth/2,far=GYM.centerZ+GYM.depth/2,bay=GYM.depth/GYM.bays;
 const glass=material('soft-window-light','#000000');glass.disableLighting=true;glass.emissiveTexture=windowTexture(scene);glass.emissiveColor=new Color3(.9,.88,.8);glass.backFaceCulling=false;
 const window=(x:number,y:number,z:number,width:number,height:number,side:boolean)=>{
  const pane=MeshBuilder.CreatePlane('gym:window',{width,height,sideOrientation:Mesh.DOUBLESIDE},scene);pane.position.set(x,y,z);if(side)pane.rotation.y=Math.PI/2;pane.material=glass;pane.isPickable=false;occluders.push(pane);
  for(let row=0;row<=3;row++){const yy=y-height/2+height*row/3;frames.push(box('window-rail',side?.1:width,.065,side?width:.1,x,yy,z,frame));}
  for(let col=0;col<=3;col++){const across=-width/2+width*col/3;frames.push(box('window-mullion',side?.1:.065,height,side?.065:.1,x+(side?0:across),y,z+(side?across:0),frame));}
 };
 for(const side of [-1,1]){
  box('side-wall',.24,GYM.windowBottom,GYM.depth,side*half,GYM.windowBottom/2,GYM.centerZ,panel,true);
  box('upper-wall',.24,GYM.eaves-GYM.windowBottom-GYM.windowHeight,GYM.depth,side*half,(GYM.eaves+GYM.windowBottom+GYM.windowHeight)/2,GYM.centerZ,walls,true);
  for(let i=0;i<GYM.bays;i++)window(side*(half-.14),GYM.windowBottom+GYM.windowHeight/2,near+bay*(i+.5),bay-.3,GYM.windowHeight,true);
  for(let i=0;i<=GYM.bays;i++){const z=near+bay*i;box('column',.38,GYM.eaves,.3,side*(half-.1),GYM.eaves/2,z,walls,true);beam('roof-brace',new Vector3(side*(half-.24),6.3,z),new Vector3(side*(half-1.8),8.05,z),.16,steel,structure);}
  // Vertical boards in the wainscot, batched with the window trim.
  for(let z=near;z<=far;z+=.5)frames.push(box('panel-joint',.012,GYM.windowBottom,.012,side*(half-.126),GYM.windowBottom/2,z,roof));
 }
 for(const z of [near,far]){
  box('end-wall',GYM.width,GYM.eaves,.25,0,GYM.eaves/2,z,walls,true);box('end-panels',GYM.width,3.25,.08,0,1.625,z+(z===far?-.15:.15),panel,true);
  for(const x of [-6.7,6.7])window(x,5.3,z+(z===far?-.14:.14),3.8,2.25,false);
 }
 for(let i=-4;i<=4;i++)box('padding',1.02,1.85,.16,i*1.1,.95,far-.24,padding);
 const door=material('doors','#50584c');
 for(const z of [near+.22,far-.23]){box('double-door',2.1,2.65,.06,-7.7,1.325,z,door);frames.push(box('door-divider',.04,2.65,.075,-7.7,1.325,z,frame));for(const x of [-8.1,-7.3])frames.push(box('door-handle',.3,.035,.1,x,1.1,z+(z>0?-.04:.04),frame));}
 // Gabled timber ceiling and triangulated steel trusses.
 const angle=Math.atan2(GYM.ridge-GYM.eaves,half),slope=Math.hypot(half,GYM.ridge-GYM.eaves);
 for(const side of [-1,1]){const ceiling=box('roof',slope+.2,.16,GYM.depth,side*half/2,(GYM.ridge+GYM.eaves)/2,GYM.centerZ,roof);ceiling.rotation.z=-side*angle;}
 for(let i=0;i<=GYM.bays;i++){
  const z=near+i*bay,left=new Vector3(-half,7.45,z),right=new Vector3(half,7.45,z),peak=new Vector3(0,GYM.ridge-.18,z);
  beam('tie',left,right,.15,steel,structure);beam('rafter',left,peak,.18,steel,structure);beam('rafter',peak,right,.18,steel,structure);
  for(const x of [-7,-3.5,0,3.5,7]){const top=GYM.ridge-.18-Math.abs(x)*Math.tan(angle);beam('web',new Vector3(x,7.45,z),new Vector3(x,top,z),.09,steel,structure);if(x<7)beam('diagonal',new Vector3(x,7.45,z),new Vector3(x+3.5,GYM.ridge-.18-Math.abs(x+3.5)*Math.tan(angle),z),.075,steel,structure);}
 }
 const lamp=material('ceiling-lights','#e9d9ae');lamp.disableLighting=true;lamp.emissiveColor=Color3.FromHexString('#d9cba5');
 for(const z of [near+bay*1.5,near+bay*3.5,near+bay*5.5])for(const x of [-4.3,4.3])box('strip-light',1.8,.07,.24,x,7.28,z,lamp);
 // Static window-light projection: warm rectangles and mullion shadows, no extra render pass.
 const mask=new DynamicTexture('gym:sunlight-mask',{width:384,height:256},scene,true),mc=mask.getContext() as CanvasRenderingContext2D;mask.hasAlpha=true;mc.clearRect(0,0,384,256);
 for(let x=0;x<3;x++)for(let y=0;y<3;y++){mc.fillStyle='rgba(255,249,225,0.72)';mc.fillRect(5+x*126,5+y*84,117,75);}
 const fade=mc.createLinearGradient(0,0,384,0);fade.addColorStop(0,'rgba(255,255,255,0)');fade.addColorStop(.12,'#fff');fade.addColorStop(.88,'#fff');fade.addColorStop(1,'rgba(255,255,255,0)');mc.globalCompositeOperation='destination-in';mc.fillStyle=fade;mc.fillRect(0,0,384,256);mask.update();
 const sunMat=material('sun-pools','#fff0cb');sunMat.diffuseTexture=mask;sunMat.emissiveColor=Color3.FromHexString('#fff1d0');sunMat.disableLighting=true;sunMat.useAlphaFromDiffuseTexture=true;sunMat.alpha=.27;sunMat.backFaceCulling=false;sunMat.disableDepthWrite=true;
 for(let i=0;i<GYM.bays;i++){
  const z=near+bay*(i+.5),project=(y:number,zz:number)=>{const t=(COURT.floorY-y)/GYM.sunDirection.y;return [half+GYM.sunDirection.x*t,COURT.floorY+.002,zz+GYM.sunDirection.z*t];};
  const positions=[...project(GYM.windowBottom,z-bay*.43),...project(GYM.windowBottom+GYM.windowHeight,z-bay*.43),...project(GYM.windowBottom+GYM.windowHeight,z+bay*.43),...project(GYM.windowBottom,z+bay*.43)];
  const mesh=new Mesh('gym:sun-pool',scene),vd=new VertexData();vd.positions=positions;vd.indices=[0,1,2,0,2,3];vd.normals=[0,1,0,0,1,0,0,1,0,0,1,0];vd.uvs=[0,0,1,0,1,1,0,1];vd.applyToMesh(mesh);mesh.material=sunMat;mesh.isPickable=false;
 }
 for(const x of [-8.8,8.8])for(const z of [-4,2]){box('bench-seat',.55,.09,2.6,x,.48,z,roof);for(const dz of [-.95,.95])box('bench-leg',.4,.4,.08,x,.24,z+dz,steel);}
 const signTexture=new DynamicTexture('gym:wordmark',{width:1024,height:192},scene,true);signTexture.hasAlpha=true;signTexture.drawText('CHECKTHEBALL',null,112,'bold 88px sans-serif','#eee2c5','#30433e',true);
 const sign=material('wordmark','#ffffff');sign.diffuseTexture=signTexture;sign.emissiveColor=new Color3(.12,.12,.1);const plaque=MeshBuilder.CreatePlane('gym:wordmark',{width:4.6,height:.86,sideOrientation:Mesh.DOUBLESIDE},scene);plaque.position.set(0,5.8,far-.17);plaque.material=sign;plaque.isPickable=false;
 // Static batches share materials; no per-frame geometry/texture work.
 const trusses=Mesh.MergeMeshes(structure,true,true);if(trusses){trusses.name='gym:steelwork';trusses.isPickable=false;}
 // Window trim and panel joints use two existing materials, preserving those submeshes.
 const trim=Mesh.MergeMeshes(frames,true,true,undefined,false,true);if(trim){trim.name='gym:trim';trim.isPickable=false;}
 return {occluders,markings};
}
