# DirectGL command coalescing experiment — 10 September 2026

The earlier statement that coalescing cannot apply to ordered GL calls was too broad. GL-specific rules allow it without native scene objects. The main command ring now implements adjacent exact-range buffer upload replacement, enabled by default for DirectGL. An exact uniform cache is available for experiments but disabled by default because it slows the current scenes.

## Implementation and boundaries

- Two adjacent bufferSubData calls with the same target, destination offset and byte length replace the pending payload in place. This includes instance-matrix buffers. Caller data is copied immediately, so later mutations cannot change the queued upload.
- A bind, draw, different intervening command, query, submission, changed range or changed length prevents replacement. Updates on opposite sides of a draw or readback remain ordered.
- The optional uniform cache skips byte-identical single-location uploads across draws. Different values still execute in order. Program use/link/delete, queries, native scene commands and multi-element uniform arrays invalidate it. Failed submissions invalidate cached uniform state.
- Both optimizations are in host/ThreeBrowser/web/three/00-cmdbuf.js. RAW_GL continues through the shared native command decoder; no native threepp scene objects are required.
- Producer data still has to be snapshotted on every call. Buffer coalescing saves downstream command bytes, native buffer copies and GL uploads; it does not eliminate all JavaScript copying.

## Targeted instance-buffer overwrite test

The new runtime/raw-gl-coalescing-bench.mjs uploads four 640,000-byte buffers (10,000 matrices each) to the same range, then synchronously reads the entire buffer and checks every element against the last update. There are 30 warmups and 360 measured iterations per process, with three processes for each mode. This is a synthetic producer-overwrite case, not a stock Three.js scene result or a browser comparison.

| Metric, median across three runs | Disabled | Enabled |
| --- | ---: | ---: |
| Median iteration, ms | 0.7318 | 0.2853 |
| p95 iteration, ms | 0.9092 | 0.6852 |
| p99 iteration, ms | 1.0892 | 0.8888 |
| Buffer uploads per iteration | 4 | 1 |
| Commands in measured interval, including readbacks and final stats query | 1,801 | 721 |
| Command bytes avoided per 360 iterations | 0 | 691,303,680 |

Median time fell about 61%, or 2.56x throughput for this specific operation. Enabled per-process medians ranged from 0.1627 to 0.2885 ms; disabled ranged from 0.7076 to 0.7395 ms. All final buffer readbacks passed. Tail latency improved less than the median.

## Unchanged 3D scenes

Same machine: Ryzen 7 9800X3D, RTX 5080, NVIDIA 616.64, Node 24.19.0, Three.js r184. Nine fresh processes: three disabled, three default buffer coalescing, three buffer plus uniform cache. Each uses the existing 30 warmups, 120 samples and three repeats. Table values are medians of nine per-repeat statistics. Timing includes scene updates, rendering and synchronous readback, not isolated GPU time. No browser tests were rerun; the existing browser baseline remains applicable.

| Scene | Disabled median ms | Default median ms | Uniform cache median ms | Disabled / default p95 ms |
| --- | ---: | ---: | ---: | ---: |
| 3d-meshes | 1.5567 | 1.5505 | 1.7714 | 2.0226 / 1.9842 |
| 3d-instances | 0.8308 | 0.8340 | 0.8412 | 1.3946 / 1.4005 |
| 3d-triangles-low | 0.2802 | 0.2709 | 0.2895 | 0.3912 / 0.4025 |
| 3d-triangles-medium | 0.2978 | 0.2925 | 0.3080 | 0.4261 / 0.4050 |
| 3d-triangles-high | 0.3803 | 0.3772 | 0.3892 | 0.4941 / 0.5039 |
| 3d-lighting | 0.6090 | 0.6046 | 0.7201 | 0.8608 / 0.8266 |
| 3d-shadows | 0.5563 | 0.5536 | 0.6501 | 0.8165 / 0.7534 |
| 3d-city | 1.7265 | 1.6964 | 2.0450 | 2.2162 / 2.1646 |

The default optimization had zero replacement opportunities in these eight scenes: every run executed 2,889,067 native commands. These small timing differences are not evidence of a coalescing speedup. The stock renderer already submits one final buffer upload per update. The optional uniform cache skipped only 456 of 1,739,225 uniform calls (0.026%), removing 72,960 command bytes. Its lookup/comparison/snapshot overhead made the cube and city scenes approximately 14% and 18% slower, respectively. It is deliberately off by default.

## Allocation and rendering checks

Separate allocation-profile runs, one process per mode with three repeats each. V8 sampling at 32 KiB estimates JavaScript allocations, not complete native/GPU allocations. Values below are median estimated MiB per 120 samples. With zero coalescing hits in these scenes, differences should not be credited to upload elimination.

| Scene | Disabled estimated MiB | Default estimated MiB |
| --- | ---: | ---: |
| 3d-meshes | 73.89 | 77.22 |
| 3d-instances | 0.44 | 0.41 |
| 3d-triangles-low | 6.76 | 6.32 |
| 3d-triangles-medium | 5.17 | 6.57 |
| 3d-triangles-high | 5.82 | 4.72 |
| 3d-lighting | 30.32 | 32.33 |
| 3d-shadows | 24.68 | 25.64 |
| 3d-city | 97.47 | 94.95 |

All 216 timed scene-repeat results were valid. All 72 PNG captures from the nine latency runs were byte-identical to the prior main-command DirectGL captures. The full GPU-enabled runtime suite passed 83 tests with zero failures/skips; the GPU fixture also passed separately with the uniform cache enabled. Tests cover snapshot ownership, changed uniform values separated by draws, program/array/query barriers, upload ranges/sizes, buffer binds, rollover and failed submission invalidation. Existing texture, shader, render-target and readback checks remain in the GPU fixture. This is targeted compatibility evidence, not full WebGL conformance.

## Reproduction

From C:/ThreeBrowser, set THREEBROWSER_RUNTIME_ADDON to C:/ThreeBrowser/ThreeBrowserRuntime/build/bin/three_browser_runtime.node and run node ThreeBrowserRuntime/runtime/raw-gl-coalescing-bench.mjs. Set THREEBROWSER_DISABLE_RAW_GL_COALESCING=1 for the control. Set THREEBROWSER_RAW_GL_UNIFORM_CACHE=1 to enable the experimental uniform cache.

From C:/three-runtime-benchmarks, set THREEBROWSER_ROOT=C:/ThreeBrowser and run node native.mjs results/output.json --3d --direct-gl. Add --allocations for the separate allocation profile. These switches select native implementation behavior and do not change scene workloads.

Evidence: results/runtime-direct-gl-coalesce-{off,on,uniform}-{1,2,3}.json; results/runtime-direct-gl-coalesce-{off,on}-allocations.json; results/direct-gl-overwrite-{off,on}-{1,2,3}.json; results/direct-gl-coalescing-tests.txt; results/direct-gl-coalescing-uniform-gpu-tests.txt. Raw results are local ignored artifacts. The first process in each latency mode predates the added uniformCache metadata field; the uniform filenames identify the enabled-cache run.
