import {Matrix,Vector3,type Camera,type Scene} from '@babylonjs/core';
import {CFG,type State} from '../../../packages/game-core/src/simulation';
import {SHOT_METER,SHOT_ZONE,shotMeterLayout} from './shotMeterLayout';

// One DOM overlay, projected from the rendered camera. Never feeds gameplay state.
export function createHoopShotMeter(canvas:HTMLCanvasElement,scene:Scene,camera:Camera){
 const root=document.createElement('div');root.className='hoop-shot-meter';root.hidden=true;root.setAttribute('aria-hidden','true');
 const child=(className:string,parent:HTMLElement=root)=>{const node=document.createElement('div');node.className=className;parent.appendChild(node);return node;};
 const title=child('hoop-meter-title');title.textContent='SHOT';
 const track=child('hoop-meter-track'),fill=child('hoop-meter-fill',track),zone=child('hoop-meter-perfect',track);
 zone.style.bottom=`${SHOT_ZONE.bottom*100}%`;zone.style.height=`${SHOT_ZONE.height*100}%`;
 const marker=child('hoop-meter-marker'),guide=child('hoop-meter-guide'),hint=child('hoop-meter-hint');
 guide.style.top=`${(1-SHOT_ZONE.center)*100}%`;hint.textContent='좌클릭 유지';
 canvas.parentElement?.appendChild(root);
 const rim=new Vector3(CFG.rim.x,CFG.rim.y,CFG.rim.z),anchor=new Vector3(CFG.rim.x+SHOT_METER.worldOffset,CFG.rim.y,CFG.rim.z);
 const rimScreen=new Vector3(),anchorScreen=new Vector3(),toRim=new Vector3();let disposed=false,active=false;
 function update(state:State,enabled:boolean){
  if(disposed)return;
  if(!enabled||state.owner!=='player'||state.phase==='PASS_CHARGING'){root.hidden=true;return;}
  const engine=scene.getEngine(),renderWidth=engine.getRenderWidth(),renderHeight=engine.getRenderHeight(),width=canvas.clientWidth,height=canvas.clientHeight;
  const viewport=camera.viewport.toGlobal(renderWidth,renderHeight),matrix=camera.getTransformationMatrix();
  Vector3.ProjectToRef(rim,Matrix.IdentityReadOnly,matrix,viewport,rimScreen);Vector3.ProjectToRef(anchor,Matrix.IdentityReadOnly,matrix,viewport,anchorScreen);
  toRim.copyFrom(rim).subtractInPlace(camera.globalPosition);
  if(Vector3.Dot(toRim,camera.getForwardRay().direction)<=0||rimScreen.z<0||rimScreen.z>1||anchorScreen.z<0||anchorScreen.z>1){root.hidden=true;return;}
  const x=rimScreen.x/renderWidth*width,y=rimScreen.y/renderHeight*height,anchorX=anchorScreen.x/renderWidth*width;
  if(x<0||x>width||y<0||y>height){root.hidden=true;return;}
  const depth=Math.max(.01,Vector3.Dot(toRim,camera.getForwardRay().direction));
  const layout=shotMeterLayout(y,anchorX,width,height,SHOT_METER.worldHeight*height/(2*depth*Math.tan(camera.fov/2)));
  if(!layout){root.hidden=true;return;}
  root.hidden=false;root.style.left=`${layout.left}px`;root.style.top=`${layout.top}px`;root.style.width=`${layout.width}px`;root.style.height=`${layout.height}px`;
  const charging=state.phase==='CHARGING';if(charging!==active){active=charging;root.classList.toggle('charging',active);hint.textContent=active?'놓으면 슛':'좌클릭 유지';}
  const power=charging?Math.max(0,Math.min(1,state.charge/CFG.maxCharge)):0;fill.style.transform=`scaleY(${power})`;marker.style.bottom=`${power*100}%`;
  const edge=layout.left-layout.width/2,gap=x-edge,from=gap<0?gap+Math.min(18,-gap*.35):layout.width;
  guide.style.left=`${from}px`;guide.style.width=`${Math.max(0,gap<0?-from:gap-layout.width-Math.min(18,gap*.35))}px`;
 }
 function dispose(){if(disposed)return;disposed=true;root.remove();}
 scene.onDisposeObservable.addOnce(dispose);return {update,dispose};
}
