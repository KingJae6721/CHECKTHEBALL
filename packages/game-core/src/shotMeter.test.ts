import test from 'node:test';import assert from 'node:assert/strict';
import {SHOT_ZONE,shotMeterLayout} from '../../../apps/web/game/shotMeterLayout.ts';
test('vertical shot meter keeps the success center on the projected rim across views and resolutions',()=>{
 for(const [width,height,y,x,size] of [[1280,800,360,800,300],[800,600,190,510,240],[1920,1080,500,1100,500],[1280,800,110,700,340],[1280,800,670,700,340]]){
  const layout=shotMeterLayout(y,x,width,height,size);assert.ok(layout);
  const greenCenter=layout.top+layout.height*(1-SHOT_ZONE.bottom-SHOT_ZONE.height/2);
  assert.ok(Math.abs(greenCenter-y)<1e-9);assert.ok(layout.top>=16-1e-9);assert.ok(layout.top+layout.height<=height-16+1e-9);assert.equal(layout.left,x);
 }
});
test('offscreen/invalid anchors hide instead of detaching the success zone from the basket',()=>{
 for(const values of [[-10,500,1280,800,300],[400,-10,1280,800,300],[400,1290,1280,800,300],[400,500,0,0,300],[NaN,500,1280,800,300]])assert.equal(shotMeterLayout(...values as [number,number,number,number,number]),null);
});
