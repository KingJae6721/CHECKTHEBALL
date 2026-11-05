import {startCharge,startPassCharge,releaseShot,releasePass,cancelAllCharges,type State,type Input} from './simulation';
import {startDefense,cancelDefense} from './defense';
// Down-time ownership determines the gesture. Mouseup never changes its meaning.
export function createButtons(){
 const held=new Set<number>(),attack=new Set<number>();
 return {
  down(s:State,i:Input,b:number){if(held.has(b))return false;held.add(b);if(b!==0&&b!==2)return false;
   if(s.owner!=='player')return startDefense(s,i,b===0?'STEAL':'BLOCK');
   const ok=b===0?startCharge(s):startPassCharge(s);if(ok){attack.clear();attack.add(b);}return ok;
  },
  up(s:State,i:Input,b:number){held.delete(b);if(!attack.delete(b))return false;return b===0?releaseShot(s,i):releasePass(s,i);},
  clear(s:State){held.clear();attack.clear();cancelAllCharges(s);cancelDefense(s);},
 };
}
