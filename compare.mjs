import {readFile} from 'node:fs/promises';
import {compareReports} from './comparison.mjs';
const paths=process.argv.slice(2);
if(paths.length && paths.length!==2) throw new Error('Provide exactly two JSON paths: browser then runtime');
const [a,b]=await Promise.all((paths.length?paths:['results/browser.json','results/runtime.json']).map(async p=>JSON.parse(await readFile(p,'utf8'))));
if(!a.metadata.environment.startsWith('Browser') || !b.metadata.environment.startsWith('ThreeBrowserRuntime')) throw new Error('Reports must be browser first, runtime second');
const rows=compareReports(a,b),fmt=x=>Number.isFinite(x)?x.toFixed(3):'—';
console.log(`# ${a.config.mode==='frames'?'On-screen callback frame pacing':'Completed render/readback latency'}${a.config.profileAllocations?' — allocation profiling enabled':''}\n`);
console.log('Workload | Browser median ms | Runtime median ms | Browser/runtime | Correctness');
console.log('--- | ---: | ---: | ---: | ---');
for(const r of rows) console.log(`${r.name} | ${fmt(r.browser?.medianOfRepeatMediansMs)} | ${fmt(r.runtime?.medianOfRepeatMediansMs)} | ${r.ratio!==null?fmt(r.ratio)+'x':'withheld'} | ${r.valid?'PASS':'FAIL'}`);
console.log('\nTiming values for failed cases are diagnostic only. No speed comparison is valid for mismatched rendering. Ratios above 1 mean lower native latency.\n');
if(a.config.mode==='frames') console.log(`Browser callbacks follow its display scheduler; native vsync=${b.metadata.statsAfter?.vsync}. Cadences may differ, so frame interval ratios are withheld. Compare tails, variation and budget exceedances under each recorded pacing policy.\n`);
if(a.config.profileAllocations) console.log('Allocation profiling adds overhead. Timing ratios are withheld for this separate profiling pass.\n');
console.log('Workload / environment | repeat medians ms | p95 ms | p99 ms | worst ms | stddev ms | >16.72 ms | >33.38 ms | heap change MiB, by repeat');
console.log('--- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---');
for(const r of rows) for(const env of ['browser','runtime']) {const s=r[env];if(s)console.log(`${r.name} / ${env} | ${s.repeatMediansMs.map(fmt).join(', ')} | ${fmt(s.p95Ms)} | ${fmt(s.p99Ms)} | ${fmt(s.maxMs)} | ${fmt(s.stddevMs)} | ${s.over16_67Ms} | ${s.over33_33Ms} | ${s.heapDeltaMiB.map(fmt).join(', ')}`);}
if(a.config.profileAllocations) {
  console.log('\nWorkload | Browser estimated allocations MiB, by repeat | Runtime estimated allocations MiB, by repeat\n--- | --- | ---');
  for(const r of rows) console.log(`${r.name} | ${r.browser?.estimatedAllocationMiB.map(fmt).join(', ')} | ${r.runtime?.estimatedAllocationMiB.map(fmt).join(', ')}`);
}
console.log('\nHeap change is retained heap growth/shrinkage, not total allocation. CPU counters, native RSS/external memory and GC durations, and sampled allocation rates (when enabled) are in the JSON. Browser GC timing and GPU memory are unavailable. Frame pacing measures animation callback intervals, not physical display scanout; latency mode does not measure frame pacing.\n');
for(const r of rows) if(r.reasons.length) console.log(`- ${r.name}: ${r.reasons.join('; ')}`);
