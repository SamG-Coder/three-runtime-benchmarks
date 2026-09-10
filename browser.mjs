import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { config,machine,save } from './common.mjs';
import {makeMetrics} from './metrics.mjs';
const routes={'/webgpu.mjs':'webgpu.mjs','/three.webgpu.js':'node_modules/three/build/three.webgpu.js','/suite.mjs':'suite.mjs','/scenes3d.mjs':'scenes3d.mjs','/three.module.js':'node_modules/three/build/three.module.js','/three.core.js':'node_modules/three/build/three.core.js'};
// The empty browser document only establishes a local module origin. No HTML
// parsing, DOM layout, or UI workload is timed or passed to the native runtime.
const server=createServer(async(req,res)=>{try {
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
  if(req.url==='/') {res.setHeader('Content-Type','text/html');res.end();return;}
  const file=routes[req.url];if(!file){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type','text/javascript');res.end(await readFile(new URL(file,import.meta.url)));
}catch{res.writeHead(500);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try {
  browser=await chromium.launch({headless:false,channel:process.env.BROWSER_CHANNEL||'chrome'});
  const page=await browser.newPage({viewport:{width:800,height:700},deviceScaleFactor:1});
  const session=await page.context().newCDPSession(page);
  const browserSession=await browser.newBrowserCDPSession();
  await session.send('Performance.enable');
  const metrics=makeMetrics((method,args)=>session.send(method,args),async()=>{
    const {processInfo}=await browserSession.send('SystemInfo.getProcessInfo');
    const {metrics:entries}=await session.send('Performance.getMetrics');
    return {liveBrowserProcesses:processInfo.length,liveProcessCpuSeconds:processInfo.reduce((sum,p)=>sum+p.cpuTime,0),rendererTaskSeconds:entries.find(m=>m.name==='TaskDuration')?.value};
  });
  await page.exposeFunction('__benchMeasureBegin',profile=>metrics.begin(profile));
  await page.exposeFunction('__benchMeasureEnd',()=>metrics.end());
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const result=await page.evaluate(async({config,machine,version})=>{
    const T=await import(config.backend==='webgpu'?'/three.webgpu.js':'/three.module.js');const {runSuite}=await import('/suite.mjs');
    const gpuHooks=config.backend==='webgpu'?await import('/webgpu.mjs'):{};
    let gpu;
    if(config.backend==='webgpu') {const adapter=await navigator.gpu?.requestAdapter();if(!adapter) throw new Error('WebGPU adapter unavailable');gpu={...Object.fromEntries(['vendor','architecture','device','description'].map(k=>[k,adapter.info[k]]))};}
    else {const gl=document.createElement('canvas').getContext('webgl2');
    if(!gl) throw new Error('WebGL2 unavailable');
    const ext=gl.getExtension('WEBGL_debug_renderer_info');
    gpu=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);}
    return runSuite(T,config,{...machine,environment:config.backend==='webgpu'?'Browser stock Three.js WebGPU':'Browser Three.js WebGL2',browserVersion:version,userAgent:navigator.userAgent,gpu,threeRevision:T.REVISION},()=>{}, {
      ...gpuHooks,measureBegin:globalThis.__benchMeasureBegin,measureEnd:globalThis.__benchMeasureEnd,
      rendererReady(renderer) {if(config.mode==='frames') {document.body.style.margin='0';document.body.appendChild(renderer.domElement);}}
    });
  },{config,machine,version:browser.version()});
  if(config.backend==='webgpu') result.metadata.systemGpu=(await browserSession.send('SystemInfo.getInfo')).gpu;
  await save(process.argv[2]||'results/browser.json',result);
} finally {await browser?.close();await new Promise(r=>server.close(r));}
