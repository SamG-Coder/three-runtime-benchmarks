# Direct GL moved to the main command buffer

Follow-up: GL-aware coalescing is now implemented and measured in [DIRECT-GL-COALESCING-REPORT.md](DIRECT-GL-COALESCING-REPORT.md). The measurements below describe the initial shared-command migration before that optimization.

The direct OpenGL experiment now uses **host/ThreeBrowser/web/three/00-cmdbuf.js**, not a separate command encoder. It sends the new RAW_GL opcode through the existing CmdSubmit/native.submit/tn_cmd_submit path. The former rawGlSubmit N-API endpoint and private JS/native batch implementation have been removed.

## What is reused

- The main command header and alignment, attached buffer and typed views, buffer rollover/growth, and shared-buffer submission.
- Native command-stream processing on the OpenGL worker, with normal submission/error handling and ordered execution.
- The same buffer receives graphics commands directly; there is no intermediate direct-GL command array or second batch buffer.
- Synchronous queries/resource creation/readback first flush the main ring, then return through the existing rawGlCall query endpoint. Native calls that need an answer cannot simply be deferred.

The initial migration did not adapt native-scene dirty-pose or instance-matrix coalescing to graphics commands. The follow-up implements GL-specific rules for pending buffer updates and uniform reuse while preserving draw/readback ordering. Stock Three.js retains its own state caching and sortObjects=true default.

The new native decoder validates the RAW_GL record and executes OpenGL, without constructing threepp scene objects. All three measured runs report zero native scene/resource slots, zero selected native render scene, 2,889,067 graphics commands and 3,961 submitted graphics batches. The existing window/context startup still depends on runtime/threepp infrastructure.

## Measurements

Same unchanged eight 3D workloads, 512×512, no MSAA, synchronous render/readback completion. Three independent native launches, each 30 warm-ups, 120 samples and three repeats per case. Median columns aggregate nine repeat medians; the saved browser column aggregates its existing three repeats. Browser baselines were reused without rerunning browser tests. Previous direct-GL results are retained separately.

| Workload | Previous private bridge ms | Main command buffer ms | Saved browser ms | Change from previous |
| --- | ---: | ---: | ---: | ---: |
| 3d-meshes | 1.520 | 1.564 | 1.035 | 2.9% |
| 3d-instances | 0.820 | 0.838 | 1.120 | 2.2% |
| 3d-triangles-low | 0.275 | 0.274 | 0.230 | -0.5% |
| 3d-triangles-medium | 0.295 | 0.297 | 0.245 | 0.7% |
| 3d-triangles-high | 0.372 | 0.377 | 0.335 | 1.3% |
| 3d-lighting | 0.604 | 0.608 | 0.430 | 0.6% |
| 3d-shadows | 0.538 | 0.560 | 0.405 | 4.1% |
| 3d-city | 1.681 | 1.700 | 1.045 | 1.1% |

Positive change means more time. This migration did **not** demonstrate a performance gain: results are approximately unchanged, generally 0–4% slower in these runs. Changes this small should not be overinterpreted without randomized interleaved trials. The main native submit path copies the stream into worker-owned storage, whereas the removed private batch path borrowed the input during a blocking call; the transport paths are not identical in cost. The measurements do not isolate that copy's contribution.

The benefit of this change is using the existing command-buffer implementation and removing the parallel implementation. It does not claim that all scene-layer optimizations automatically transfer to graphics commands. Direct GL still beats the saved browser on the instancing case and trails it on the other seven.

## Allocations and presentation

Sampled JavaScript MiB allocated over 120 frames, median of three profiling repeats:

| Workload | Previous private bridge MiB | Main command buffer MiB |
| --- | ---: | ---: |
| 3d-meshes | 74.50 | 75.37 |
| 3d-instances | 0.34 | 0.31 |
| 3d-triangles-low | 6.19 | 6.98 |
| 3d-triangles-medium | 5.79 | 6.32 |
| 3d-triangles-high | 5.04 | 4.91 |
| 3d-lighting | 30.29 | 28.35 |
| 3d-shadows | 25.34 | 25.07 |
| 3d-city | 97.44 | 96.02 |

These are statistical JS allocation estimates, not retained heap, native C++ allocations or GPU memory. The migration does not remove the higher JS allocation pressure identified in the original direct-GL report.

The on-screen pass records **3624 native presentations** at 512×512, VSync disabled. It retains the experimental uncapped callback/presentation policy; callback intervals are not compared as an FPS speedup. The new pass and the separate allocation pass each pass all eight saved browser image comparisons.

## Verification

- **77 runtime tests pass with GPU tests enabled**, no failures or skips.
- New main-command tests exercise header/payload encoding, exact Float64 values, upload snapshot semantics, rollover, buffer growth, invalid-command rollback and native submission failure reporting.
- The direct-GL GPU regression verifies actual rendering, live texture/buffer updates, zero native scene objects, presentation, malformed main-stream RAW_GL payload rejection, and removal of the old rawGlSubmit endpoint.
- All eight 3D comparisons pass in each of three launches; all six diagnostics pass. Frame and allocation comparisons pass all eight cases.
- All eight final native PNGs are **byte-for-byte identical** to the previous direct-GL PNGs.

## Evidence and use

The command is unchanged: `node native.mjs results/runtime-direct-gl.json --3d --direct-gl`. Build/stage ThreeBrowser first and set THREEBROWSER_ROOT as documented. The default facade path remains available without --direct-gl. Browser workload/configuration and tolerances were not changed.

- [Latency 1](results/comparison-direct-gl-maincmd-1.md), [latency 2](results/comparison-direct-gl-maincmd-2.md), [latency 3](results/comparison-direct-gl-maincmd-3.md)
- [Diagnostics](results/comparison-direct-gl-maincmd-diagnostics.md)
- [Frame pacing](results/comparison-direct-gl-maincmd-frames.md)
- [Allocations](results/comparison-direct-gl-maincmd-allocations.md)
- [Runtime test log](results/direct-gl-maincmd-tests.txt)

Raw JSON and PNGs use runtime-direct-gl-maincmd-* filenames under results/ and remain local/Git-ignored. The migration and report are uncommitted. Earlier WebGPU and direct-GL results are preserved.
