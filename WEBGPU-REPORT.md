# Browser versus native WebGPU

Measured 2026-09-10. Native WebGPU has lower steady-state render/readback latency in all eight scenes and lower on-screen update/submission time in this run. Its sampled JavaScript allocation volume is higher across all eight cases. These are local observations, not a universal WebGPU or FPS ranking.

## Environment and method

- Both sides use the exact stock Three.js 0.184.0 package from this benchmark repository and the same shared eight 3D scenes. Native uses the staged navigator.gpu adapter and wgpu-native/Vulkan, bypassing the WebGL facade and threepp GLRenderer.
- Windows 10.0.26200; Ryzen 7 9800X3D; Edge 152.0.4191.66; native Node v24.19.0. Native reports NVIDIA GeForce RTX 5080. Browser WebGPU reports NVIDIA/Blackwell; its GPU inventory identifies an RTX 5080 with matching vendor/device IDs. The browser's lower-level WebGPU backend is not exposed by this harness; its separate ANGLE/D3D11 inventory fields must not be treated as a WebGPU backend name.
- Native checkout fc820f3114a22d79a6cdcc49c287fef48639667f, with pre-existing unrelated edits. No native source was changed for this comparison. Binary and Three.js SHA-256 fingerprints are in [the local manifest](results/webgpu-binary-manifest.json).
- Three independent process launches per environment, alternating native-first, browser-first, native-first. Each launch uses 30 warm-up iterations, 120 measured samples and three repeats per scene: 1,080 timed frames per scene and environment in total. Launches run sequentially without competing benchmark GPU work.
- 512×512, pixel ratio 1, no MSAA, RGBA8 offscreen target. Latency includes scene updates, submission, completed rendering and asynchronous 1 MiB pixel readback, including transfer/allocation. It is neither pure GPU time nor physical presentation latency. Warm-up, setup, validation and disposal are excluded.
- Median columns use the median of nine repeat medians. p99 pools all 1,080 samples. Frame pacing and allocations each use a separate launch with three repeats and the same sample counts.
- The new WebGPU baseline was necessary because existing browser reports cover WebGL. Saved WebGL baselines were preserved and not rerun. HTML, DOM layout, CSS and UI work remain excluded.

## Completed rendering and readback

| Workload | Browser median ms | Native median ms | Browser/native | Browser p99 ms | Native p99 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| 3d-meshes | 6.445 | 4.312 | 1.49× | 8.435 | 8.719 |
| 3d-instances | 4.095 | 1.089 | 3.76× | 5.925 | 3.131 |
| 3d-triangles-low | 3.115 | 0.754 | 4.13× | 4.895 | 2.825 |
| 3d-triangles-medium | 3.100 | 0.727 | 4.26× | 5.015 | 2.601 |
| 3d-triangles-high | 3.120 | 0.824 | 3.79× | 4.995 | 2.699 |
| 3d-lighting | 4.110 | 2.080 | 1.98× | 5.995 | 4.876 |
| 3d-shadows | 4.015 | 1.490 | 2.69× | 5.540 | 4.280 |
| 3d-city | 4.120 | 1.654 | 2.49× | 6.125 | 5.273 |

All eight cases pass all three launch comparisons. The cube case has slightly worse native p99 despite its lower median; the other seven have lower native p99. The large low-object-count advantage includes completion/readback costs. These measurements do not establish that the GPU executes shaders four times faster, and they cannot be directly ranked against the earlier synchronous WebGL protocol.

## On-screen update and submission

This pass has no timed readback. It measures application updates plus renderer submission inside real animation callbacks. Native recorded 3,621 presentations at 512×512. GPU execution can overlap these CPU timings; this is not completed GPU work.

| Workload | Browser median ms | Native median ms | Browser p99 ms | Native p99 ms |
| --- | ---: | ---: | ---: | ---: |
| 3d-meshes | 2.175 | 1.849 | 3.515 | 2.547 |
| 3d-instances | 1.380 | 0.581 | 1.920 | 1.212 |
| 3d-triangles-low | 0.335 | 0.197 | 0.765 | 0.437 |
| 3d-triangles-medium | 0.330 | 0.198 | 0.690 | 0.407 |
| 3d-triangles-high | 0.320 | 0.194 | 0.665 | 0.391 |
| 3d-lighting | 1.035 | 0.720 | 1.650 | 1.309 |
| 3d-shadows | 0.845 | 0.557 | 1.490 | 1.049 |
| 3d-city | 1.295 | 1.007 | 1.850 | 1.531 |

Browser callback medians are about 16.67 ms. Native medians are about 4.01 ms, or 5.01 ms for cubes, under a 240 Hz runtime scheduling target with VSync disabled. Scheduling policies differ, so these intervals are not used to claim a fourfold FPS advantage. Native callback p99 ranges from about 6.04 to 9.05 ms; browser p99 from 16.98 to 17.51 ms. Browser cubes had one 99.80 ms callback interval; native cubes had one 30.03 ms interval and native city one 17.99 ms interval. The detailed report retains all tails and budget counts; small budget exceedances around browser refresh cadence are not dropped-frame counts.

## Sampled JavaScript allocations

Median estimated MiB allocated during 120 measured frames, using a separate V8 sampling pass at a 32 KiB interval. Profiling timings are excluded from the speed table.

| Workload | Browser MiB | Native MiB |
| --- | ---: | ---: |
| 3d-meshes | 44.34 | 121.72 |
| 3d-instances | 0.63 | 2.22 |
| 3d-triangles-low | 4.51 | 13.05 |
| 3d-triangles-medium | 4.44 | 10.27 |
| 3d-triangles-high | 4.23 | 10.25 |
| 3d-lighting | 12.68 | 40.97 |
| 3d-shadows | 11.61 | 29.72 |
| 3d-city | 21.53 | 58.96 |

The native cube case is approximately 2.7 times the browser allocation volume, with about 122 MiB over 120 frames. Native city is about 59 MiB versus 22 MiB. Profiles attribute substantial volume to draw submission, matrix uniform updates and binding updates; the native adapter records per-command arrays before replay. Reducing recurring command-recording and uniform-update allocations is a concrete next investigation, but this comparison does not isolate their individual CPU cost. Attribution can include inlined callees and V8 versions differ.

Sampled allocations are statistical JS estimates, not retained memory, total native C++ allocation, GPU VRAM or proof of a leak. Heap deltas, native RSS, CPU counters and native GC pause samples are retained in JSON; browser/native process scopes differ. Long-duration leaks and GPU memory were not measured.

## Correctness and harness safeguards

- All eight comparisons pass across each of three latency launches, the frame-pacing pass and the allocation pass, including fixed poses 0/47, motion, lighting disabled/enabled and shadows disabled/enabled. Maximum 32×32 spatial RGB signature difference across latency launches is 0.0015%; existing 2.5% RGB and 1.5 percentage-point coverage tolerances were unchanged. This validates these workloads, not complete API compatibility.
- The harness rejects WebGL fallback. Native readback waits for mapped data rather than queue.onSubmittedWorkDone(), which currently resolves immediately in the native adapter.
- Three.js r184 normally updates FRAME-scoped light and shadow nodes from its internal animation loop. A tight offscreen render loop can otherwise reuse stale state. The harness stops that private loop and advances exactly one logical frame per benchmark update on both sides, including frame mode. The integration checks r184 and needs review on a package upgrade. Initial exploratory results before this correction are excluded.
- Native frame mode attaches the canvas to the runtime's presentation tree. An additional comparison guard requires a positive native presentation count. An exploratory detached-canvas run was replaced and is excluded.
- WebGPU capture orientation is top-left, while existing WebGL captures remain bottom-left; PNG saving respects each capture's declared origin.
- The 13 harness tests pass, covering asynchronous sample completion, backend fallback rejection, logical-frame advancement and the native presentation guard, plus previous validation/statistics regressions.

## Reproduce and evidence

Use the WebGPU commands in [README.md](README.md). To reproduce the three latency pairs, set THREEBROWSER_ROOT and BROWSER_CHANNEL as documented, then run browser.mjs and native.mjs with --3d --webgpu and independent output filenames. Use --frames and --allocations for separate passes. GPU passes must remain sequential. Preserve this browser baseline for future native-only optimizations unless the workload or protocol changes.

- [Latency launch 1](results/comparison-webgpu-1.md), [launch 2](results/comparison-webgpu-2.md), [launch 3](results/comparison-webgpu-3.md)
- [Frame pacing](results/comparison-webgpu-frames.md)
- [Allocations](results/comparison-webgpu-allocations.md)
- Raw JSON and per-scene PNGs use matching browser-webgpu-* and runtime-webgpu-* filenames under results/. Generated evidence is local and Git-ignored.

Benchmark changes and this report remain uncommitted. Existing WebGL report files are preserved.
