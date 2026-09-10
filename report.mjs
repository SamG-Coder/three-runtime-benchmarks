import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {compareReports} from './comparison.mjs';
const load=async name=>JSON.parse(await readFile(`results/${name}.json`,'utf8'));
const [browser,native,browserFrames,nativeFrames,browserAlloc,nativeAlloc]=await Promise.all(['browser-3d','runtime-3d','browser-frames','runtime-frames','browser-allocations','runtime-allocations'].map(load));
for(const suffix of ['3d','frames','allocations']) {
  const markdown=execFileSync(process.execPath,[fileURLToPath(new URL('./compare.mjs',import.meta.url)),`results/browser-${suffix}.json`,`results/runtime-${suffix}.json`],{encoding:'utf8'});
  await writeFile(`results/comparison-${suffix}.md`,markdown);
}
const latency=compareReports(browser,native),frames=compareReports(browserFrames,nativeFrames),alloc=compareReports(browserAlloc,nativeAlloc);
const fmt=n=>Number.isFinite(n)?n.toFixed(3):'unavailable';
const median=values=>{
  if(!values.length || values.some(value=>!Number.isFinite(value))) return NaN;
  return [...values].sort((a,b)=>a-b)[Math.ceil(values.length/2)-1];
};
const lines=[
  '# Local 3D benchmark run',
  '',
  `Generated from reports dated ${browser.date} through ${nativeFrames.date}. This is an exploratory local comparison, not a universal performance claim.`,
  '',
  `Environment: ${browser.metadata.cpu.trim()}; ${browser.metadata.platform} ${browser.metadata.release}; Edge/Chromium ${browser.metadata.browserVersion}; browser GPU: ${browser.metadata.gpu}. Native backend: ${native.metadata.backend}; Node ${native.metadata.node}; Three.js revision ${browser.metadata.threeRevision}. Native checkout: ${native.metadata.revision}, dirty=${native.metadata.dirty}. The native adapter identity is not exposed by the harness.`,
  '',
  `Each case: ${browser.config.warmup} warm-ups, ${browser.config.samples} measured iterations, ${browser.config.repeats} repeats, ${browser.config.size}×${browser.config.size}, no MSAA. HTML/DOM/CSS are excluded. Latency, on-screen frame pacing and sampled allocations use separate passes.`,
  '',
  '## Completed rendering plus readback',
  '',
  'Median is the median of repeat medians. p99 pools the raw samples. Both include synchronous full-target readback. Failed image comparisons are diagnostic only.',
  '',
  'Scene | Browser median ms | Native median ms | Browser p99 ms | Native p99 ms | Image comparison',
  '--- | ---: | ---: | ---: | ---: | ---',
  ...latency.map(r=>`${r.name} | ${fmt(r.browser?.medianOfRepeatMediansMs)} | ${fmt(r.runtime?.medianOfRepeatMediansMs)} | ${fmt(r.browser?.p99Ms)} | ${fmt(r.runtime?.p99Ms)} | ${r.valid?'PASS':'FAIL — speed ratio withheld'}`),
  '',
  'The PBR lighting scene is substantially brighter in the native output. Its pose, geometry and occupancy are similar, but color differences exceed the preset threshold. Do not interpret its timings as equivalent rendering. Other scene images pass both fixed-pose comparisons.',
  '',
  '## Frame stability',
  '',
  `These are actual animation callback intervals with on-screen rendering, without timed readback. Native vsync=${nativeFrames.metadata.statsAfter?.vsync}; native window=${nativeFrames.metadata.statsAfter?.width}×${nativeFrames.metadata.statsAfter?.height}. Browser scheduling can change with display/focus state. Ratios are withheld because cadence policies differ. Per-repeat medians reveal changes that a pooled average hides.`,
  '',
  'Scene / environment | Repeat medians ms | p99 ms | Worst ms | Stddev ms | Intervals >33.38 ms',
  '--- | --- | ---: | ---: | ---: | ---:',
  ...frames.flatMap(r=>['browser','runtime'].map(env=>{const s=r[env];return `${r.name} / ${env} | ${s.repeatMediansMs.map(fmt).join(', ')} | ${fmt(s.p99Ms)} | ${fmt(s.maxMs)} | ${fmt(s.stddevMs)} | ${s.over33_33Ms}`;})),
  '',
  'Variability includes scheduler behavior and cadence changes; it cannot all be attributed to rendering or GC. These are not physical display scanout measurements or GPU-dropped-frame counts. A longer controlled run on one fixed-refresh display is needed for stable frame-pacing conclusions.',
  '',
  '## Allocation behavior',
  '',
  `Estimated V8 allocations over ${browserAlloc.config.samples} updates, median across repeats. A 32 KiB sampling interval includes objects collected during the profile. Setup is excluded; small instrumentation costs are included. These are statistical estimates, not exact allocation counts. Profiling timings are not used for speed ratios. The lighting case remains visually mismatched.`,
  '',
  'Scene | Browser allocated MiB | Native allocated MiB | Native KiB/update',
  '--- | ---: | ---: | ---:',
  ...alloc.map(r=>{const n=median(r.runtime.estimatedAllocationMiB);return `${r.name} | ${fmt(median(r.browser.estimatedAllocationMiB))} | ${fmt(n)} | ${fmt(n*1024/nativeAlloc.config.samples)}`;}),
  '',
  'Allocation hot spots in native instancing (first profiled repeat):',
  '',
  ...(nativeAlloc.results.find(r=>r.name==='3d-instances')?.resources?.allocations?.topSites||[]).slice(0,5).map(site=>`- ${site.functionName}, line ${site.line}: ${fmt(site.estimatedBytes/1048576)} MiB estimated self allocations (${site.url.split(/[\\/]/).at(-1)||'runtime internal'}).`),
  '',
  '## CPU, retained memory and garbage collection',
  '',
  'These counters come from the unprofiled latency pass. Heap delta is not allocation volume and may be negative after collection. CPU counters have different scopes: browser totals include the newly launched Chromium processes still alive at the checkpoint; native totals cover the Node/native process. Coarse OS CPU accounting limits short cases. Native RSS includes process and driver allocations; it is not GPU VRAM.',
  '',
  'Scene / environment | Median CPU ms / measured repeat | Median heap delta MiB | Native maximum observed RSS MiB | Native observed GC count / total ms',
  '--- | ---: | ---: | ---: | ---',
  ...latency.flatMap(r=>[['browser',browser],['runtime',native]].map(([env,report])=>{
    const rows=report.results.filter(x=>x.name===r.name),cpu=rows.map(x=>env==='browser'?x.resources.processDelta.liveProcessCpuSeconds:(x.resources.processDelta.cpuUserSeconds+x.resources.processDelta.cpuSystemSeconds));
    const gcCount=rows.reduce((sum,x)=>sum+(x.resources.gc?.count||0),0),gcMs=rows.reduce((sum,x)=>sum+(x.resources.gc?.totalMs||0),0);
    return `${r.name} / ${env} | ${fmt(median(cpu)*1000)} | ${fmt(median(rows.map(x=>x.resources.heapDelta.usedSize/1048576)))} | ${env==='runtime'?fmt(Math.max(...rows.map(x=>x.resources.processAfter.rssBytes))/1048576):'unavailable'} | ${env==='runtime'?gcCount+' / '+fmt(gcMs):'unavailable'}`;
  })),
  '',
  'RSS above is the maximum of end-of-interval snapshots, not an instantaneous per-scene peak. Process-lifetime high-water RSS, backing storage, external/array-buffer bytes and GC maximum durations are in the raw JSON. Browser GC pauses, GPU memory, GPU timestamp timings and native C++ allocation stacks are not collected. Three repeats are not a memory leak test.',
  '',
  '## Saved evidence',
  '',
  '- [Latency details](results/comparison-3d.md)',
  '- [Frame-pacing details](results/comparison-frames.md)',
  '- [Allocation details](results/comparison-allocations.md)',
  '- [Browser raw latency results](results/browser-3d.json) and [native raw latency results](results/runtime-3d.json)',
  '- [Browser frame results](results/browser-frames.json) and [native frame results](results/runtime-frames.json)',
  '- [Browser allocation results](results/browser-allocations.json) and [native allocation results](results/runtime-allocations.json)',
  '',
  'Browser city validation pose:',
  '',
  '![Browser city](results/browser-3d-3d-city.png)',
  '',
  'Native city validation pose:',
  '',
  '![Native city](results/runtime-3d-3d-city.png)',
  '',
  'The raw results and PNGs are generated local artifacts ignored by Git. Run the three passes and `npm run report` to create a fresh report in another checkout. The committed report is a record of this local experiment.',
  '',
  '## Earlier setup correction',
  '',
  'The first offscreen-only harness left the runtime loading state active and reused the initial black clear-color state. A stale light clear color contaminated native images and invalidated the old comparisons. The runner now explicitly ends loading and sets the same near-black background in both environments. This is a benchmark setup correction; runtime source files were not changed. Earlier version-1 failures should not be treated as evidence that the native renderer cannot draw these scenes.',
  ''
];
await writeFile('RUN-REPORT.md',lines.join('\n'));
console.log('Saved RUN-REPORT.md');
