import { cpSync, rmSync } from 'node:fs';
rmSync('out',{recursive:true,force:true});cpSync('apps/web/out','out',{recursive:true});
