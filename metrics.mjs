// Both Node and Chromium expose this V8 inspector protocol. Profiling is opt-in
// because collecting allocation stacks changes the workload's timing.
export function sampledAllocationBytes(profile) {
  if(!profile?.head) return null;
  const walk=node=>(node.selfSize||0)+(node.children||[]).reduce((sum,child)=>sum+walk(child),0);
  return walk(profile.head);
}
export function allocationSites(profile) {
  const sites=new Map();
  const walk=node=>{
    const frame=node.callFrame||{},key=JSON.stringify([frame.functionName,frame.url,frame.lineNumber]);
    if(node.selfSize) {
      const item=sites.get(key)||{functionName:frame.functionName||'(anonymous)',url:frame.url||'',line:(frame.lineNumber??-1)+1,estimatedBytes:0};
      item.estimatedBytes+=node.selfSize;sites.set(key,item);
    }
    for(const child of node.children||[]) walk(child);
  };
  if(profile?.head) walk(profile.head);
  return [...sites.values()].sort((a,b)=>b.estimatedBytes-a.estimatedBytes).slice(0,10);
}
export function deltaFields(before,after) {
  return Object.fromEntries(Object.keys(before).filter(key=>Number.isFinite(before[key]) && Number.isFinite(after[key])).map(key=>[key,after[key]-before[key]]));
}
export function makeMetrics(send, extra=async()=>({})) {
  let start,startedAt,profiling=false;
  const snapshot=async()=>({heap:await send('Runtime.getHeapUsage'),extra:await extra()});
  return {
    async begin(profileAllocations) {
      if(profileAllocations) {await send('HeapProfiler.startSampling',{samplingInterval:32768,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});profiling=true;}
      start=await snapshot();startedAt=performance.now();
    },
    async end() {
      const elapsedMs=performance.now()-startedAt, end=await snapshot();let allocations;
      if(profiling) {
        const {profile}=await send('HeapProfiler.stopSampling');profiling=false;
        const estimatedBytes=sampledAllocationBytes(profile);
        allocations={method:'V8 sampling, 32 KiB interval, includes collected objects',estimatedBytes,estimatedBytesPerSecond:estimatedBytes/(elapsedMs/1000),topSites:allocationSites(profile)};
      }
      return {elapsedMs,heapBefore:start.heap,heapAfter:end.heap,heapDelta:deltaFields(start.heap,end.heap),processBefore:start.extra,processAfter:end.extra,processDelta:deltaFields(start.extra,end.extra),allocations};
    }
  };
}
