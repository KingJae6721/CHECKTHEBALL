import test from 'node:test';import assert from 'node:assert/strict';
import {scoreGains} from '../../../apps/web/game/scoreboard.ts';
test('score bursts use the authoritative scorer and exact points, and repeated snapshots stay silent',()=>{
 const before=[{id:'me',score:0},{id:'other',score:2}],after=[{id:'other',score:2},{id:'me',score:3}];
 assert.deepEqual(scoreGains(before,after),[{id:'me',points:3}]);assert.deepEqual(scoreGains(after,after),[]);
 assert.deepEqual(scoreGains(after,[{id:'me',score:3},{id:'other',score:4}]),[{id:'other',points:2}]);
});
test('joining, score resets and large catch-up deltas cannot replay an old basket',()=>{
 assert.deepEqual(scoreGains([],[{id:'other',score:8}]),[]);
 assert.deepEqual(scoreGains([{id:'me',score:8}],[{id:'me',score:0}]),[]);
 assert.deepEqual(scoreGains([{id:'me',score:0}],[{id:'me',score:5}]),[]);
 assert.deepEqual(scoreGains([{id:'offline',score:0}],[{id:'offline',score:1}]),[{id:'offline',points:1}]);
});
