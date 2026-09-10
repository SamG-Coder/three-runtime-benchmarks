import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { config,machine,save } from './common.mjs';
const routes={'/':'index.html','/suite.mjs':'suite.mjs','/three.module.js':'node_modules/three/build/three.module.js','/three.core.js':'node_modules/three/build/three.core.js'};
const server=createServer(async(req,res)=>{try {const file=routes[req.url];if(!file){res.writeHead(404);res.end();return;}res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Content-Type',file.endsWith('.html')?'text/html':'text/javascript');res.end(await readFile(new URL(file,import.meta.url)));}catch{res.writeHead(500);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try {
  browser=await chromium.launch({headless:false,channel:process.env.BROWSER_CHANNEL||'chrome'});
  const page=await browser.newPage({viewport:{width:800,height:700},deviceScaleFactor:1});
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const result=await page.evaluate(async({config,machine,version})=>{
    const T=await import('/three.module.js');const {runSuite}=await import('/suite.mjs');
    const gl=document.createElement('canvas').getContext('webgl2');
    if(!gl) throw new Error('WebGL2 unavailable');
    const ext=gl.getExtension('WEBGL_debug_renderer_info');
    const gpu=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
    return runSuite(T,config,{...machine,environment:'Browser Three.js WebGL2',browserVersion:version,userAgent:navigator.userAgent,gpu,threeRevision:T.REVISION});
  },{config,machine,version:browser.version()});
  await save(process.argv[2]||'results/browser.json',result);
} finally {await browser?.close();await new Promise(r=>server.close(r));}
