import {Client} from '@colyseus/sdk';import {QUICK_PLAY,type QuickMode} from '../../../packages/protocol/src/quickPlay';import type {PlayerColor} from '../../../packages/protocol/src/playerColor';
export function quickPlayUrl(address:string|undefined){if(!address||!/^wss?:\/\//.test(address))throw Error('NEXT_PUBLIC_GAME_SERVER_URL 설정을 확인해주세요.');const url=new URL(address);url.protocol=url.protocol==='wss:'?'https:':'http:';url.pathname=url.pathname.replace(/\/$/,'')+'/quick-play';url.search='';url.hash='';return url.href;}
const errors:Record<string,string>={INVALID_QUICK_REQUEST:'닉네임과 색상 설정을 확인해주세요.',QUICK_BUSY:'빠른 플레이 요청이 많습니다. 잠시 후 다시 시도해주세요.',QUICK_RATE_LIMIT:'잠시 후 다시 시도해주세요.',QUICK_RACE_LIMIT:'빈자리 상태가 바뀌었습니다. 빠른 플레이를 다시 눌러주세요.',QUICK_REQUEST_EXPIRED:'참가 예약이 만료됐습니다. 다시 시도해주세요.'};
export async function quickRoom(nickname:string,color:PlayerColor,mode:QuickMode='teamDuel'){
 const address=process.env.NEXT_PUBLIC_GAME_SERVER_URL,url=quickPlayUrl(address),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),QUICK_PLAY.timeoutMs);
 let seat;try{const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID(),nickname,color,mode}),signal:controller.signal,cache:'no-store'});const body=await response.json();if(!response.ok)throw Object.assign(Error(errors[body?.error]??'빠른 플레이에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.'),{code:'QUICK_UI'});seat=body;}finally{clearTimeout(timer);}
 return new Client(address!).consumeSeatReservation(seat);
}
