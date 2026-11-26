import {Color3,MeshBuilder,StandardMaterial,RawTexture,Scene,Texture} from '@babylonjs/core';
import {COURT} from '../../../packages/game-core/src/court';
// Visual tuning only. Radius and all contacts still come from game-core.
export const BALL_STYLE={width:1024,height:512,segments:32,seamHalfWidth:.012,specularPower:36,normalStrength:.55,pebblePixels:2.8} as const;
const assets=new WeakMap<Scene,StandardMaterial>();
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const smooth=(a:number,b:number,n:number)=>{const t=clamp((n-a)/(b-a));return t*t*(3-2*t);};
const noise=(x:number,y:number)=>{let n=Math.imul(x+751,374761393)^Math.imul(y+191,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
function material(scene:Scene){
 const found=assets.get(scene);if(found)return found;
 const leatherBase=[237,111,25],channelBase=[23,20,15];
 const {width:w,height:h}=BALL_STYLE,albedo=new Uint8Array(w*h*3),height=new Float32Array(w*h);
 for(let row=0;row<h;row++){
  const v=(row+.5)/h,sy=Math.cos(v*Math.PI),latitude=Math.sin(v*Math.PI);
  for(let col=0;col<w;col++){
   const u=(col+.5)/w,sx=latitude*Math.cos(u*Math.PI*2);
   // Two great-circle channels plus the curved panel pair seen on a basketball.
   const curved=Math.abs(Math.abs(sx)-(.28+.70*sy*sy))/Math.sqrt(1+1.96*sy*sy);
   const distance=Math.min(Math.abs(sy),Math.abs(sx),curved),panel=smooth(BALL_STYLE.seamHalfWidth,BALL_STYLE.seamHalfWidth+.005,distance);
   const gy=row/BALL_STYLE.pebblePixels,cy=Math.floor(gy),gx=col/BALL_STYLE.pebblePixels+(cy%2)*.5,cx=Math.floor(gx),dx=gx-cx-.5+(noise(cx,cy)-.5)*.22,dy=gy-cy-.5+(noise(cy,cx)-.5)*.2;
   const pebble=Math.pow(Math.max(0,1-(dx*dx+dy*dy)*5.7),.7),grain=(noise(col,row)-.5)*4,tone=.94+pebble*.06;
   const at=row*w+col;height[at]=panel*(.45+pebble*.22);
   const index=at*3;for(let c=0;c<3;c++){const leather=leatherBase[c]*tone+grain,channel=channelBase[c];albedo[index+c]=Math.round(channel+(leather-channel)*panel);}
  }
 }
 const normal=new Uint8Array(w*h*3);
 for(let row=0;row<h;row++)for(let col=0;col<w;col++){
  const x=(height[row*w+(col+w-1)%w]-height[row*w+(col+1)%w])*BALL_STYLE.normalStrength,y=(height[Math.max(0,row-1)*w+col]-height[Math.min(h-1,row+1)*w+col])*BALL_STYLE.normalStrength,length=Math.hypot(x,y,1),at=(row*w+col)*3;
  normal[at]=Math.round((x/length*.5+.5)*255);normal[at+1]=Math.round((y/length*.5+.5)*255);normal[at+2]=Math.round((1/length*.5+.5)*255);
 }
 const color=RawTexture.CreateRGBTexture(albedo,w,h,scene,true,false,Texture.TRILINEAR_SAMPLINGMODE),bump=RawTexture.CreateRGBTexture(normal,w,h,scene,true,false,Texture.TRILINEAR_SAMPLINGMODE);color.name='basketball:leather';color.gammaSpace=true;bump.name='basketball:grain-normal';bump.gammaSpace=false;
 const result=new StandardMaterial('basketball:pebbled-leather',scene);result.diffuseColor=Color3.White();result.diffuseTexture=color;result.bumpTexture=bump;result.specularColor=new Color3(.16,.13,.09);result.specularPower=BALL_STYLE.specularPower;assets.set(scene,result);return result;
}
export function createBasketball(scene:Scene,name='ball'){
 const ball=MeshBuilder.CreateSphere(name,{diameter:COURT.ballRadius*2,segments:BALL_STYLE.segments},scene);ball.material=material(scene);return ball;
}
