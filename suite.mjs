export const workloads = ['typed-array', 'scene-transforms', 'draw-calls', 'instances', 'texture-upload', 'multipass'];
export function summarize(samples) {
  if (!samples.length || samples.some(x => !Number.isFinite(x) || x < 0)) throw new Error('Invalid timing samples');
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = p => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
  return { medianMs: percentile(.5), p95Ms: percentile(.95), meanMs: samples.reduce((a,b) => a+b, 0)/samples.length };
}
export function validateConfig(config) {
  for (const key of ['warmup', 'samples', 'repeats', 'size']) {
    if (!Number.isInteger(config[key]) || config[key] < 1) throw new Error(`Invalid ${key}`);
  }
  if (!config.tests.length || config.tests.some(t => !workloads.includes(t))) throw new Error('Unknown or empty tests');
}
function makeCase(T, name, size, renderer, flush) {
  if (name === 'typed-array') {
    const data = new Float32Array(262144);
    return { step(frame) { for (let i=0;i<data.length;i++) data[i]=(i % 1024)*.25+(frame % 8); },
      check(frame) { const expected=255.75+(frame%8); if(data.at(-1)!==expected) throw new Error('Array mismatch'); return {last:data.at(-1)}; }, dispose() {} };
  }
  if (name === 'scene-transforms') {
    const root = new T.Object3D();
    for(let i=0;i<5000;i++) { const o=new T.Object3D(); o.position.set(i%100, Math.floor(i/100),0); root.add(o); }
    return { step(frame) { for(const o of root.children) o.rotation.z=(frame%100)*.001; root.updateMatrixWorld(true); },
      check() { const e=root.children[4999].matrixWorld.elements; if(Math.abs(e[12]-99)>1e-5 || Math.abs(e[13]-49)>1e-5) throw new Error('Transform mismatch'); return {x:e[12],y:e[13]}; }, dispose() {} };
  }
  const scene=new T.Scene(), camera=new T.OrthographicCamera(-1,1,1,-1,.1,10);
  camera.position.z=2;
  const target=new T.WebGLRenderTarget(size,size,{samples:0,depthBuffer:true,stencilBuffer:false});
  const geometry=new T.PlaneGeometry(.055,.055);
  const material=new T.MeshBasicMaterial({color:0xffffff, toneMapped:false});
  const resources=[target,geometry,material];
  let mesh, texture, data;
  const matrix=new T.Matrix4();
  if(name==='instances') {
    mesh=new T.InstancedMesh(geometry,material,1024); scene.add(mesh);
  } else if(name==='draw-calls') {
    for(let i=0;i<1024;i++) { const m=new T.Mesh(geometry,material); m.position.set((i%32)/16-.96875,Math.floor(i/32)/16-.96875,0); scene.add(m); }
  } else {
    const plane=new T.PlaneGeometry(2,2); resources.push(plane);
    if(name==='texture-upload') {
      data=new Uint8Array(512*512*4); data.fill(255);
      texture=new T.DataTexture(data,512,512,T.RGBAFormat,T.UnsignedByteType);
      texture.needsUpdate=true; material.map=texture; resources.push(texture);
    }
    scene.add(new T.Mesh(plane,material));
  }
  const pixel=new Uint8Array(size*size*4);
  return {
    step(frame) {
      if(mesh) { for(let i=0;i<1024;i++) { matrix.makeTranslation((i%32)/16-.96875,Math.floor(i/32)/16-.96875,(frame%2)*.001); mesh.setMatrixAt(i,matrix); } mesh.instanceMatrix.needsUpdate=true; }
      if(data) { for(let i=0;i<data.length;i+=4) { data[i]=255; data[i+1]=frame%256; data[i+2]=0; data[i+3]=255; } texture.needsUpdate=true; }
      renderer.setRenderTarget(target);
      for(let pass=0;pass<(name==='multipass'?8:1);pass++) renderer.render(scene,camera);
      flush();
      // A synchronous readback bounds completed work, not just queued JS commands.
      renderer.readRenderTargetPixels(target,0,0,size,size,pixel);
    },
    check(frame) {
      let lit=0; for(let i=0;i<pixel.length;i+=4) if(pixel[i]>=240 && pixel[i+3]>=240) lit++;
      const coverage=lit/(size*size), grid=['draw-calls','instances'].includes(name);
      if(grid ? coverage<.73 || coverage>.80 : coverage<.99) throw new Error(`${name}: unexpected coverage ${coverage}; expected ${grid?'0.73–0.80':'at least 0.99'}`);
      if(data && (Math.abs(pixel[1]-(frame%256))>2 || pixel[2]>2)) throw new Error(`${name}: stale or incorrect texture pixel ${[...pixel.slice(0,4)]}`);
      return {coverage};
    },
    dispose() { renderer.setRenderTarget(null); for(const r of resources) r.dispose(); }
  };
}
export async function runSuite(T, config, metadata, flush=()=>{}) {
  validateConfig(config);
  let renderer;
  if(config.tests.some(t=>!['typed-array','scene-transforms'].includes(t))) {
    renderer=new T.WebGLRenderer({antialias:false,alpha:false});
    renderer.setPixelRatio(1); renderer.setSize(config.size,config.size);
    renderer.setClearColor(0x000000,1);
  }
  const results=[];
  try {
    for(let repeat=0;repeat<config.repeats;repeat++) for(const name of config.tests) {
      const task=makeCase(T,name,config.size,renderer,flush);
      try {
        for(let i=0;i<config.warmup;i++) task.step(i);
        const samples=[];
        for(let i=0;i<config.samples;i++) { const start=performance.now(); task.step(i); samples.push(performance.now()-start); }
        let check, error;
        try {check=task.check(config.samples-1);} catch(e) {error=e.message;}
        results.push({name,repeat,status:error?'invalid':'valid',...summarize(samples),samples,check,error});
      } finally {task.dispose();}
    }
  } finally {renderer?.dispose();}
  return {schemaVersion:1, workloadVersion:1, date:new Date().toISOString(), config, metadata, results};
}
