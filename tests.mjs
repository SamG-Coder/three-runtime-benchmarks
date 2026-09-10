import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {summarize,validateConfig,runSuite} from './suite.mjs';
test('percentiles preserve sample order and reject invalid samples',()=>{
  const s=[9,1,5,2,3];assert.deepEqual(summarize(s),{medianMs:3,p95Ms:9,meanMs:4});assert.deepEqual(s,[9,1,5,2,3]);assert.throws(()=>summarize([]));assert.throws(()=>summarize([NaN]));
});
test('invalid workloads and counts are rejected',()=>{assert.throws(()=>validateConfig({warmup:1,samples:0,repeats:1,size:512,tests:['unknown']}));});
test('CPU cases produce verified results and repeat samples',async()=>{
  const r=await runSuite(T,{warmup:1,samples:2,repeats:2,size:512,tests:['typed-array','scene-transforms']},{});
  assert.equal(r.results.length,4);assert.ok(r.results.every(x=>x.samples.length===2 && x.status==='valid'));assert.equal(r.results[0].check.last,256.75);
});
