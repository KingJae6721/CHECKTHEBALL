import {Color3,DynamicTexture,Matrix,Mesh,MeshBuilder,Ray,Scene,StandardMaterial,Vector3,type TransformNode} from '@babylonjs/core';
import {DUMMY} from '../../../packages/game-core/src/court';
export const NAMEPLATE={height:DUMMY.labelY,width:DUMMY.labelWidth,heightWorld:DUMMY.labelHeight,maxDistance:24,maxPixels:160,occlusionMs:100} as const;
export function labelInView(position:Vector3,camera:Vector3,forward:Vector3){const delta=position.subtract(camera);return delta.lengthSquared()<=NAMEPLATE.maxDistance**2&&Vector3.Dot(delta,forward)>0;}
export function createNameplate(scene:Scene,root:TransformNode,name:string,occluders:readonly Mesh[]){
 const texture=new DynamicTexture(name+':text',{width:512,height:96},scene,false);texture.hasAlpha=true;
 const material=new StandardMaterial(name+':material',scene);material.diffuseTexture=texture;material.useAlphaFromDiffuseTexture=true;material.emissiveColor=Color3.White();material.disableLighting=true;material.backFaceCulling=false;material.specularColor=Color3.Black();
 const mesh=MeshBuilder.CreatePlane(name,{width:NAMEPLATE.width,height:NAMEPLATE.heightWorld},scene);mesh.material=material;mesh.billboardMode=Mesh.BILLBOARDMODE_ALL;mesh.isPickable=false;mesh.setEnabled(false);
 let previous:string|undefined,checked=-Infinity,blocked=false,disposed=false;
 const point=new Vector3(),direction=new Vector3(),ray=new Ray(Vector3.Zero(),Vector3.Forward()),localRay=Ray.Zero(),inverse=Matrix.Identity();
 function update(text:string,enabled:boolean,now:number){
  if(disposed)return;
  if(text!==previous){previous=text;checked=-Infinity;mesh.metadata={nickname:text};const ctx=texture.getContext(),font='bold 42px sans-serif';ctx.font=font;let display=text;while(display.length&&ctx.measureText(display).width>470){const points=Array.from(display.replace(/…$/u,''));points.pop();display=points.join('')+'…';if(points.length===0)break;}ctx.clearRect(0,0,512,96);texture.drawText(display,null,64,font,'#f4f4ed','transparent',true);}
  const camera=scene.activeCamera;if(!enabled||!text||!camera){mesh.setEnabled(false);return;}
  point.copyFrom(root.position);point.y+=NAMEPLATE.height;mesh.position.copyFrom(point);
  const forward=camera.getForwardRay().direction;
  if(!labelInView(point,camera.globalPosition,forward)){mesh.setEnabled(false);return;}
  const engine=scene.getEngine(),viewport=camera.viewport.toGlobal(engine.getRenderWidth(),engine.getRenderHeight());
  const screen=Vector3.Project(point,Matrix.IdentityReadOnly,camera.getTransformationMatrix(),viewport);
  if(screen.z<0||screen.z>1||screen.x<viewport.x||screen.x>viewport.x+viewport.width||screen.y<viewport.y||screen.y>viewport.y+viewport.height){mesh.setEnabled(false);return;}
  direction.copyFrom(point).subtractInPlace(camera.globalPosition);const distance=direction.length();
  if(now-checked>=NAMEPLATE.occlusionMs){checked=now;ray.origin.copyFrom(camera.globalPosition);ray.direction.copyFrom(direction).normalize();ray.length=Math.max(0,distance-.03);blocked=occluders.some(obstacle=>{if(!obstacle.isEnabled())return false;obstacle.computeWorldMatrix().invertToRef(inverse);Ray.TransformToRef(ray,inverse,localRay);return obstacle.intersects(localRay,false).hit;});}
  const cssHeight=engine.getRenderingCanvas()?.clientHeight||engine.getRenderHeight(),depth=Vector3.Dot(direction,forward);
  const pixelWidth=NAMEPLATE.width*cssHeight/(2*Math.max(.01,depth)*Math.tan(camera.fov/2));const scale=Math.min(1,NAMEPLATE.maxPixels/Math.max(1,pixelWidth));mesh.scaling.setAll(scale);
  mesh.setEnabled(!blocked);
 }
 function dispose(){if(disposed)return;disposed=true;mesh.dispose();material.dispose();texture.dispose();}
 scene.onDisposeObservable.addOnce(dispose);
 return {mesh,update,dispose};
}
