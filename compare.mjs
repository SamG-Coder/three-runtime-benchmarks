import {readFile} from 'node:fs/promises';
import {summarize} from './suite.mjs';
const [a,b]=await Promise.all((process.argv.slice(2).length?process.argv.slice(2):['results/browser.json','results/runtime.json']).map(async p=>JSON.parse(await readFile(p,'utf8'))));
if(!a||!b || a.workloadVersion!==b.workloadVersion || JSON.stringify(a.config)!==JSON.stringify(b.config)) throw new Error('Exactly two matching workload/config reports required');
console.log('Workload | Browser median ms | Runtime median ms | Browser / runtime');
console.log('--- | ---: | ---: | ---:');
for(const name of a.config.tests) {
  if([a,b].some(r=>r.results.filter(x=>x.name===name).length!==r.config.repeats || r.results.some(x=>x.name===name && x.status!=='valid'))) {
    console.log(`${name} | INVALID | INVALID | Rendering/correctness check failed; inspect JSON`);continue;
  }
  const med=report=>summarize(report.results.filter(x=>x.name===name).map(x=>x.medianMs)).medianMs;
  const x=med(a),y=med(b);
  console.log(`${name} | ${x.toFixed(3)} | ${y.toFixed(3)} | ${(x/y).toFixed(2)}x`);
}
console.log('\nRatio > 1 means lower runtime latency. Medians are across repeat medians; inspect raw samples and p95 as well.');
