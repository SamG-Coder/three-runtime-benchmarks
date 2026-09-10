import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {summarize,validateConfig,runSuite} from './suite.mjs';
import {createScene3D,threeDWorkloads,imageSummary,imageDifference} from './scenes3d.mjs';
import {sampledAllocationBytes,deltaFields,allocationSites} from './metrics.mjs';
import {compareReports} from './comparison.mjs';
import {execFileSync} from 'node:child_process';
import {createRenderer as createWebGPURenderer,beginLogicalFrame} from './webgpu.mjs';

test('WebGPU logical frames advance FRAME-scoped lighting and shadow state',()=>{
  const nodeFrame={frameId:3,update(){this.frameId++;}};
  let resets=0;
  const renderer={info:{autoReset:true,reset(){resets++;}},_nodes:{nodeFrame}};
  beginLogicalFrame(renderer);beginLogicalFrame(renderer);
  assert.equal(nodeFrame.frameId,5);assert.equal(renderer.info.frame,5);assert.equal(resets,2);
});

test('WebGPU measurement awaits every warmup, sample and validation',async()=>{
  let steps=0,checked=false,disposed=false;
  const renderer={setPixelRatio(){},setSize(){},setClearColor(){},dispose(){disposed=true;}};
  const result=await runSuite({}, {backend:'webgpu',warmup:2,samples:3,repeats:1,size:512,tests:['3d-meshes']},{},()=>{}, {
    createRenderer:async()=>renderer,
    makeCase:()=>({async step(){await new Promise(r=>setTimeout(r,1));steps++;},async check(){await Promise.resolve();assert.equal(steps,5);checked=true;return {valid:true};},dispose(){}})
  });
  assert.equal(result.results[0].status,'valid');assert.equal(checked,true);assert.equal(disposed,true);
});

test('WebGPU runner rejects a WebGL fallback',async()=>{
  await assert.rejects(createWebGPURenderer({WebGPURenderer:class {backend={isWebGPUBackend:false};async init(){}}}),/fallback/);
});
test('percentiles preserve sample order and reject invalid samples',()=>{
  const s=[9,1,5,2,3],stats=summarize(s);assert.equal(stats.medianMs,3);assert.equal(stats.p95Ms,9);assert.equal(stats.meanMs,4);assert.deepEqual(s,[9,1,5,2,3]);assert.throws(()=>summarize([]));assert.throws(()=>summarize([NaN]));
});
test('invalid workloads and counts are rejected',()=>{assert.throws(()=>validateConfig({warmup:1,samples:0,repeats:1,size:512,tests:['unknown']}));});
test('tail latency and budget exceedances retain an isolated hitch',()=>{
  const result=summarize([...Array(99).fill(10),100]);assert.equal(result.p95Ms,10);assert.equal(result.maxMs,100);assert.equal(result.over33_33Ms,1);assert.ok(result.stddevMs>0);
});
test('3D scenes contain the declared geometry and deterministic animated camera/matrices',()=>{
  for(const name of threeDWorkloads) {
    const built=createScene3D(T,name);built.update(0);built.scene.updateMatrixWorld(true);
    assert.equal(built.camera.isPerspectiveCamera,true);
    let triangles=0;built.scene.traverse(o=>{if(o.isMesh) triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);});
    assert.equal(triangles,built.details.submittedTriangles,name);
    built.update(47);const pose=built.camera.position.toArray();built.update(0);built.update(47);assert.deepEqual(built.camera.position.toArray(),pose);
    built.dispose();
  }
});
test('image signature distinguishes empty, solid and spatially different output',()=>{
  const image=new Uint8Array(32*32*4);assert.equal(imageSummary(image,32).foreground,0);image.fill(255);assert.equal(imageSummary(image,32).foreground,1);
  assert.equal(imageDifference([0,255],[255,0]),1);
});
test('allocation aggregation includes children and preserves negative heap deltas',()=>{
  assert.equal(sampledAllocationBytes({head:{selfSize:32,children:[{selfSize:64}]}}),96);assert.deepEqual(deltaFields({usedSize:100},{usedSize:40}),{usedSize:-60});
  const frame={functionName:'update',url:'test.mjs',lineNumber:3};
  assert.deepEqual(allocationSites({head:{selfSize:0,children:[{selfSize:32,callFrame:frame},{selfSize:64,callFrame:frame}]}}),[{functionName:'update',url:'test.mjs',line:4,estimatedBytes:96}]);
});
test('comparison withholds ratios when renderings differ despite local checks passing',()=>{
  const config={tests:['3d-meshes'],repeats:1};
  const make=value=>({workloadVersion:2,config,metadata:{},results:[{name:'3d-meshes',repeat:0,status:'valid',samples:[1],medianMs:1,check:{first:{thumbnail:[value],foreground:.5},second:{thumbnail:[value],foreground:.5}}}]});
  assert.equal(compareReports(make(0),make(255))[0].valid,false);assert.equal(compareReports(make(0),make(0))[0].ratio,1);
});

test('WebGPU frame comparisons require recorded native presentation',()=>{
  const config={backend:'webgpu',mode:'frames',tests:['3d-meshes'],repeats:1,size:512};
  const pose={thumbnail:[32],foreground:.5};
  const make=presents=>({workloadVersion:2,config,metadata:{statsBefore:{presents:0},statsAfter:{width:512,height:512,presents}},results:[{name:'3d-meshes',repeat:0,status:'valid',samples:[1],medianMs:1,check:{first:pose,second:pose}}]});
  assert.equal(compareReports(make(1),make(0))[0].valid,false);
  assert.equal(compareReports(make(1),make(1))[0].valid,true);
});
test('GC measurements collect events from a synchronous workload before moving on',()=>{
  const moduleUrl=new URL('./gc.mjs',import.meta.url).href;
  const code=`import {PerformanceObserver} from 'node:perf_hooks'; import {collectGcWindow} from ${JSON.stringify(moduleUrl)}; const events=[];const observer=new PerformanceObserver(list=>events.push(...list.getEntries()));observer.observe({entryTypes:['gc']});const start=performance.now();global.gc();global.gc();const end=performance.now();const result=await collectGcWindow(observer,events,start,end);observer.disconnect();console.log(JSON.stringify(result));`;
  const result=JSON.parse(execFileSync(process.execPath,['--expose-gc','--input-type=module','-e',code],{encoding:'utf8'}));
  assert.ok(result.count>=2);assert.ok(result.totalMs>0);
});
test('CPU cases produce verified results and repeat samples',async()=>{
  const r=await runSuite(T,{warmup:1,samples:2,repeats:2,size:512,tests:['typed-array','scene-transforms']},{});
  assert.equal(r.results.length,4);assert.ok(r.results.every(x=>x.samples.length===2 && x.status==='valid'));assert.equal(r.results[0].check.last,256.75);
});
