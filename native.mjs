import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { config, machine, save } from './common.mjs';
import { runSuite } from './suite.mjs';
import {Session} from 'node:inspector/promises';
import {PerformanceObserver} from 'node:perf_hooks';
import {makeMetrics} from './metrics.mjs';
import {collectGcWindow} from './gc.mjs';
const directGL=process.argv.includes('--direct-gl');
if(directGL&&config.backend==='webgpu') throw new Error('Choose --direct-gl or --webgpu, not both');
let directContext;
const root=process.env.THREEBROWSER_ROOT;
if(!root) throw new Error('Set THREEBROWSER_ROOT to the ThreeBrowser repository directory');
process.env.THREEBROWSER_RUNTIME_ADDON ||= resolve(root,'ThreeBrowserRuntime/build/bin/three_browser_runtime.node');
if(config.backend==='webgpu') process.env.THREEBROWSER_RUNTIME_NODE_MODULES=fileURLToPath(new URL('./node_modules',import.meta.url));
const host=await import(pathToFileURL(resolve(root,config.backend==='webgpu'?'ThreeBrowserRuntime/build/bin/runtime/browser-host.mjs':'ThreeBrowserRuntime/runtime/browser-host.mjs')));
const session=new Session();session.connect();
const gcEvents=[];
const observer=new PerformanceObserver(list=>gcEvents.push(...list.getEntries()));observer.observe({entryTypes:['gc']});
const metrics=makeMetrics((method,args)=>session.post(method,args),async()=>{
  const mem=process.memoryUsage(),cpu=process.cpuUsage();
  return {rssBytes:mem.rss,externalBytes:mem.external,arrayBufferBytes:mem.arrayBuffers,cpuUserSeconds:cpu.user/1e6,cpuSystemSeconds:cpu.system/1e6,maxRssBytes:process.resourceUsage().maxRSS*1024};
});
let gcStart;
try {
  let T,gpuHooks={};
  if(config.backend==='webgpu') {
    globalThis.innerWidth=config.size;globalThis.innerHeight=config.size;
    T=await host.loadEntry(fileURLToPath(new URL('./native-webgpu-entry/entry.mjs',import.meta.url)));
    gpuHooks=await import('./webgpu.mjs');
  } else if(directGL) {
    T=await import(new URL('./node_modules/three/build/three.module.js',import.meta.url));
    const raw=await import(pathToFileURL(resolve(root,'ThreeBrowserRuntime/runtime/raw-gl.mjs')));
    gpuHooks={createRenderer:()=>{const renderer=raw.createRawGLRenderer(T,host,config.size);directContext=renderer.getContext();return renderer;}};
  } else T=host.loadThreeShim(resolve(root,'host/ThreeBrowser/web/three'));
  const revision=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const dirty=!!execFileSync('git',['-C',root,'status','--porcelain'],{encoding:'utf8'}).trim();
  if(config.mode==='frames') host.start();
  const result=await runSuite(T,config,{...machine,environment:directGL?'ThreeBrowserRuntime stock Three.js direct OpenGL':config.backend==='webgpu'?'ThreeBrowserRuntime stock Three.js native WebGPU':'ThreeBrowserRuntime native facade',revision,dirty,threeRevision:T.REVISION,statsBefore:host.native.stats(),gpu:config.backend==='webgpu'?host.native.gpuCapabilities?.():undefined,backend:host.native.backendName?.()},()=>{if(!directGL&&config.backend!=='webgpu') globalThis.__TN.cmd.submit();},{
    ...gpuHooks,
    async rendererReady(renderer) {
      // The launcher normally hides its loading overlay on the first window
      // frame. Offscreen benchmarks never present that frame; explicitly end
      // loading before measuring so the overlay cannot overwrite GL state.
      if(typeof host.native.setLoading!=='function') throw new Error('Native addon must expose setLoading to run isolated benchmarks');
      host.native.setLoading(false,'Benchmark ready');
      if(config.mode==='frames') {
        if(config.backend==='webgpu') host.document.body.appendChild(renderer.domElement);
        host.native.resize(config.size,config.size);
        await new Promise(resolve=>requestAnimationFrame(resolve));
      }
    },
    async measureBegin(profile) {await metrics.begin(profile);gcStart=performance.now();},
    async measureEnd() {
      const gcEnd=performance.now();const result=await metrics.end();
      result.gc=await collectGcWindow(observer,gcEvents,gcStart,gcEnd);
      return result;
    }
  });
  result.metadata.statsAfter=host.native.stats();
  if(directContext) result.metadata.directGL={renderer:directContext.getParameter(directContext.RENDERER),version:directContext.getParameter(directContext.VERSION),bridgeStats:directContext.getBridgeStats(),commandStats:directContext.getCommandStats(),coalescing:process.env.THREEBROWSER_DISABLE_RAW_GL_COALESCING!=='1',uniformCache:process.env.THREEBROWSER_DISABLE_RAW_GL_COALESCING!=='1'&&process.env.THREEBROWSER_RAW_GL_UNIFORM_CACHE==='1',sceneLayer:'stock Three.js; no native threepp scene objects'};
  await save(process.argv[2]||'results/runtime.json',result);
} finally {observer.disconnect();session.disconnect();host.stop();}
