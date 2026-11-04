// Counters only; no console spam, growing arrays or React updates per frame.
export class FrameDiagnostics{
 lastFrameMs=0;frames=0;totalMs=0;maxMs=0;longFrames=0;mouseEvents=0;eventsSinceFrame=0;lastEvents=0;angleStep=0;cameraError=0;maxRenderMs=0;
 private previous=0;private start=0;private yaw=0;private pitch=0;
 mouse(){this.mouseEvents++;this.eventsSinceFrame++;}
 begin(now:number,yaw:number,pitch:number){if(this.previous){const ms=now-this.previous;this.lastFrameMs=ms;this.frames++;this.totalMs+=ms;this.maxMs=Math.max(this.maxMs,ms);if(ms>=50)this.longFrames++;}this.previous=now;this.start=now;this.angleStep=Math.hypot(yaw-this.yaw,pitch-this.pitch);this.yaw=yaw;this.pitch=pitch;this.lastEvents=this.eventsSinceFrame;this.eventsSinceFrame=0;}
 end(now:number,cameraYaw:number,cameraPitch:number,inputYaw:number,inputPitch:number){this.maxRenderMs=Math.max(this.maxRenderMs,now-this.start);this.cameraError=Math.hypot(cameraYaw-inputYaw,cameraPitch-inputPitch);}
 reset(){this.frames=0;this.totalMs=0;this.maxMs=0;this.longFrames=0;this.maxRenderMs=0;this.mouseEvents=0;this.previous=0;}
 text(){return `FRAME avg ${(this.totalMs/Math.max(1,this.frames)).toFixed(1)}ms max ${this.maxMs.toFixed(1)}ms · long>=50 ${this.longFrames}\nRENDER max ${this.maxRenderMs.toFixed(1)}ms · mouse/frame ${this.lastEvents} · angle ${this.angleStep.toFixed(3)}rad\nLOCAL yaw ${this.yaw.toFixed(3)} pitch ${this.pitch.toFixed(3)} · camera error ${this.cameraError.toFixed(6)}rad`;}
}
