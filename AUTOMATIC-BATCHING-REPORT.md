# Native sorting and automatic instancing

The next optimization combines correct renderer sorting with conservative automatic instancing. Applications keep ordinary Mesh objects; the native renderer can submit compatible adjacent objects as an instanced draw. No benchmark scene, browser baseline or correctness threshold was changed. Browser tests were not rerun.

## Changes and diagnosis

Native startup explicitly set `sortObjects = false`, although the facade and Three.js default to `true`. The facade did not transmit changes to this property. The native default is now true, and an ordered renderer-state command carries the application's setting before offscreen and window submissions. Explicit false still preserves insertion order. This also fixes transparent-object ordering and avoids repeatedly switching between interleaved materials.

Automatic instancing runs after normal per-object visibility checks and sorting. It combines consecutive draws sharing geometry, material, group order, render order and shadow-receiving state. It uses one reusable 1,024-matrix buffer, uploads only the populated range, and splits larger runs. Source objects stay in the scene and retain their model-view/normal matrices. Geometry and material are borrowed only for the synchronous draw, and the buffer is disposed with the renderer.

A broad prototype added overhead to smaller or triangle-heavy scenes. The retained path therefore requires at least 512 render-list items, indexed geometry of at most 128 triangles per mesh, and at least four compatible adjacent meshes. Custom shaders/defines, native render callbacks, transparency, wireframe, deformation, grouped draws, existing instancing, shear, singular/mirrored transforms, clipping, override materials and virtual geometry retain the ordinary path. Only plain Mesh objects and the supported built-in material types participate. Existing JavaScript facade callbacks still run during preparation.

The investigation also exposed a native render-target lifetime defect. Readback could leave a target bound; releasing its handle destroyed the target while the renderer retained its pointer. A subsequent pass could try to restore that dangling pointer and crash. The debugger identified the failure in render-target setup. Native handle destruction now unbinds a target before disposing it.

## Measured result

The native before run uses the preceding committed renderer (`49543b5`). The final build was checked in three independent process launches, each with 30 warm-ups, 120 samples and three repeats per case. The after column is the median of all nine repeat medians. The before column is the median of its three repeat medians. Existing unrelated user edits were present throughout. Results include synchronous rendering/readback at 512×512 without MSAA; they are not pure GPU timings or displayed FPS.

| Workload | Before ms | After ms | Change |
| --- | ---: | ---: | --- |
| 1,000 cubes | 2.265 | 1.807 | 20.2% lower |
| 10,000 instances | 2.567 | 2.386 | 7.0% lower observed; not auto-batched |
| 61,440 sphere triangles | 0.381 | 0.385 | Essentially unchanged |
| 577,536 sphere triangles | 0.403 | 0.411 | Essentially unchanged |
| 2,334,720 sphere triangles | 0.476 | 0.483 | Essentially unchanged |
| PBR lighting | 0.962 | 0.837 | 13.0% lower; sorting benefit |
| Shadows | 0.669 | 0.713 | 0.044 ms higher |
| City fly-through | 2.948 | 2.131 | 27.7% lower |

Cube launch medians were 1.807, 1.776 and 1.820 ms. City launch medians were 2.144, 2.067 and 2.140 ms. Pooled p99 was 2.435 ms for cubes (before 3.032) and 2.861 ms for city (before 3.671). Earlier exploratory runs included worse cube/instance tails; these are retained in the raw evidence. The final repeated-process measurements support a draw-heavy workload improvement, not a universal speedup.

A control with sorting enabled and automatic instancing disabled measured 2.195 ms for cubes and 2.479 ms for city. Thus sorting accounts for part of the gain, and batching contributes additional savings. Set `THREEBROWSER_DISABLE_AUTO_INSTANCING=1` before launching native to reproduce that control; renderer sorting remains independently controlled by `sortObjects`.

A city trace showed one ordinary ground draw plus four instanced draws of 202, 213, 214 and 216 buildings in its first traced frame: **846 objects submitted in five draws**. Across passes 100–399, before detailed draw tracing starts, average CPU draw work was about **0.057 ms**, versus about **1.02 ms** in the preceding renderer trace. Render-list preparation remains about **0.72 ms**. Instrumented stage timings include driver work and are diagnostic, not a substitute for the unprofiled measurements.

The saved browser still has lower render/readback latency: 1.035 ms for cubes and 1.045 ms for city. Native scene preparation, JavaScript work, synchronization and readback remain material costs.

## Compatibility and resource checks

- **74 runtime tests pass with GPU tests enabled, zero failures and zero skips.**
- All eight 3D cases pass against the saved browser baseline in each of the three final process launches; all six diagnostic cases also pass.
- All eight cases pass in the separate native frame-pacing and allocation runs against their saved browser reports.
- A new GPU regression compares automatic instancing enabled/disabled, verifies the actual 1,024-instance draw in native tracing, crosses buffer capacity with 1,100 objects, changes transforms/colors/visibility/layers, exercises mirrored, wireframe and custom-shader fallbacks, replaces render targets 24 times, and checks sorted/insertion/restored transparent ordering.
- Native before/after image differences are negligible at the captured validation pose: cube and lighting PNG bytes are identical; the city differs in 12 channel bytes and shadows in 45. Existing additional poses and feature toggles pass their unchanged image criteria.
- The pooled matrix storage is bounded at **64 KiB of CPU matrix data and corresponding GPU attribute storage per renderer**, plus object/driver bookkeeping. No unbounded per-scene instance cache was added. Native allocator stacks and long-duration leak behavior were not measured.
- Sampled V8 allocations for 120 updates of 10,000 instances were 1.658, 0.501 and 0.438 MiB across repeats. The earlier allocation improvement remains effective; these samples do not measure native C++/GPU storage.

The new frame run observed cube/city/instance callback p99 values of 16.176/16.154/16.363 ms, with no intervals above the 16.67 ms budget plus timing tolerance. The earlier saved native run had approximately 20.507/20.229/19.678 ms respectively. Native VSync remains disabled, and even the existing-instance case improved despite being excluded from automatic batching. Scheduling conditions therefore prevent attributing all of that cadence change to this optimization.

## Evidence

- [Native before](results/runtime-autobatch-before-3d.json)
- [Final launch 1 comparison](results/comparison-autobatch-verified-1.md)
- [Final launch 2 comparison](results/comparison-autobatch-verified-2.md)
- [Final launch 3 comparison](results/comparison-autobatch-verified-3.md)
- [Sorting-only control](results/runtime-autobatch-final-sorting-only.json)
- [Diagnostics](results/comparison-autobatch-diagnostics.md)
- [Frame pacing](results/comparison-autobatch-frames.md)
- [Allocations](results/comparison-autobatch-allocations.md)
- [Runtime test output](results/native-autobatch-tests.txt)
- [City draw trace](results/autobatch-city-draws.csv)
- [City pass trace](results/autobatch-city-passes.csv)

Source changes are committed in ThreeBrowser as **00474c3** (`Honor renderer sorting and batch compatible native mesh draws`). Measurements were collected before the commit and identify the preceding revision with a dirty working tree. Generated JSON, PNG and trace evidence is local and Git-ignored under `results/`. Previous reports and browser baselines are preserved.
