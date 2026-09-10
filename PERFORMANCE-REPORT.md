# Native renderer CPU optimization

The native OpenGL path is substantially faster after caching immutable C++ material interfaces. The unchanged browser baseline still wins on most GPU workloads, but native latency fell by roughly half in the scenes with many separate meshes. This is an optimization of the existing renderer, not a switch to a different rendering backend.

## Diagnosis

The benchmark creates `THREE.WebGLRenderer`. In the browser that is stock Three.js WebGL2. In ThreeBrowserRuntime it is the JavaScript facade, an ordered native command buffer, and threepp's C++ `GLRenderer` using OpenGL. The separate `three/webgpu` runtime installs the native WebGPU adapter and calls wgpu-native. These measurements do not compare WebGPU with OpenGL and cannot establish that WebGPU is universally faster.

The concrete cost was repeated C++ runtime type identification. PBR materials inherit many capability interfaces. Program setup repeatedly checked shader, environment, standard and sprite interfaces; common material uniform refresh performed another dozen multiple-inheritance casts. Repeating this for hundreds or thousands of draws consumed more CPU time than the final draw-submission call.

The optimized renderer stores the interface pointers once in its existing per-material properties. Disposal removes those properties. It still reads current material values, follows the same shader invalidation conditions, uploads the same uniforms, and performs the same draw calls. Wireframe and morph interface checks in draw preparation use the same cache. No automatic batching, geometry reduction, shader simplification or image-tolerance changes were introduced.

The city draw trace's mean program-setup duration fell from **4.56 to 0.92 microseconds per draw**. The saved earlier trace and new trace have different row counts, and instrumentation affects timings; this supports the diagnosis rather than replacing the unprofiled benchmark. The new pass trace, passes 100–399 before detailed draw tracing starts, averages approximately **0.71 ms in render-list preparation and 1.02 ms in draws**. Further native work remains in traversal/list preparation, uniforms, binding and submission, plus synchronization/readback.

## Native before and after

Both native runs use 30 warm-ups, 120 samples and three repeats, at 512×512 without MSAA. These are completed rendering **plus synchronous readback** timings, not pure GPU execution times or displayed FPS. The before run rebuilt the committed renderer at `e41a424`; the after run rebuilt the candidate changes in the same working tree. Existing unrelated user edits were present in both. The browser was not rerun: saved browser reports and all benchmark workloads/tolerances were reused unchanged.

| Workload | Native before median ms | Native after median ms | Lower latency | Saved browser median ms |
| --- | ---: | ---: | ---: | ---: |
| 1,000 cubes | 5.202 | 2.304 | 55.7% | 1.035 |
| 10,000 instances | 2.689 | 2.564 | 4.7% | 1.120 |
| 61,440 sphere triangles | 0.668 | 0.392 | 41.3% | 0.230 |
| 577,536 sphere triangles | 0.563 | 0.452 | 19.7% | 0.245 |
| 2,334,720 sphere triangles | 0.643 | 0.553 | 14.0% | 0.335 |
| PBR lighting | 1.883 | 1.019 | 45.9% | 0.430 |
| Shadows | 0.795 | 0.704 | 11.5% | 0.405 |
| City fly-through | 5.882 | 2.955 | 49.8% | 1.045 |

Medians are medians of three repeat medians. The large improvements in draw-heavy cases are consistent across repeats and with the isolated interface-cache experiment. Small differences, especially the instance case, should not be treated as a significant gain from this change.

Pooled render/readback p99 fell from **5.925 to 3.009 ms** for cubes, **6.608 to 3.555 ms** for city, and **2.498 to 1.508 ms** for lighting. Instance p99 was **3.821 before and 3.950 ms after**, so the optimization does not improve every tail metric.

## Compatibility fixes discovered during validation

The new regression changes materials after warming the cache. It exposed pre-existing facade gaps; the live-color failure was also reproduced with the original C++ renderer:

- `material.color.set(...)` did not synchronize until `needsUpdate`. Render preparation now compares color components and sends a color command only when they change.
- Wireframe state was declared in JavaScript but not sent by the material-state command. The command now carries wireframe and line width, with an extension-presence bit so old commands retain their behavior.
- Disposing and explicitly reattaching a material now resets cached facade render/color state so its newly created native material receives that state.

The regression exercises live colors, solid/wireframe changes, material-type replacement, and disposal with explicit reattachment across Basic, Lambert, Phong, Standard and Physical facade materials. Existing GPU tests cover dynamic textures, attenuation, shadows, custom shaders, target formats, instancing, presentation and native WebGPU contracts. This coverage is not a claim of complete Three.js API parity.

All **72 runtime tests pass with GPU tests enabled, zero failures and zero skips**. All eight 3D cases and all six diagnostics pass the saved browser comparisons. The eight native validation PNGs are **byte-for-byte identical** between the before and after runs. The additional poses and lighting/shadow toggles also pass their existing checks.

## Frame pacing, allocations and limits

Frame pacing and sampled allocations were measured in separate native runs and compared with their saved browser baselines. All eight cases pass in each mode.

- City callback p99: **20.891 → 20.229 ms**; intervals above the 16.67 ms budget plus timing tolerance: **137 → 111 of 360**.
- Cube callback p99: **21.231 → 20.507 ms**; over-budget intervals: **121 → 99 of 360**.
- Instance callback p99: **19.600 → 19.678 ms**. There is no general frame-pacing win.
- V8 sampled allocations for 120 updates of 10,000 instances were **1.805, 0.720 and 0.469 MiB** across repeats. The previous allocation fix remains effective. These samples do not measure the new native C++ cache.

The cache adds 19 non-owning pointers plus optional bookkeeping per material used by this renderer (152 pointer bytes on this 64-bit build). There are no new per-draw cache allocations. Native allocator stacks, GPU VRAM and long-duration leak behavior were not measured.

Native VSync is disabled; browser callbacks follow browser/display scheduling. Lower renderer CPU time does not imply a proportional change in callback cadence or physical presentation latency. The benchmark's readback cost also prevents attributing the remaining browser/native gap solely to OpenGL or to GPU hardware.

## Evidence

- [3D comparison against saved browser baseline](results/comparison-perf-3d.md)
- [Diagnostic comparison](results/comparison-perf-diagnostics.md)
- [Frame comparison](results/comparison-perf-frames.md)
- [Allocation comparison](results/comparison-perf-allocations.md)
- [Native before latency samples](results/runtime-perf-baseline-3d.json)
- [Native after latency samples](results/runtime-perf-after-3d.json)
- [Native before frame samples](results/runtime-perf-baseline-frames.json)
- [Native after frame samples](results/runtime-perf-after-frames.json)
- [Runtime test log](results/native-perf-tests.txt)
- [City pass trace](results/perf-city-passes.csv)
- [City draw trace](results/perf-city-draws.csv)

Generated raw evidence remains local and Git-ignored under `results/`. Source changes are committed in ThreeBrowser as **49543b5** (`Cache native material interfaces and preserve live render state`). Measurements were collected before that commit, so the reports identify the preceding revision with a dirty working tree. Earlier reports and baselines are preserved.
