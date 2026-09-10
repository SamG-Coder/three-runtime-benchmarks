# Testing the need for threepp with a direct OpenGL bridge

Follow-up: direct GL now uses the main command buffer. See [DIRECT-GL-MAIN-CMD-REPORT.md](DIRECT-GL-MAIN-CMD-REPORT.md) for the migration and new measurements. The results below preserve the original private-bridge experiment.

Measured 2026-09-10. **The eight 3D workloads render correctly without native threepp scene objects or its scene renderer.** The direct path has lower median completed render/readback latency in all eight workloads in this experiment, with its largest improvement in instancing. Most object-heavy cases allocate substantially more JavaScript memory, and several gains are small. This supports bypassing the scene/render layer; it is not yet a complete removal of the threepp dependency.

## Architecture being compared

Existing: JavaScript Three.js facade → scene/object command bridge → native threepp objects and GLRenderer → OpenGL.

Experimental: stock Three.js WebGLRenderer → binary graphics-command bridge → existing OpenGL context → OpenGL.

The graphics bridge remains. JavaScript records state changes, uniforms, resource uploads and draws in a reusable ArrayBuffer. Native decodes and executes the batch on the context-owning worker. Queries and readbacks flush queued commands and return results. There is no native Mesh/Material/Camera/Scene reconstruction. The third final run records **2,889,067 graphics commands, 3,961 batches, zero native scene/resource slots and no native render scene**.

The runtime is still linked to threepp and reuses its existing window/context startup infrastructure. This experiment bypasses native scene preparation and rendering during the workload; it does not establish that the entire dependency can already be deleted. It also changes the JavaScript facade to stock Three.js, so the difference includes JavaScript transforms and renderer implementation, graphics-command granularity, and the native scene layer. It cannot attribute every gain solely to threepp C++ execution.

## Method

- Same deterministic 3D workloads and six diagnostics, Three.js revision 184, 512×512, no MSAA, same materials/cameras/geometry, unchanged image tolerances and synchronous RGBA8 readback protocol. HTML/DOM layout/CSS are excluded.
- Existing saved browser WebGL baselines were reused. No browser tests were rerun. Stock Three.js on the direct path comes from the benchmark package, matching the browser revision.
- Native GPU reports **NVIDIA GeForce RTX 5080/PCIe/SSE2**, OpenGL **4.3.0 NVIDIA 616.64**. Windows 10.0.26200, Ryzen 7 9800X3D, Node v24.19.0. The saved browser uses Edge 152 and reports the same RTX 5080 through ANGLE.
- Three fresh process launches for the threepp control and three final launches for direct GL. Each has 30 warm-ups, 120 timed samples and three repeats per scene: 1,080 timed frames per workload and native path. The final direct launches followed the control/prototype sequence; they were not a randomized interleaved trial. Small differences such as 4–7% deserve further repetition before being called robust gains.
- Latency includes updates, command preparation, completed rendering and synchronous full-target readback. It is not pure GPU time or FPS. Setup, warm-up, validation and disposal are excluded. The native baseline has the previous sorting, automatic batching and material preparation optimizations enabled; sortObjects remains true by default on both paths.
- Median values use nine repeat medians for each native path and the existing three browser repeat medians. Separate allocation and on-screen passes use three repeats each. Unrelated pre-existing edits remained in the native working tree; native base revision is fc820f3. Binary/source fingerprints are saved locally for reproducibility.

## Completed render/readback latency

| Workload | Saved browser ms | threepp control ms | Direct OpenGL ms | Lower than threepp |
| --- | ---: | ---: | ---: | ---: |
| 3d-meshes | 1.035 | 1.584 | 1.520 | 4.0% |
| 3d-instances | 1.120 | 2.495 | 0.820 | 67.1% |
| 3d-triangles-low | 0.230 | 0.356 | 0.275 | 22.6% |
| 3d-triangles-medium | 0.245 | 0.382 | 0.295 | 22.7% |
| 3d-triangles-high | 0.335 | 0.462 | 0.372 | 19.4% |
| 3d-lighting | 0.430 | 0.716 | 0.604 | 15.7% |
| 3d-shadows | 0.405 | 0.632 | 0.538 | 14.9% |
| 3d-city | 1.045 | 1.811 | 1.681 | 7.2% |

The instance case drops from roughly 2.49 to 0.82 ms. Sphere workloads improve about 19–23%, and lighting/shadows about 15–16%. Cubes and city improve less. The direct path still trails the saved browser in seven of eight cases; 10,000 instances is the exception. Replacing the scene layer does not remove all native/browser overhead.

| Workload | threepp p99 ms | Direct p99 ms | threepp worst ms | Direct worst ms |
| --- | ---: | ---: | ---: | ---: |
| 3d-meshes | 2.285 | 2.138 | 3.681 | 2.699 |
| 3d-instances | 3.447 | 1.556 | 3.825 | 2.072 |
| 3d-triangles-low | 0.714 | 0.721 | 2.155 | 1.761 |
| 3d-triangles-medium | 0.720 | 0.641 | 0.979 | 1.005 |
| 3d-triangles-high | 0.889 | 0.731 | 1.961 | 1.123 |
| 3d-lighting | 1.185 | 1.176 | 1.413 | 2.137 |
| 3d-shadows | 1.094 | 0.991 | 1.295 | 1.328 |
| 3d-city | 2.492 | 2.456 | 2.762 | 2.773 |

Tails pool 1,080 samples per native path. They should be inspected separately from medians, not combined into a universal performance score.

## JavaScript allocation tradeoff

Estimated MiB allocated over 120 timed frames, median of three repeats in a separate sampling pass:

| Workload | threepp facade MiB | Direct OpenGL MiB |
| --- | ---: | ---: |
| 3d-meshes | 9.67 | 74.50 |
| 3d-instances | 0.63 | 0.34 |
| 3d-triangles-low | 1.13 | 6.19 |
| 3d-triangles-medium | 1.38 | 5.79 |
| 3d-triangles-high | 1.28 | 5.04 |
| 3d-lighting | 3.74 | 30.29 |
| 3d-shadows | 1.69 | 25.34 |
| 3d-city | 6.06 | 97.44 |

For example, cubes increase from about 9.7 to 74.5 MiB and city from 6.1 to 97.4 MiB, while instancing decreases. This is sampled V8 allocation volume, not retained heap, total process allocation or VRAM. The facade performs work in C++, whose allocations this profiler does not count. The comparison therefore identifies higher JS allocation/GC pressure in the direct path; it does not prove that total application memory is higher by these ratios. Native C++ allocations and long-duration leak behavior remain unmeasured.

## On-screen pass

Both paths present at 512×512 with VSync disabled. Direct GL records **3,624 presentations**; the control records 3,622. The direct bridge swaps its context immediately after a default-framebuffer render. Its callbacks are uncapped and run much faster than the facade's current wait/presentation behavior. Callback intervals must not be used as an FPS speedup claim.

| Workload | threepp update/submission ms | Direct update/submission ms |
| --- | ---: | ---: |
| 3d-meshes | 1.281 | 1.219 |
| 3d-instances | 1.820 | 0.545 |
| 3d-triangles-low | 0.157 | 0.166 |
| 3d-triangles-medium | 0.133 | 0.150 |
| 3d-triangles-high | 0.144 | 0.143 |
| 3d-lighting | 0.429 | 0.423 |
| 3d-shadows | 0.210 | 0.363 |
| 3d-city | 1.331 | 1.328 |

Submission boundaries differ: direct GL waits for command replay/presentation inside the call, while the facade can complete native work later. These values describe the actual API call cost, not matching completed GPU work. The main fair completion boundary is the synchronous readback latency table. Direct submission is not universally lower: shadows and some sphere cases cost more inside the call. The native fps/frameUs diagnostic counters are not maintained by the experimental swap path and should not be used; callback samples and presentation counts are recorded independently.

## Compatibility and checks

- All eight direct 3D cases pass all three comparisons against the saved browser. Maximum normalized 32×32 spatial RGB signature error is **0.0011%**; the unchanged limits are 2.5% RGB and 1.5 percentage-point foreground coverage. Six cases have identical signatures; these are image signatures, not a claim of byte-identical full images.
- All six diagnostics pass: typed-array updates, 5,000 transforms, 1,024 draw calls, dynamic instances, texture uploads and multipass rendering. Separate frame and allocation passes also pass all eight saved browser comparisons.
- All **75 runtime tests passed with GPU tests enabled** after integration, with no skips. A further focused direct-GL test passed after tightening parameter-query validation. The direct regression covers rendering, live texture changes/removal/reattachment, buffer snapshot/subrange ordering, shader failure reporting, malformed batches, undersized readback rejection, zero native scene slots and presentation.
- The adapter is explicitly experimental and incomplete. It covers typed-array uploads and the tested graphics operations; DOM image uploads, compressed textures, context-loss recovery, multiple contexts, asynchronous WebGL fences/readback, and complete extension/parameter support remain outside this implementation. No benchmark workload was reduced to obtain a pass.

## Use and next decision

Run `node native.mjs results/runtime-direct-gl.json --3d --direct-gl` after building/staging the runtime, with THREEBROWSER_ROOT set. Omit --direct-gl for the existing path; add --frames or --allocations for separate passes. The default runtime rendering path is unchanged. The experimental runtime factory and architecture are documented in C:/ThreeBrowser/ThreeBrowserRuntime/DIRECT_OPENGL_EXPERIMENT.md.

For these workloads, the native scene/render layer is not required for correct output. Before replacing the default or removing the library, the remaining work is broader API coverage, separating window/context ownership from threepp, matching presentation policy, and reducing the direct path's repeated JS allocations. These results favor continuing the graphics-bridge experiment rather than assuming that removing a C++ library alone guarantees a win.

Raw results are local under results/ and Git-ignored. Browser baseline files are preserved. Native changes, benchmark mode and this report remain uncommitted.
