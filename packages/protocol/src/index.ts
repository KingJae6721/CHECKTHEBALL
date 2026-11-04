// One moveSeq represents exactly one 1/60s movement step, never a duration or a held state.
// processedMoveSeq is the contiguous retired frontier (executed OR explicitly discarded).
// processedInputSeq identifies its transport seq; processedActionSeq acknowledges processed actions.
// Replay only moveSeq > processedMoveSeq. movementSync retires movement without cancelling actions.
export const NETWORK={protocolVersion:4,tickRate:60,snapshotRate:20,inputRate:60,inputTimeoutMs:600,maxMoveAgeMs:200,maxMessagesPerSecond:100,maxActions:32,maxMessageLength:2048,interpolationMs:100,maxQueuedMoves:12,maxPendingInputs:64,maxPredictionSteps:4,maxPredictionGapMs:250,positionEpsilon:.0001,visualSnapDistance:.08,visualResponse:14};
export const actions=['jump','shotDown','shotUp','passDown','passUp','crossover','steal','block','cancel','movementSync'] as const;
export type Action=typeof actions[number];
export type InputMessage={seq:number;moveSeq?:number;x:number;z:number;sprint:boolean;yaw:number;pitch:number;actions:Action[]};
export type {WorldSnapshot,ActorSnapshot} from '../../game-core/src/online';
export function validInput(value:unknown):value is InputMessage{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;const m=value as InputMessage;
 let length:number;try{length=JSON.stringify(value).length;}catch{return false;}
 if(length>NETWORK.maxMessageLength||Object.keys(value).some(k=>!['seq','moveSeq','x','z','sprint','yaw','pitch','actions'].includes(k)))return false;
 if(m.moveSeq!==undefined&&(!Number.isSafeInteger(m.moveSeq)||m.moveSeq<1))return false;
 return Number.isSafeInteger(m.seq)&&m.seq>=0&&[m.x,m.z,m.yaw,m.pitch].every(Number.isFinite)&&Math.abs(m.x)<=1&&Math.abs(m.z)<=1&&Math.abs(m.yaw)<=Math.PI&&Math.abs(m.pitch)<=1.2&&typeof m.sprint==='boolean'&&Array.isArray(m.actions)&&m.actions.length<=8&&m.actions.every(a=>actions.includes(a));
}
