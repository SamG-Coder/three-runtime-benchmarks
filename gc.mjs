export async function collectGcWindow(observer,events,start,end) {
  // GC performance entries are delivered asynchronously. One immediate is not
  // sufficient after a long synchronous render loop on Windows/Node.
  await new Promise(resolve=>setImmediate(resolve));
  await new Promise(resolve=>setImmediate(resolve));
  events.push(...observer.takeRecords());
  const entries=events.filter(event=>event.startTime>=start && event.startTime<end);
  events.length=0;
  return {count:entries.length,totalMs:entries.reduce((sum,event)=>sum+event.duration,0),maxMs:Math.max(0,...entries.map(event=>event.duration))};
}
