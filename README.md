# Browser versus ThreeBrowserRuntime benchmarks

Fourteen deterministic workloads using one shared JavaScript suite: eight actual 3D cases plus six smaller diagnostics. Browser execution uses stock Three.js 0.184.0 and WebGL2; native execution uses ThreeBrowserRuntime's Three.js facade and native renderer. This compares application API paths, not identical rendering backends or two different JavaScript languages. Both environments use V8, potentially different versions. A direct stock Three.js WebGPU versus native WebGPU comparison is outside this suite.

HTML, DOM layout, CSS, and UI compatibility are excluded. There are no HTML test files. The native runner imports JavaScript directly and never loads a page. The browser runner opens an empty local document only to execute the shared JavaScript modules; browser startup and this document setup are outside all measurements.

| Test | Fixed workload | What it probes |
| --- | --- | --- |
| 3d-meshes | 1,000 rotating cubes, 12,000 triangles | Perspective, depth testing, object updates and separate draws |
| 3d-instances | 10,000 cubes, 120,000 triangles | Rewrite all instance matrices and move the perspective camera |
| 3d-triangles-low | 64 spheres, 61,440 triangles | Low geometry load |
| 3d-triangles-medium | 64 spheres, 577,536 triangles | Medium geometry load |
| 3d-triangles-high | 64 spheres, 2,334,720 triangles | High geometry load |
| 3d-lighting | 256 PBR spheres, 245,760 triangles | Ambient, directional and three point lights; roughness/metalness variation |
| 3d-shadows | 100 casting columns and receiving floor | 1024×1024 PCF directional shadow map |
| 3d-city | 1,600 buildings and ground | Deterministic camera fly-through, PBR lighting and frustum culling |
| typed-array | Rewrite 262,144 float32 elements (1 MiB) | JS loop and typed-array throughput |
| scene-transforms | Update 5,000 object rotations and world matrices | Scene traversal and transform implementation |
| draw-calls | Render 1,024 separate white plane meshes | Object preparation, draw submission, rendering |
| instances | Rewrite 1,024 instance matrices and render one instanced mesh | Dynamic instance upload and batching |
| texture-upload | Rewrite/upload a 512×512 RGBA8 texture each iteration | JS filling, texture transfer and rendering |
| multipass | Render a full-target plane eight times | Repeated render submission and target work |

## Setup

Use Node.js 22 or later, Git, and installed Chrome or Edge. The native side additionally needs a built ThreeBrowser checkout with its dependencies installed. Follow that checkout's `ThreeBrowserRuntime/README.md` to build it; this repository does not build or change the runtime.

```powershell
cd C:\three-runtime-benchmarks
npm ci
npm test
$env:THREEBROWSER_ROOT = 'C:\ThreeBrowser'
$env:BROWSER_CHANNEL = 'msedge' # Or chrome (default)
npm run bench:browser
npm run bench:runtime
npm run compare
```

Run the three **separate** 3D measurement passes sequentially, so browser and native GPU work never compete:

```powershell
# Completed rendering plus synchronous readback; no allocation profiler.
npm run bench:browser:3d
npm run bench:runtime:3d
node compare.mjs results/browser-3d.json results/runtime-3d.json

# Real on-screen rendering, animation callback intervals, no timed readbacks.
npm run bench:browser:frames
npm run bench:runtime:frames
node compare.mjs results/browser-frames.json results/runtime-frames.json

# Separate V8 sampled allocation pass; timings include profiling overhead.
npm run bench:browser:allocations
npm run bench:runtime:allocations
node compare.mjs results/browser-allocations.json results/runtime-allocations.json

# Assemble RUN-REPORT.md and all three detailed comparison reports.
npm run report
```

Each 3D report also saves a PNG per scene from a fixed validation pose. Images, CPU/resource counters, raw timing samples, correctness errors and 32×32 spatial image signatures are retained alongside the JSON. `compare.mjs` emits Markdown that can be saved with `| Set-Content -Encoding utf8 results/comparison.md`.

For a nonstandard addon location, set `THREEBROWSER_RUNTIME_ADDON` to the absolute `.node` path. Scripts work from any checkout location; the example paths are not required.

For quick checks or longer runs:

```powershell
$env:WARMUP = '30'
$env:SAMPLES = '120'
$env:REPEATS = '3'
$env:TESTS = 'typed-array,scene-transforms' # Omit for all cases, or use --3d
node browser.mjs results/browser-cpu.json
node native.mjs results/runtime-cpu.json
node compare.mjs results/browser-cpu.json results/runtime-cpu.json
Remove-Item Env:TESTS
```

## Method and interpretation

Defaults are 30 unmeasured warm-up iterations, 120 samples, and three repeats per workload. Both environments use 512×512 rendering, no MSAA, pixel ratio 1, the same deterministic transforms/cameras/materials, and no external assets. Latency mode uses RGBA8 render targets and includes a full 1 MiB synchronous readback in every iteration. It measures completed render-and-readback latency, including synchronization and transfer overhead; it is neither pure GPU time nor FPS. The native runner explicitly flushes its command buffer before readback.

Frame mode renders to the visible browser canvas or native window from real `requestAnimationFrame` callbacks. It records callback-to-callback intervals and separate JS update/submission timings. Readback and image validation happen afterward. The interval containing the resource checkpoint is discarded. These intervals do not prove physical display scanout or count GPU-dropped frames. The current native addon disables VSync; browsers normally schedule callbacks with the display. Both policies are reported, and speed ratios are deliberately withheld in frame mode. Do not claim uncapped native callback throughput is a frame-rate advantage over a display-paced browser.

Initialization, object creation, validation, and disposal are outside the timed interval. Texture filling, instance-matrix writes, camera movement and scene updates are inside it. Startup, first shader compilation, input latency, physical presentation latency, GPU timestamp queries, GPU VRAM, native C++ allocation stacks and long-duration leak testing are not measured here.

Raw samples, configuration, browser GPU string, CPU/OS, Three.js revision, and native Git revision/dirty state are saved to JSON. Reports must have identical configuration and workload versions. Results are ignored by Git by default.

| Measurement | How to interpret it |
| --- | --- |
| Median, p95, p99, worst, standard deviation and coefficient of variation | Typical performance, tail latency and variation; inspect all repeat medians too |
| 16.67/33.33 ms budget exceedances | Counts with a 0.05 ms tolerance for timestamp precision; frame pacing only in frame mode |
| V8 used/total heap, embedder heap and backing storage | Before/after snapshots via the same inspector protocol in both environments |
| Heap delta | Retained growth/shrinkage across the measured interval; can be negative after GC; not allocation volume or proof of a leak |
| Sampled allocation bytes/rate and top 10 allocation sites | Separate opt-in V8 profiler at a 32 KiB sampling interval, including objects collected during profiling; statistical estimates including small instrumentation costs |
| Native RSS, external bytes, array-buffer bytes, process high-water RSS | Node/native process metrics; high-water RSS is process-lifetime peak, not per-case peak or VRAM |
| CPU | Native user/system CPU seconds; Chromium live-process cumulative CPU delta and renderer task time. Process scopes differ, and Windows counters have coarse resolution |
| Native GC count/total/max duration | Node performance-observer GC events during the timed region; browser GC pause metrics are unavailable |
| Image correctness | Fixed-pose PNGs, motion changes, foreground coverage, lighting/shadow toggles, and cross-environment spatial/color checks |

The comparison uses the median of repeat medians for the speed ratio and pooled raw samples for p95/p99/worst/variation. Ratios above one mean lower native latency. Ratios are only emitted for unprofiled latency runs whose output passes validation. Allocation profiling slows execution and runs separately. Short profiling runs and changes smaller than the sampling interval should not be overinterpreted. Object-creation/setup allocations are excluded from this steady-state profile.

The browser server enables cross-origin isolation for finer timer precision. Tiny CPU timings still need longer runs and multiple independent process launches. Keep the browser foreground, use AC power, close other GPU workloads, keep drivers/power settings stable, and verify both renderers use the same GPU. Alternate browser-first and runtime-first order across independent runs. Do not infer statistical significance from a single pair of runs or average all workloads into a universal score.

Correctness checks validate CPU outputs, expected grid coverage, full-plane coverage, and the final texture's changing color. 3D cases render validation poses 0 and 47 outside the measurement. Lighting and shadow cases also disable their feature to check that it affects the image. Cross-environment comparisons reject an average normalized RGB error above 2.5% or foreground-coverage difference above 1.5 percentage points at either pose. These are regression tolerances, not proof of exact visual equivalence; inspect the PNGs. Invalid cases retain diagnostic timing samples but receive no comparison ratio.

The native launcher normally dismisses its loading overlay on its first on-screen render. The offscreen runner explicitly dismisses it before measurement. Both environments set the same near-black `0x010101` background and clear color after renderer initialization. This changes the native GL clear state away from startup defaults and avoids the loading overlay's stale clear-color state. Earlier black-background results from workload version 1 were contaminated by that setup issue and should not be used as native rendering-performance evidence.

The browser's GPU identity is recorded; the native adapter identity is not exposed by this harness, so verify its adapter separately on multi-GPU systems. A dirty runtime checkout or a binary built from different sources weakens reproducibility; rebuild from a clean recorded revision for publishable results.

## Validation on the development machine

The latest [per-frame report](PER-FRAME-REPORT.md) measures removal of repeated native material-classification work and unnecessary JavaScript empty-map binding calls, with unchanged native images and saved browser baselines.

The subsequent [automatic batching report](AUTOMATIC-BATCHING-REPORT.md) records the native sorting-default correction, conservative internal instancing, render-target lifetime fix, and repeated native verification against the same saved browser baselines.

The next renderer optimization is recorded in [PERFORMANCE-REPORT.md](PERFORMANCE-REPORT.md): cached native material interfaces roughly halve render/readback latency in draw-heavy cases while preserving the saved native images. Browser baselines were reused unchanged.

Native fixes are recorded in [FIX-REPORT.md](FIX-REPORT.md). The corrected runtime passes all eight 3D comparisons and all six diagnostics. [RUN-REPORT.md](RUN-REPORT.md) is the preserved pre-fix baseline, including its original lighting failure.

On 2026-09-10, the harness tests and 3D runs were exercised on Edge 152, Windows, a Ryzen 7 9800X3D, and an RTX 5080 reported by the browser. See `RUN-REPORT.md` for the recorded run and the generated `results/` reports for full diagnostics. These are local observations against the available native build, not universal product scores. Runtime source changes are outside this standalone benchmark repository.
