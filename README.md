# Browser versus ThreeBrowserRuntime benchmarks

Six deterministic workloads using one shared JavaScript suite. Browser execution uses stock Three.js 0.184.0 and WebGL2; native execution uses ThreeBrowserRuntime's Three.js facade and native renderer. This compares application API paths, not identical rendering backends or two different JavaScript languages. Both environments use V8, potentially different versions. A direct stock Three.js WebGPU versus native WebGPU comparison is outside this suite.

HTML, DOM layout, CSS, and UI compatibility are excluded. There are no HTML test files. The native runner imports JavaScript directly and never loads a page. The browser runner opens an empty local document only to execute the shared JavaScript modules; browser startup and this document setup are outside all measurements.

| Test | Fixed workload | What it probes |
| --- | --- | --- |
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

For a nonstandard addon location, set `THREEBROWSER_RUNTIME_ADDON` to the absolute `.node` path. Scripts work from any checkout location; the example paths are not required.

For quick checks or longer runs:

```powershell
$env:WARMUP = '30'
$env:SAMPLES = '120'
$env:REPEATS = '3'
$env:TESTS = 'typed-array,scene-transforms' # Omit for all six
node browser.mjs results/browser-cpu.json
node native.mjs results/runtime-cpu.json
node compare.mjs results/browser-cpu.json results/runtime-cpu.json
Remove-Item Env:TESTS
```

## Method and interpretation

Defaults are 30 unmeasured warm-up iterations, 120 samples, and three repeats per workload. Rendering uses fixed 512×512 RGBA8 targets, no MSAA, pixel ratio 1, basic unlit materials, and no external assets. Each render sample includes a full 1 MiB synchronous target readback, so it measures completed render-and-readback latency, including synchronization and transfer overhead. It is neither pure GPU time nor on-screen FPS. The native runner explicitly flushes its command buffer before readback.

Initialization, object creation, validation, and disposal are outside the timed interval. Texture filling and instance-matrix writes are inside it. Startup, shader compilation, input latency, WebGPU compute, memory peaks, and presentation pacing need separate experiments.

Raw samples, per-repeat median/p95/mean, configuration, browser GPU string, CPU/OS, Three.js revision, and native Git revision/dirty state are saved to JSON. The comparison uses the median of each repeat's median; a browser/runtime ratio greater than one means lower native latency. Reports must have identical configuration and workload versions. Results are ignored by Git by default.

The browser server enables cross-origin isolation for finer timer precision. Tiny CPU timings still need longer runs and multiple independent process launches. Keep the browser foreground, use AC power, close other GPU workloads, keep drivers/power settings stable, and verify both renderers use the same GPU. Alternate browser-first and runtime-first order across independent runs. Do not infer statistical significance from a single pair of runs or average all workloads into a universal score.

Correctness checks validate CPU outputs, expected grid coverage, full-plane coverage, and the final texture's changing color. Invalid cases retain diagnostic timing samples but receive no comparison ratio. These checks catch obvious missing/stale rendering; they are not full image equivalence tests. Inspect raw reports before sharing claims. A dirty runtime checkout or a binary built from different sources weakens reproducibility; rebuild from a clean recorded revision for publishable results.

## Validation on the development machine

On 2026-09-10, all three harness tests passed, and all six workloads ran with 30 warm-ups × 120 samples × three repeats on Edge 152, Windows, a Ryzen 7 9800X3D, and an RTX 5080 reported by the browser. All browser correctness checks passed. Both native CPU checks passed.

The available native build failed rendering checks: grid coverage was incorrect for separate meshes and instances, texture readback returned white instead of the uploaded color, and full-plane coverage varied between repeats. Therefore no native rendering speed claims are valid from this run. The native source checkout was dirty at revision `50fd83879315be5188f4003621e45c2c241552ec`; this finding describes the available local build, not every runtime release. Runtime fixes are deliberately outside this standalone benchmark repository.

Local diagnostic reports are in `results/browser.json` and `results/runtime.json` after a run. These files are generated, not distributed as reproducible reference scores.
