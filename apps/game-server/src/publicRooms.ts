import {createEndpoint,createRouter,matchMaker} from '@colyseus/core';
import {ROOM_DIRECTORY,type PublicRoom} from '../../../packages/protocol/src/rooms';
import type {BasketballRoom} from './server';

export async function publicRooms():Promise<PublicRoom[]>{
 const cached=await matchMaker.query({name:'basketball',private:false,locked:false}),rooms:PublicRoom[]=[];
 for(const listing of cached){
  const room=matchMaker.getLocalRoomById(listing.roomId) as BasketballRoom|undefined;
  if(!room||room.roomName!=='basketball'||room.directoryPrivate||!room.world.canJoin()||room.hasReachedMaxClients()||room.world.actors.size===0||room.world.actors.size>=room.maxClients)continue;
  if(room.world.mode!=='duel'&&room.world.mode!=='practice'&&room.world.mode!=='practice2v2'&&room.world.mode!=='teamDuel')continue;
  rooms.push({roomId:room.roomId,roomName:room.directoryName,mode:room.world.mode,players:room.world.actors.size,maxPlayers:room.maxClients,status:'WAITING'});
  if(rooms.length>=ROOM_DIRECTORY.maxResults)break;
 }
 return rooms;
}
export function directoryRouter(webOrigins:readonly string[]){
 return createRouter({publicRooms:createEndpoint('/public-rooms',{method:'GET'},async ctx=>{
  if(!ctx.request)return new Response(null,{status:400});
  const origin=ctx.request.headers.get('origin'),sameOrigin=new URL(ctx.request.url).origin;
  const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Origin':origin&&(origin===sameOrigin||webOrigins.includes(origin))?origin:sameOrigin};
  if(origin&&origin!==sameOrigin&&!webOrigins.includes(origin))return new Response(JSON.stringify({error:'허용되지 않은 웹 origin입니다.'}),{status:403,headers});
  try{return new Response(JSON.stringify({rooms:await publicRooms(),listedAt:Date.now()}),{headers});}
  catch{return new Response(JSON.stringify({error:'방 목록을 불러오지 못했습니다.'}),{status:503,headers});}
 })});
}
