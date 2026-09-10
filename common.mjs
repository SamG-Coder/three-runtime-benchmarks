import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import os from 'node:os';
import {PNG} from 'pngjs';
import { workloads, validateConfig } from './suite.mjs';
import {threeDWorkloads} from './scenes3d.mjs';
export const config={warmup:Number(process.env.WARMUP||30),samples:Number(process.env.SAMPLES||120),repeats:Number(process.env.REPEATS||3),size:512,tests:process.env.TESTS?.split(',')||((process.argv.includes('--3d')||process.argv.includes('--webgpu'))?threeDWorkloads:workloads),mode:process.argv.includes('--frames')?'frames':'latency',profileAllocations:process.argv.includes('--allocations')};
if(process.argv.includes('--webgpu')) config.backend='webgpu';
validateConfig(config);
export const machine={platform:os.platform(),release:os.release(),arch:os.arch(),cpu:os.cpus()[0]?.model,node:process.version};
export async function save(path,result) {
  await mkdir(dirname(path),{recursive:true});
  for(const capture of result.captures||[]) {
    const raw=Buffer.from(capture.rgba,'base64'), png=new PNG({width:capture.width,height:capture.height});
    for(let y=0;y<capture.height;y++) raw.copy(png.data,y*capture.width*4,(capture.origin==='top-left'?y:capture.height-1-y)*capture.width*4,(capture.origin==='top-left'?y+1:capture.height-y)*capture.width*4);
    const imagePath=path.replace(/\.json$/,'')+`-${capture.name}.png`;
    await writeFile(imagePath,PNG.sync.write(png));delete capture.rgba;capture.path=imagePath;
  }
  await writeFile(path,JSON.stringify(result,null,2)+'\n');console.log(`Saved ${path}`);
}
