import {createScene3D,imageSummary,imageDifference,encodePixels,threeDWorkloads} from './scenes3d.mjs';

export async function createRenderer(T) {
  const renderer=new T.WebGPURenderer({antialias:false,alpha:false,forceWebGL:false});
  await renderer.init();
  if(!renderer.backend.isWebGPUBackend) throw new Error('WebGPU required; fallback is not a valid comparison');
  // Pinned Three.js r184 normally advances FRAME nodes from its private rAF
  // loop, not render(). Drive exactly one logical frame per benchmark update
  // in both environments, including uncapped offscreen readback iterations.
  if(T.REVISION!=='184') throw new Error('Review logical frame handling for this Three.js revision');
  renderer._animation.stop();
  return renderer;
}

export function beginLogicalFrame(renderer) {
  if(renderer.info.autoReset) renderer.info.reset();
  renderer._nodes.nodeFrame.update();
  renderer.info.frame=renderer._nodes.nodeFrame.frameId;
}

export function makeCase(T,name,size,renderer) {
  if(!threeDWorkloads.includes(name)) throw new Error('WebGPU pass currently requires 3D workloads');
  const built=createScene3D(T,name);
  const target=new T.RenderTarget(size,size,{samples:0,depthBuffer:true,stencilBuffer:false,type:T.UnsignedByteType,format:T.RGBAFormat});
  let pixels;
  renderer.shadowMap.enabled=built.details.shadows;renderer.shadowMap.type=T.PCFShadowMap;
  const step=async frame=>{
    beginLogicalFrame(renderer);
    built.update(frame);renderer.setRenderTarget(target);renderer.render(built.scene,built.camera);
    // Await actual mapped pixels, not queue.onSubmittedWorkDone: the native
    // adapter currently implements that queue method as an immediate promise.
    pixels=await renderer.readRenderTargetPixelsAsync(target,0,0,size,size);
    if(pixels.length!==size*size*4) throw new Error('Unexpected WebGPU readback size');
  };
  return {step,details:built.details,
    draw(frame) {beginLogicalFrame(renderer);built.update(frame);renderer.setRenderTarget(null);renderer.render(built.scene,built.camera);},
    async check() {
      const errors=[];
      await step(0);const first=imageSummary(pixels,size);
      await step(47);const second=imageSummary(pixels,size);
      const motionDifference=imageDifference(first.thumbnail,second.thumbnail);
      if(first.foreground<.02 || first.foreground>.98 || first.colorBins<2) errors.push('Missing, solid, or incorrectly framed 3D output');
      if(motionDifference<.001) errors.push('Animation/camera did not change the rendered image');
      let featureDifference;
      if(['3d-lighting','3d-shadows'].includes(name)) {
        built.toggleFeature(false);await step(47);const disabled=imageSummary(pixels,size);
        built.toggleFeature(true);await step(47);
        featureDifference=imageDifference(second.thumbnail,disabled.thumbnail);
        if(featureDifference<.0005) errors.push('Lighting/shadows had no measurable effect');
      }
      return {valid:!errors.length,errors,first,second,motionDifference,featureDifference};
    },
    capture() {return {width:size,height:size,origin:'top-left',rgba:encodePixels(pixels)};},
    dispose() {renderer.setRenderTarget(null);renderer.shadowMap.enabled=false;target.dispose();built.dispose();}
  };
}
