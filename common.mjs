import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import os from 'node:os';
import { workloads, validateConfig } from './suite.mjs';
export const config={warmup:Number(process.env.WARMUP||30),samples:Number(process.env.SAMPLES||120),repeats:Number(process.env.REPEATS||3),size:512,tests:process.env.TESTS?.split(',')||workloads};
validateConfig(config);
export const machine={platform:os.platform(),release:os.release(),arch:os.arch(),cpu:os.cpus()[0]?.model,node:process.version};
export async function save(path,result) { await mkdir(dirname(path),{recursive:true}); await writeFile(path,JSON.stringify(result,null,2)+'\n'); console.log(`Saved ${path}`); }
