import {matchMaker} from '@colyseus/core';import type {BasketballRoom} from './server';import {QUICK_PLAY,quickRequest,type QuickRequest} from '../../../packages/protocol/src/quickPlay';
export class QuickError extends Error{constructor(readonly status:number,readonly code:string){super(code);}}
export class QuickPlay{
 constructor(private api=matchMaker){}
 private tail=Promise.resolve();private queued=0;private rateAt=0;private rateCount=0;
 private records=new Map<string,{fingerprint:string;expires:number;reservationExpires:number;promise:ReturnType<typeof matchMaker.reserveSeatFor>}>();
 private async allocate(options:QuickRequest){
  for(let attempt=0;attempt<QUICK_PLAY.attempts;attempt++){
   const candidates=(await this.api.query({name:'basketball',private:false,locked:false})).filter(listing=>{const r=this.api.getLocalRoomById(listing.roomId) as BasketballRoom|undefined;return r&&!r.directoryPrivate&&r.world.mode==='teamDuel'&&r.world.match?.stage==='WAITING'&&!r.hasReachedMaxClients()&&r.world.canJoin();});
   const listing=candidates.length?candidates[Math.floor(Math.random()*candidates.length)]:await this.api.createRoom('basketball',{mode:'teamDuel',isPrivate:false,nickname:options.nickname});
   const room=this.api.getLocalRoomById(listing.roomId) as BasketballRoom|undefined;
   if(!room||!room.world.canJoin()||room.locked||room.hasReachedMaxClients())continue;
   try{return {seat:await this.api.reserveSeatFor(listing,{nickname:options.nickname,color:options.color}),timeoutMs:room.seatReservationTimeout*1000};}
   catch(error){const current=this.api.getLocalRoomById(listing.roomId) as BasketballRoom|undefined;if(!current||!current.world.canJoin()||current.locked||current.hasReachedMaxClients())continue;throw error;}
  }
  throw new QuickError(409,'QUICK_RACE_LIMIT');
 }
 request(value:unknown){
  const now=Date.now();if(now-this.rateAt>=60000){this.rateAt=now;this.rateCount=0;}if(++this.rateCount>QUICK_PLAY.requestsPerMinute)throw new QuickError(429,'QUICK_RATE_LIMIT');const input=quickRequest(value);if(!input)throw new QuickError(400,'INVALID_QUICK_REQUEST');for(const [id,r] of this.records)if(r.expires<now)this.records.delete(id);
  const fingerprint=JSON.stringify([input.nickname,input.color]),old=this.records.get(input.requestId);if(old){if(old.fingerprint!==fingerprint)throw new QuickError(409,'QUICK_REQUEST_CONFLICT');if(old.reservationExpires<=now)throw new QuickError(409,'QUICK_REQUEST_EXPIRED');return old.promise;}
  if(this.queued>=QUICK_PLAY.maxQueued||this.records.size>=QUICK_PLAY.maxRecords)throw new QuickError(429,'QUICK_BUSY');
  this.queued++;const record={fingerprint,expires:Infinity,reservationExpires:Infinity,promise:undefined as unknown as ReturnType<typeof matchMaker.reserveSeatFor>};
  const promise=this.tail.then(async()=>{if(Date.now()-now>QUICK_PLAY.timeoutMs)throw new QuickError(503,'QUICK_QUEUE_EXPIRED');const {seat,timeoutMs}=await this.allocate(input);record.reservationExpires=Date.now()+timeoutMs;return seat;}).finally(()=>{this.queued--;record.expires=Date.now()+QUICK_PLAY.cacheMs;});
  this.tail=promise.then(()=>{},()=>{});record.promise=promise;this.records.set(input.requestId,record);return promise;
 }
}
