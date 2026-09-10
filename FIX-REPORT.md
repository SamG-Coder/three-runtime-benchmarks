# Native fixes and verification

The measured defects were fixed in ThreeBrowser commit **e41a424** (`Fix native light and texture compatibility and instance allocation churn`). The native libraries and runtime module were rebuilt and staged. Existing unrelated worktree edits were preserved. Reports were collected before the commit, so their recorded source revision is the earlier HEAD with `dirty: true`; the pending fix is now recorded by this commit.

## Diagnosed and fixed

1. **Allocation churn:** `InstancedMesh.setMatrixAt()` created a typed-array view for every matrix write. The command writer now accepts an offset and copies the 16 values directly into its ring, preserving snapshot and batching semantics.
2. **Overbright lights:** the native command omitted point-light distance/decay. JavaScript requested decay 2, while native C++ retained its old default of 1. The extended state also carries spot-light cone parameters and updates when properties change.
3. **White/stale textures:** maps attached after material creation were not bound at render preparation. Native map bindings now follow attachment, changes, removal and reattachment, with unchanged bindings cached.
4. **Repeated byte-upload allocations:** same-sized RGBA updates now reuse native CPU image storage and preserve sampler state. Resize and format transitions retain the fallback path.
5. **Startup clear-color contamination:** loading-overlay raw GL calls left renderer state caches stale. The renderer cache is now reset after the overlay. A GPU regression verifies an ordinary black clear without benchmark workarounds.
6. **Draw setup overhead:** repeated owning-string type queries and duplicate environment-map casts were removed from native program setup.

The benchmark scenes and correctness thresholds were not weakened to obtain passes.

## Results

Runs use 30 warm-ups, 120 samples, three repeats, fixed 512×512 rendering, no MSAA, and separate unprofiled latency / allocation / on-screen frame-pacing passes. Medians below are across repeat medians. Allocation values are V8 sampling estimates over 120 updates.

| Measurement | Before | After |
| --- | ---: | ---: |
| Instance-update allocations | 120.376 MiB | 0.626 MiB |
| Instance render/readback median | 3.102 ms | 2.680 ms |
| Instance render/readback p99 | 4.390 ms | 3.740 ms |
| Lighting image error | about 4.95% | at most 0.685% |
| Byte-texture update correctness | Failed | Passed |
| 3D image comparisons | 7/8 passed | **8/8 passed** |
| Diagnostic image/output checks | Texture failure remained | **6/6 passed** |

The instance allocation reduction is approximately **99.5%**; its measured median latency is approximately **13.6% lower**. Allocation estimates after the fix were 1.564, 0.626 and 0.469 MiB across the three repeats. No speed comparison is made for the old lighting/texture results, because their output was incorrect.

### Native render/readback results

| Scene | Before median ms | After median ms | Current image check |
| --- | ---: | ---: | --- |
| 1,000 cubes | 5.325 | 5.238 | Pass |
| 10,000 instances | 3.102 | 2.680 | Pass |
| 61,440 sphere triangles | 0.679 | 0.662 | Pass |
| 577,536 sphere triangles | 0.578 | 0.598 | Pass |
| 2,334,720 sphere triangles | 0.663 | 0.659 | Pass |
| PBR lighting | Invalid comparison | 1.906 | Pass |
| Shadow scene | 0.853 | 0.830 | Pass |
| City fly-through | 5.959 | 5.901 | Pass |

Small differences outside the instancing case should not be treated as significant speed improvements. The browser still has substantially lower latency on many workloads.

### Frame stability and resources

The fixed native path was also rerun on screen. Its 10,000-instance callback p99 was 16.282 ms in this run, compared with 19.477 ms in the saved earlier run. Native VSync remains disabled; scheduling conditions and browser display cadence vary, so this is an observation rather than proof that the code changes alone improved frame pacing. Frame intervals, submission timings, CPU counters, heap/RSS snapshots and GC events remain in the raw reports.

A separate native city CPU/GPU-stage investigation localized most of the remaining cost to native draw/program/uniform setup (roughly 4 ms), with about 0.7 ms of render-list preparation. The type-query cleanup is modest; it does not remove the broader native OpenGL submission/driver cost. GPU submission spans overlap CPU work and must not be added to CPU durations. GPU VRAM and native C++ allocation stacks were not measured.

## Verification

- Native build and staging succeeded.
- **71 runtime tests passed with GPU tests enabled; zero failures or skips.**
- New checks cover offset matrix snapshots and buffer boundaries; attenuation/cone command data; live point-light changes; texture attachment, byte updates, resizing and UV state; map removal/reattachment; black clearing; and actual instance rendering.
- All 14 benchmark cases pass the existing correctness checks.

## Evidence

- [Fixed 3D comparison](results/comparison-fixed-3d.md)
- [Fixed diagnostics comparison](results/comparison-fixed-diagnostics.md)
- [Fixed allocation comparison](results/comparison-fixed-allocations.md)
- [Fixed frame-pacing comparison](results/comparison-fixed-frames.md)
- [Native runtime test output](results/native-final-tests.txt)
- [Original baseline report](RUN-REPORT.md)

The native PBR lighting output after the fix:

![Corrected native lighting](results/runtime-fixed-3d-3d-lighting.png)

Raw results and images remain generated local artifacts under `results/`, ignored by Git. Baseline reports were preserved rather than overwritten.
