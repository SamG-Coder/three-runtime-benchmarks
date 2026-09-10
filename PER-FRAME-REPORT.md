# Repeated frame-work optimization

The previous sorting/batching work was committed as ThreeBrowser **00474c3**, with its benchmark report in **219c95c**. This follow-up targets work executed for visible objects on every frame and every render pass. Initialization and shader warm-up remain outside the measured interval.

## Changes

**Native render-list classification:** each visible object previously triggered a multiple-inheritance `dynamic_cast` to discover whether its material supports transmission, including opaque materials that can never transmit. The GL render list now uses the existing renderer-owned material-interface cache. It reads the current `transmission` value for every push; it does not cache whether a material is currently opaque, transparent or transmissive. Other backends retain the generic classifier. This adds one non-owning pointer per cached material, with the same disposal lifetime as the existing cache.

**JavaScript empty texture slots:** every material synchronization visited all eight map slots and entered the binding helper for each one. Empty slots with no previous binding now skip that helper. Actual textures and previously bound slots still enter it, preserving uploads, late attachment and removal. This does not skip entire material visits or defer live mutations. Its isolated timing contribution was small; the main measured gain is native classification.

## Per-frame evidence

The city pass trace, averaged over passes 100–399, shows render-list preparation falling from **723 to 450 microseconds per frame**, approximately **38% lower CPU time**. Transform preparation remains about 21 microseconds and draw work about 57 microseconds. The earlier automatic-instancing optimization remains active. These instrumented CPU stages include driver work; they are diagnostic rather than pure GPU timings.

The before run used the preceding committed build. The final build was measured in three independent process launches, each with 30 warm-ups, 120 samples and three repeats per workload. The after value below is the median of nine repeat medians; before is the median of its three repeat medians. Both use 512×512, no MSAA, identical scenes, and completed rendering plus synchronous readback. Existing unrelated working-tree edits remained present throughout. Browser tests were not rerun; saved browser baselines and tolerances were reused unchanged.

| Workload | Native before ms | Native after ms | Lower latency |
| --- | ---: | ---: | ---: |
| 1,000 cubes | 1.792 | 1.609 | 10.2% |
| 10,000 instances | 2.571 | 2.412 | 6.2% |
| 61,440 sphere triangles | 0.398 | 0.358 | 9.9% |
| 577,536 sphere triangles | 0.410 | 0.378 | 7.7% |
| 2,334,720 sphere triangles | 0.479 | 0.465 | 3.1% |
| PBR lighting | 0.827 | 0.732 | 11.5% |
| Shadows | 0.705 | 0.668 | 5.2% |
| City fly-through | 2.108 | 1.846 | 12.4% |

Cube launch medians were 1.637, 1.592 and 1.609 ms; city medians were 1.851, 1.849 and 1.816 ms. Pooled p99 fell from 2.505 to 2.262 ms for cubes and 2.655 to 2.402 ms for city. Medium-triangle p99 increased from 0.671 to 0.757 ms. Small changes and existing-instance improvements should not be attributed entirely to these optimizations; the strongest evidence is the repeatable draw-heavy gain and corresponding render-list CPU reduction.

The saved browser remains faster on many cases: cubes are 1.035 ms and city 1.045 ms. This work reduces recurring preparation cost rather than establishing overall browser/native parity.

## Verification and limits

- All **74 runtime tests pass with GPU tests enabled**, no failures or skips.
- A new standalone C++ regression passes 100 successive render-list rebuilds, compares cached and generic classification, changes transmission/transparent state without `needsUpdate`, changes transmission again within a pass, and removes/recreates the material cache. It is registered in the CMake test suite and was compiled and run directly against the built native library.
- All eight 3D cases pass the saved browser comparison in each of the three final launches; all six diagnostics pass.
- The eight native validation PNGs are **byte-for-byte identical** before and after. Additional validation poses and feature toggles also retain their existing checks.
- Separate allocation and frame-pacing passes each pass all eight saved browser comparisons. Existing GPU texture tests cover the map-slot change, including attachment, updates and removal.

Frame pacing is essentially unchanged: cube/city/instance callback p99 was 16.425/16.230/16.299 ms, compared with 16.176/16.154/16.363 ms in the preceding native run. Two cube intervals exceeded the 16.67 ms budget plus tolerance; city and instance had none. Native VSync remains disabled, and callback cadence is not physical display latency.

V8 sampled allocations for 120 updates of 10,000 instances were 1.626, 0.344 and 0.594 MiB. These are statistical JS allocation estimates, not native C++ memory or GPU VRAM. There is no new per-frame native cache allocation in the classification change. Long-duration native leak behavior was not measured.

A separate V8 profile identified recurring transform/instance update work (`setFromEuler`, matrix composition and instance command encoding), as well as submission/readback waits. These remain candidates for further per-frame investigation; no math semantics or benchmark workloads were changed in this iteration.

## Evidence

- [Native before](results/runtime-per-frame-before.json)
- [Final launch 1](results/comparison-per-frame-final-1.md)
- [Final launch 2](results/comparison-per-frame-final-2.md)
- [Final launch 3](results/comparison-per-frame-final-3.md)
- [Diagnostics](results/comparison-per-frame-diagnostics.md)
- [Frame pacing](results/comparison-per-frame-frames.md)
- [Allocations](results/comparison-per-frame-allocations.md)
- [Runtime test log](results/native-per-frame-tests.txt)
- [C++ classification regression](results/per-frame-classification-test.txt)
- [City pass trace](results/per-frame-city-passes.csv)

These follow-up source changes are committed in ThreeBrowser as **fc820f3** (`Reduce per-frame native material preparation costs`). Generated raw evidence is local and Git-ignored under `results/`. Previous reports and browser baselines are preserved.
