import {build} from 'esbuild';
await build({entryPoints:['apps/game-server/src/index.ts'],outfile:'apps/game-server/dist/server.mjs',platform:'node',target:'node24',format:'esm',bundle:true,packages:'external',sourcemap:true});
