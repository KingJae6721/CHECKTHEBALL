import test from 'node:test';import assert from 'node:assert/strict';
import {PLAYER_COLORS,isPlayerColor,playerColor,playerPalette} from '../../protocol/src/playerColor.ts';
import {OnlineWorld} from './online.ts';
test('player colors accept only preset IDs and corrupted/missing preferences use the default',()=>{
 for(const id of Object.keys(PLAYER_COLORS)){assert.equal(isPlayerColor(id),true);assert.match(playerPalette(id).uniform,/^#[0-9a-f]{6}$/);}
 for(const value of [null,undefined,'__proto__','toString','red','#ff0000',{color:'orange'}]){assert.equal(isPlayerColor(value),false);assert.equal(playerColor(value),'teal');}
});
test('selected colors belong to actor IDs, independently of local perspective, seats and identical choices',()=>{
 const world=new OnlineWorld();world.join('a','A','orange');world.join('b','B','blue');const players=world.snapshot().players;
 for(const view of [players,[...players].reverse()]){assert.equal(view.find(p=>p.id==='a')?.color,'orange');assert.equal(view.find(p=>p.id==='b')?.color,'blue');}
 world.leave('a');world.join('c','C','blue');assert.equal(world.actors.get('c')?.color,'blue');assert.equal(world.actors.get('b')?.color,'blue');
});
