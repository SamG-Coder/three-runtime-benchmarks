export const threeDWorkloads = ['3d-meshes', '3d-instances', '3d-triangles-low', '3d-triangles-medium', '3d-triangles-high', '3d-lighting', '3d-shadows', '3d-city'];

// Fixed seeds, camera poses and animation steps: no wall-clock-dependent motion.
export function createScene3D(T, name) {
  const scene = new T.Scene();
  scene.background = new T.Color(0x010101);
  const camera = new T.PerspectiveCamera(50, 1, .1, 250);
  const resources = [], moving = [], lights = [];
  const own = object => (resources.push(object), object);
  const box = own(new T.BoxGeometry(1, 1, 1));
  const colors = [0xe06030, 0x308fe0, 0x50bf70, 0xe8ba40];
  const basic = colors.map(color => own(new T.MeshBasicMaterial({color, toneMapped:false})));
  let instance, count = 0, triangles = 0, directional, description;
  const dummy = new T.Object3D();
  camera.position.set(26, 20, 28); camera.lookAt(0,0,0);
  const add = (geometry, material, x, y, z, sx=1, sy=1, sz=1) => {
    const mesh = new T.Mesh(geometry, material);
    mesh.position.set(x,y,z); mesh.scale.set(sx,sy,sz); scene.add(mesh); return mesh;
  };
  const lighting = () => {
    const ambient = new T.AmbientLight(0xffffff, .35);
    directional = new T.DirectionalLight(0xffffff, 3);
    directional.position.set(12,20,10);
    scene.add(ambient); scene.add(directional); lights.push(ambient,directional);
  };
  if(name === '3d-meshes') {
    count=1000; triangles=count*12;
    for(let i=0;i<count;i++) moving.push(add(box,basic[i%4],(i%10-4.5)*1.5,(Math.floor(i/10)%10-4.5)*1.5,(Math.floor(i/100)-4.5)*1.5,.85,.85,.85));
    description='1,000 separately submitted rotating cubes, perspective and depth testing';
  } else if(name === '3d-instances') {
    count=10000; triangles=count*12;
    instance = new T.InstancedMesh(box,basic[1],count);
    // Fixed conservative bounds avoid relying on different automatic bound updates.
    instance.frustumCulled=false; scene.add(instance);
    camera.position.set(35,28,39); camera.lookAt(0,0,0);
    description='10,000 cubes; rewrite every instance matrix each iteration';
  } else if(name.startsWith('3d-triangles-')) {
    const segments = {'3d-triangles-low':32,'3d-triangles-medium':96,'3d-triangles-high':192}[name];
    const sphere=own(new T.SphereGeometry(1,segments,segments/2));
    count=64; triangles=count*2*segments*(segments/2-1);
    for(let i=0;i<count;i++) moving.push(add(sphere,basic[i%4],(i%4-1.5)*2.8,(Math.floor(i/4)%4-1.5)*2.8,(Math.floor(i/16)-1.5)*2.8));
    camera.position.set(20,15,23);camera.lookAt(0,0,0);
    description=`64 spheres; ${triangles.toLocaleString('en-US')} submitted triangles; ${segments}×${segments/2} segments`;
  } else if(name === '3d-lighting') {
    lighting();
    const sphere=own(new T.SphereGeometry(.7,32,16));
    const materials=colors.map((color,i)=>own(new T.MeshStandardMaterial({color,roughness:.2+i*.2,metalness:i*.2,toneMapped:false})));
    for(let i=0;i<256;i++) moving.push(add(sphere,materials[i%4],(i%16-7.5)*1.8,Math.sin(i)*.5,(Math.floor(i/16)-7.5)*1.8));
    for(let i=0;i<3;i++) {const light=new T.PointLight(colors[i],120,60,2);light.position.set((i-1)*10,5,0);scene.add(light);lights.push(light);}
    camera.position.set(24,28,30);camera.lookAt(0,0,0);
    count=256;triangles=count*960;
    description='256 PBR spheres; ambient, one directional and three point lights';
  } else if(name === '3d-shadows') {
    lighting();
    directional.castShadow=true;
    directional.shadow.mapSize.set(1024,1024);
    Object.assign(directional.shadow.camera,{left:-16,right:16,top:16,bottom:-16,near:.5,far:70});
    directional.shadow.camera.updateProjectionMatrix();directional.shadow.bias=-.0002;
    const floor=add(box,own(new T.MeshStandardMaterial({color:0x9eacbb,roughness:.9,toneMapped:false})),0,-.25,0,32,.5,32);floor.receiveShadow=true;
    const material=own(new T.MeshStandardMaterial({color:0xdd793b,roughness:.65,toneMapped:false}));
    for(let i=0;i<100;i++) {const m=add(box,material,(i%10-4.5)*2.6,1.5,(Math.floor(i/10)-4.5)*2.6,1,3,1);m.castShadow=true;m.receiveShadow=true;moving.push(m);}
    camera.position.set(27,30,32);camera.lookAt(0,0,0);
    count=101;triangles=count*12;description='100 shadow-casting columns and receiving floor; one 1024² PCF shadow map';
  } else if(name === '3d-city') {
    lighting();
    const materials=colors.map(color=>own(new T.MeshStandardMaterial({color,roughness:.8,toneMapped:false})));
    const floor=add(box,own(new T.MeshStandardMaterial({color:0x394651,roughness:1,toneMapped:false})),0,-.3,0,100,.5,100);
    floor.receiveShadow=false;
    for(let i=0;i<1600;i++) {
      const x=i%40, z=Math.floor(i/40), h=1+((i*73+19)%101)/13;
      const m=add(box,materials[(i*7)%4],(x-19.5)*2.3,h/2,(z-19.5)*2.3,1.3,h,1.3);m.frustumCulled=true;
    }
    count=1601;triangles=count*12;description='1,600 deterministic buildings and ground; moving perspective camera, PBR lighting and frustum culling';
  } else throw new Error(`Unknown 3D scene ${name}`);
  const update = frame => {
    const phase=frame*.018;
    for(let i=0;i<moving.length;i++) {
      moving[i].rotation.set(phase*.6+(i%5)*.1,phase+(i%7)*.1,phase*.2);
      if(name==='3d-lighting') moving[i].position.y=Math.sin(phase+i*.1)*.6;
    }
    if(instance) {
      for(let i=0;i<count;i++) {
        dummy.position.set((i%25-12)*1.05,(Math.floor(i/25)%20-9.5)*1.05,(Math.floor(i/500)-9.5)*1.05);
        dummy.rotation.set(phase*.6+(i%5)*.1,phase,0);dummy.scale.set(.55,.55,.55);dummy.updateMatrix();instance.setMatrixAt(i,dummy.matrix);
      }
      instance.instanceMatrix.needsUpdate=true;
      camera.position.set(35+6*Math.sin(phase*.5),28,39+4*Math.cos(phase*.5));camera.lookAt(0,0,0);
    }
    if(name==='3d-city') {
      const angle=.6+frame*.008;
      camera.position.set(Math.cos(angle)*42,17+Math.sin(angle*.5)*5,Math.sin(angle)*42);
      camera.lookAt(Math.cos(angle+.5)*8,3,Math.sin(angle+.5)*8);
    } else if(name.startsWith('3d-triangles-')) {
      camera.position.set(20*Math.cos(phase*.2),15,23+5*Math.sin(phase*.2));camera.lookAt(0,0,0);
    }
  };
  const intensities=lights.map(light=>light.intensity);
  return {scene,camera,update,details:{description,objects:count,submittedTriangles:triangles,shadows:name==='3d-shadows',shadowMapSize:name==='3d-shadows'?1024:0},
    toggleFeature(enabled) {
      if(name==='3d-shadows') {directional.castShadow=enabled;directional.shadow.needsUpdate=true;}
      else if(name==='3d-lighting') lights.forEach((light,i)=>{light.intensity=enabled?intensities[i]:0;});
    },
    dispose() {
      // InstancedMesh owns buffers beyond geometry/material. Native meshes also
      // expose dispose, whereas stock Three.js ordinary meshes do not.
      scene.traverse(object=>{if(object.isMesh) object.dispose?.();});
      scene.clear();
      for(const light of lights) light.shadow?.map?.dispose();
      for(const resource of resources) resource.dispose();
    }
  };
}

export function imageSummary(pixels,size) {
  const bins=new Set(), thumbnail=[], channelSums=[0,0,0];let foreground=0;
  for(let i=0;i<pixels.length;i+=4) {
    const [r,g,b]=pixels.subarray(i,i+3);
    if(Math.max(r,g,b)>20) foreground++;
    bins.add((r>>4)*256+(g>>4)*16+(b>>4));
    channelSums[0]+=r;channelSums[1]+=g;channelSums[2]+=b;
  }
  // Cell averages preserve spatial structure and tolerate small raster differences.
  for(let y=0;y<32;y++) for(let x=0;x<32;x++) {
    const sums=[0,0,0];let count=0;
    for(let py=Math.floor(y*size/32);py<Math.floor((y+1)*size/32);py++) for(let px=Math.floor(x*size/32);px<Math.floor((x+1)*size/32);px++) {
      const i=(py*size+px)*4;for(let c=0;c<3;c++) sums[c]+=pixels[i+c];count++;
    }
    thumbnail.push(...sums.map(sum=>Math.round(sum/count)));
  }
  return {foreground:foreground/(size*size),colorBins:bins.size,meanRGB:channelSums.map(sum=>sum/(size*size)),thumbnail};
}
export function imageDifference(a,b) {
  if(a.length!==b.length || !a.length) throw new Error('Mismatched images');
  return a.reduce((sum,value,i)=>sum+Math.abs(value-b[i]),0)/(a.length*255);
}
export function encodePixels(pixels) {
  let binary='';for(let i=0;i<pixels.length;i+=16384) binary+=String.fromCharCode(...pixels.subarray(i,i+16384));
  return btoa(binary);
}

export function make3DCase(T,name,size,renderer,flush) {
  const built=createScene3D(T,name);
  const target=new T.WebGLRenderTarget(size,size,{samples:0,depthBuffer:true,stencilBuffer:false});
  const pixels=new Uint8Array(size*size*4);
  renderer.shadowMap.enabled=built.details.shadows;renderer.shadowMap.type=T.PCFShadowMap;
  const step = frame => {
    built.update(frame);renderer.setRenderTarget(target);renderer.render(built.scene,built.camera);flush();
    renderer.readRenderTargetPixels(target,0,0,size,size,pixels);
  };
  return {step,details:built.details,
    draw(frame) {built.update(frame);renderer.setRenderTarget(null);renderer.render(built.scene,built.camera);},
    check() {
      const errors=[];
      // Fixed validation poses are independent of timing sample count.
      step(0);const first=imageSummary(pixels,size);
      step(47);const second=imageSummary(pixels,size);
      const motionDifference=imageDifference(first.thumbnail,second.thumbnail);
      if(first.foreground<.02 || first.foreground>.98 || first.colorBins<2) errors.push('Missing, solid, or incorrectly framed 3D output');
      if(motionDifference<.001) errors.push('Animation/camera did not change the rendered image');
      let featureDifference;
      if(['3d-lighting','3d-shadows'].includes(name)) {
        built.toggleFeature(false);step(47);const disabled=imageSummary(pixels,size);
        built.toggleFeature(true);step(47);
        featureDifference=imageDifference(second.thumbnail,disabled.thumbnail);
        if(featureDifference<.0005) errors.push(`${name==='3d-shadows'?'Shadows':'Lighting'} had no measurable effect`);
      }
      return {valid:!errors.length,errors,first,second,motionDifference,featureDifference};
    },
    capture() {return {width:size,height:size,origin:'bottom-left',rgba:encodePixels(pixels)};},
    dispose() {renderer.setRenderTarget(null);renderer.shadowMap.enabled=false;target.dispose();built.dispose();}
  };
}
