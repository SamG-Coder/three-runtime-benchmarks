# Local 3D benchmark run

Generated from reports dated 2026-09-10T02:51:14.443Z through 2026-09-10T02:56:49.047Z. This is an exploratory local comparison, not a universal performance claim.

Environment: AMD Ryzen 7 9800X3D 8-Core Processor; win32 10.0.26200; Edge/Chromium 152.0.4191.66; browser GPU: ANGLE (NVIDIA, NVIDIA GeForce RTX 5080 (0x00002C02) Direct3D11 vs_5_0 ps_5_0, D3D11). Native backend: OpenGL; Node v24.19.0; Three.js revision 184. Native checkout: 50fd83879315be5188f4003621e45c2c241552ec, dirty=true. The native adapter identity is not exposed by the harness.

Each case: 30 warm-ups, 120 measured iterations, 3 repeats, 512×512, no MSAA. HTML/DOM/CSS are excluded. Latency, on-screen frame pacing and sampled allocations use separate passes.

## Completed rendering plus readback

Median is the median of repeat medians. p99 pools the raw samples. Both include synchronous full-target readback. Failed image comparisons are diagnostic only.

Scene | Browser median ms | Native median ms | Browser p99 ms | Native p99 ms | Image comparison
--- | ---: | ---: | ---: | ---: | ---
3d-meshes | 1.035 | 5.325 | 1.600 | 6.229 | PASS
3d-instances | 1.120 | 3.102 | 1.670 | 4.390 | PASS
3d-triangles-low | 0.230 | 0.679 | 0.550 | 1.235 | PASS
3d-triangles-medium | 0.245 | 0.578 | 0.615 | 1.059 | PASS
3d-triangles-high | 0.335 | 0.663 | 0.695 | 1.271 | PASS
3d-lighting | 0.430 | 1.925 | 0.795 | 2.552 | FAIL — speed ratio withheld
3d-shadows | 0.405 | 0.853 | 0.905 | 1.406 | PASS
3d-city | 1.045 | 5.959 | 1.730 | 6.638 | PASS

The PBR lighting scene is substantially brighter in the native output. Its pose, geometry and occupancy are similar, but color differences exceed the preset threshold. Do not interpret its timings as equivalent rendering. Other scene images pass both fixed-pose comparisons.

## Frame stability

These are actual animation callback intervals with on-screen rendering, without timed readback. Native vsync=false; native window=512×512. Browser scheduling can change with display/focus state. Ratios are withheld because cadence policies differ. Per-repeat medians reveal changes that a pooled average hides.

Scene / environment | Repeat medians ms | p99 ms | Worst ms | Stddev ms | Intervals >33.38 ms
--- | --- | ---: | ---: | ---: | ---:
3d-meshes / browser | 16.670, 16.670, 16.670 | 17.425 | 17.665 | 0.306 | 0
3d-meshes / runtime | 16.512, 16.600, 16.577 | 21.752 | 23.925 | 2.440 | 0
3d-instances / browser | 16.655, 16.670, 16.670 | 17.790 | 18.015 | 0.348 | 0
3d-instances / runtime | 16.060, 16.396, 16.436 | 19.477 | 31.882 | 3.248 | 0
3d-triangles-low / browser | 16.665, 16.670, 16.670 | 17.345 | 17.475 | 0.257 | 0
3d-triangles-low / runtime | 15.152, 15.195, 15.047 | 19.143 | 22.703 | 6.478 | 0
3d-triangles-medium / browser | 16.670, 16.675, 16.670 | 17.460 | 17.530 | 0.287 | 0
3d-triangles-medium / runtime | 15.055, 15.669, 15.275 | 18.102 | 20.362 | 6.392 | 0
3d-triangles-high / browser | 16.670, 16.665, 16.660 | 17.335 | 17.940 | 0.267 | 0
3d-triangles-high / runtime | 15.453, 15.623, 15.484 | 18.754 | 19.701 | 6.486 | 0
3d-lighting / browser | 16.675, 16.665, 16.670 | 17.455 | 17.665 | 0.247 | 0
3d-lighting / runtime | 16.387, 16.448, 16.085 | 19.470 | 25.823 | 4.082 | 0
3d-shadows / browser | 16.670, 16.665, 16.650 | 17.370 | 17.565 | 2.498 | 0
3d-shadows / runtime | 15.562, 15.300, 15.549 | 18.677 | 20.552 | 6.145 | 0
3d-city / browser | 16.670, 16.665, 5.555 | 17.530 | 18.015 | 5.244 | 0
3d-city / runtime | 16.606, 16.494, 16.459 | 22.698 | 27.711 | 2.701 | 0

Variability includes scheduler behavior and cadence changes; it cannot all be attributed to rendering or GC. These are not physical display scanout measurements or GPU-dropped-frame counts. A longer controlled run on one fixed-refresh display is needed for stable frame-pacing conclusions.

## Allocation behavior

Estimated V8 allocations over 120 updates, median across repeats. A 32 KiB sampling interval includes objects collected during the profile. Setup is excluded; small instrumentation costs are included. These are statistical estimates, not exact allocation counts. Profiling timings are not used for speed ratios. The lighting case remains visually mismatched.

Scene | Browser allocated MiB | Native allocated MiB | Native KiB/update
--- | ---: | ---: | ---:
3d-meshes | 27.804 | 6.322 | 53.951
3d-instances | 0.125 | 120.376 | 1027.209
3d-triangles-low | 1.376 | 0.813 | 6.940
3d-triangles-medium | 1.345 | 1.189 | 10.145
3d-triangles-high | 1.754 | 0.845 | 7.210
3d-lighting | 10.645 | 2.952 | 25.193
3d-shadows | 8.055 | 1.693 | 14.444
3d-city | 32.087 | 0.657 | 5.607

Allocation hot spots in native instancing (first profiled repeat):

- subarray, line 0: 118.375 MiB estimated self allocations (runtime internal).
- invert, line 2346: 1.313 MiB estimated self allocations (02-math.js).
- render, line 764: 0.188 MiB estimated self allocations (10-renderer.js).
- join, line 0: 0.094 MiB estimated self allocations (runtime internal).
- lengthSq, line 1074: 0.094 MiB estimated self allocations (02-math.js).

## CPU, retained memory and garbage collection

These counters come from the unprofiled latency pass. Heap delta is not allocation volume and may be negative after collection. CPU counters have different scopes: browser totals include the newly launched Chromium processes still alive at the checkpoint; native totals cover the Node/native process. Coarse OS CPU accounting limits short cases. Native RSS includes process and driver allocations; it is not GPU VRAM.

Scene / environment | Median CPU ms / measured repeat | Median heap delta MiB | Native maximum observed RSS MiB | Native observed GC count / total ms
--- | ---: | ---: | ---: | ---
3d-meshes / browser | 147.970 | -0.376 | unavailable | unavailable
3d-meshes / runtime | 673.000 | 1.622 | 321.723 | 2 / 2.431
3d-instances / browser | 149.903 | 0.109 | unavailable | unavailable
3d-instances / runtime | 360.000 | -6.957 | 323.984 | 11 / 1.169
3d-triangles-low / browser | 44.641 | 1.610 | unavailable | unavailable
3d-triangles-low / runtime | 93.000 | 0.869 | 323.172 | 0 / 0.000
3d-triangles-medium / browser | 48.542 | 1.610 | unavailable | unavailable
3d-triangles-medium / runtime | 78.000 | 0.855 | 326.957 | 0 / 0.000
3d-triangles-high / browser | 55.498 | 1.634 | unavailable | unavailable
3d-triangles-high / runtime | 77.000 | 0.814 | 334.980 | 0 / 0.000
3d-lighting / browser | 68.946 | 3.730 | unavailable | unavailable
3d-lighting / runtime | 250.000 | 2.487 | 325.418 | 0 / 0.000
3d-shadows / browser | 73.478 | -8.448 | unavailable | unavailable
3d-shadows / runtime | 109.000 | 1.518 | 325.414 | 0 / 0.000
3d-city / browser | 155.008 | 2.147 | unavailable | unavailable
3d-city / runtime | 750.000 | 0.562 | 328.668 | 0 / 0.000

RSS above is the maximum of end-of-interval snapshots, not an instantaneous per-scene peak. Process-lifetime high-water RSS, backing storage, external/array-buffer bytes and GC maximum durations are in the raw JSON. Browser GC pauses, GPU memory, GPU timestamp timings and native C++ allocation stacks are not collected. Three repeats are not a memory leak test.

## Saved evidence

- [Latency details](results/comparison-3d.md)
- [Frame-pacing details](results/comparison-frames.md)
- [Allocation details](results/comparison-allocations.md)
- [Browser raw latency results](results/browser-3d.json) and [native raw latency results](results/runtime-3d.json)
- [Browser frame results](results/browser-frames.json) and [native frame results](results/runtime-frames.json)
- [Browser allocation results](results/browser-allocations.json) and [native allocation results](results/runtime-allocations.json)

Browser city validation pose:

![Browser city](results/browser-3d-3d-city.png)

Native city validation pose:

![Native city](results/runtime-3d-3d-city.png)

The raw results and PNGs are generated local artifacts ignored by Git. Run the three passes and `npm run report` to create a fresh report in another checkout. The committed report is a record of this local experiment.

## Earlier setup correction

The first offscreen-only harness left the runtime loading state active and reused the initial black clear-color state. A stale light clear color contaminated native images and invalidated the old comparisons. The runner now explicitly ends loading and sets the same near-black background in both environments. This is a benchmark setup correction; runtime source files were not changed. Earlier version-1 failures should not be treated as evidence that the native renderer cannot draw these scenes.
