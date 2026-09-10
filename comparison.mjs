import {summarize} from './suite.mjs';
import {imageDifference} from './scenes3d.mjs';
export function compareReports(a,b) {
  if(!a||!b || a.workloadVersion!==b.workloadVersion || JSON.stringify(a.config)!==JSON.stringify(b.config)) throw new Error('Matching workload/config reports required');
  return a.config.tests.map(name=>{
    const browser=a.results.filter(x=>x.name===name),native=b.results.filter(x=>x.name===name);
    const reasons=[];
    if(browser.length!==a.config.repeats || native.length!==b.config.repeats) reasons.push('Missing repeats');
    for(const [label,rows] of [['browser',browser],['runtime',native]]) for(const row of rows) if(row.status!=='valid') reasons.push(`${label} repeat ${row.repeat}: ${row.error||row.status}`);
    let maxImageDifference=0;
    if(name.startsWith('3d-')) for(let repeat=0;repeat<a.config.repeats;repeat++) {
      const left=browser.find(x=>x.repeat===repeat),right=native.find(x=>x.repeat===repeat);
      for(const pose of ['first','second']) {
        const x=left?.check?.[pose],y=right?.check?.[pose];
        if(!x||!y) {reasons.push(`Missing image validation for repeat ${repeat}`);continue;}
        const difference=imageDifference(x.thumbnail,y.thumbnail);maxImageDifference=Math.max(maxImageDifference,difference);
        if(difference>.025 || Math.abs(x.foreground-y.foreground)>.015) reasons.push(`Image mismatch at repeat ${repeat} ${pose}: RGB error ${(difference*100).toFixed(2)}%, foreground delta ${(Math.abs(x.foreground-y.foreground)*100).toFixed(2)}%`);
      }
    }
    if(a.config.mode==='frames' && b.metadata.statsAfter && (b.metadata.statsAfter.width!==a.config.size || b.metadata.statsAfter.height!==a.config.size)) reasons.push('Native presentation dimensions differ from browser');
    const aggregate=rows=> {
      if(!rows.length || rows.some(x=>!x.samples?.length)) return null;
      const timing=summarize(rows.flatMap(x=>x.samples));
      timing.medianOfRepeatMediansMs=summarize(rows.map(x=>x.medianMs)).medianMs;
      timing.repeatMediansMs=rows.map(x=>x.medianMs);
      timing.heapDeltaMiB=rows.map(x=>(x.resources?.heapDelta.usedSize||0)/1048576);
      timing.estimatedAllocationMiB=rows.map(x=>x.resources?.allocations?.estimatedBytes/1048576);
      return timing;
    };
    const browserStats=aggregate(browser),runtimeStats=aggregate(native);
    return {name,valid:!reasons.length,reasons,maxImageDifference,browser:browserStats,runtime:runtimeStats,ratio:!reasons.length && a.config.mode!=='frames' && !a.config.profileAllocations?browserStats.medianOfRepeatMediansMs/runtimeStats.medianOfRepeatMediansMs:null};
  });
}
