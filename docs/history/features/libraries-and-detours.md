# From workbench to reusable tools

Extraction made the workspace useful beyond the application that had grown around it.
The Setta 2-derived line separated controls, nested sections, editors, graphs, saved views
and windows into a React library. Browser pipelines then made it possible to coordinate
application computations on static hosting.

The examples below show what people could build around those pieces. Their printing,
machine learning, rendering and Python algorithms belong to the applications. Setta
provides the workspace and execution coordination.

## Summer 2026: two agent-workspace experiments

Setta 3 and Setta 4 explored separate agent-centered applications before the
Setta 2-derived library extraction. Their place in the reconstructed chronology
does not make them ancestors of the current package. The following captures
come from restored July 11 and August 2 builds; they distinguish actual
local-model work, prepared examples and built-in demonstrations.

### Setta 3: move through the work

![Agent chat, passing tests and Easy Button status in Setta 3’s scrolling workspace.](../../../images/history/setta3-workspace.png)

**A workspace that keeps moving.** A Niri-inspired strip brought chats,
terminals and other panes into one navigable workspace. Columns could resize,
a pane could maximize, and an overview showed the larger arrangement. This
refers to the interaction model, not an integration with the Niri compositor.
The chat and passing tests shown here come from actual local-model bug-fix work
inside a prepared Food-101 project.

![Setta 3 Easy Button working on a request to run tests and write a status note.](../../../images/history/setta3-easy-button.png)

**One request starts the work.** Easy Button focused the request and active
work into a single surface. This recorded request is in progress; the film
does not claim that it completed. Both captures used local Qwen3-30B-A3B
through the application’s original Codex integration.

### Setta 3: connect evidence and prepare the next step

![A prepared research graph in Setta 3 links a goal, synthetic results, a smoothing decision and the next schedule question.](../../../images/history/setta3-semantic-graph.png)

**Connect the evidence.** Typed relationships connect goals, findings,
decisions and questions. The prepared graph contains seven nodes, seven edges
and three file-evidence links. Its experiment numbers are synthetic example
data. They were authored through the native API; the restored cartographer
did not produce an accepted graph patch.

![Four connected workflow nodes in the Setta 3 editor, with a successful draft-validation message.](../../../images/history/setta3-workflow.png)

**Draw the work before it runs.** Start leads to Compare experiments, Plan the
next run and Ready. The capture shows node editing and successful draft
validation. The draft was not executed. This is Setta 3’s own workflow editor,
separate from the Setta 2 Start/End/Gate canvas system.

_July 11, 2026 source: [6258039962](https://github.com/riteofstring/setta/tree/6258039962ac90a9e5fd44c141c50ce48843b209).
The restoration uses its native web client and Go backend._

### Setta 4: follow workstreams and inspect their artifacts

Setta 4 followed workstreams and their relationships in a Director command
center. Its recorded events, declarations and attributed interpretations were
distinct kinds of evidence. The structured report below shows its artifact UI.

![An example Setta 4 report combines latency and ticket metrics, a table and a bar chart.](../../../images/history/setta4-report.png)

**Give results a useful shape.** The artifact catalog’s Weekly platform review
combines summary metrics, a table and a chart. It is the original built-in
report example, not an agent-authored report from the restored session.
The live Director did not dispatch work successfully with the substitute model.

_August 2, 2026 source: [bd5cd3d089](https://github.com/riteofstring/setta/tree/bd5cd3d0898d5ced1961532034e3b9284fa3146b).
Both demonstrations run in the restored Electron application._

[Exact capture provenance](../images.md#summer-2026-restoration-captures) ·
[Setta 3 source history](../feature-history.md#late-mayjuly-2026-the-setta-3-experiment) ·
[Setta 4 source history](../feature-history.md#late-julyearly-august-2026-the-setta-4-director-experiment)

## October 2026: a sketch becomes a print

![The browser print studio: a flower drawing, ink controls, three treatments and a finished multicolor poster.](../../../images/history/print-studio.png)

**Draw once, explore three treatments.** The print studio turned a stroke into chromatic,
risograph and contour treatments, then composed the selected treatment into a poster.
Ink controls changed the result; SVG and PNG exports took it out of the workspace.

Its [worker](https://github.com/riteofstring/setta-site/blob/7051440aba168e8cc34a2572f5c6ebe7b8b38722/src/studio/print.worker.ts)
used the public browser pipeline API: three treatment stages fed a dependent poster stage.
The drawing, SVG artwork and export code belonged to the independent site.

_Original archived application screenshot. This browser example was separate from the
Python-backed Signal Bloom Press example below._

## October 2026: photographs and captured objects

![A fox photograph, its estimated depth and an interactive particle scene beside native workspace controls.](../../../images/history/photo-playground.png)

**Step into a photograph.** The photo playground combined a picture and depth map into
colored particles. Depth, scatter, motion, size and slicing controls changed the scene
without rerunning the model. The application supplied
[depth estimation and particle construction](https://github.com/riteofstring/setta-site/blob/682754a1894b9f03989a441b30849999b66dc24f/src/studio/depth.worker.ts);
Setta coordinated the worker stages and presented the controls.

_Original archived screenshot using the prepared fox example and its saved depth map.
The interface also supported estimating depth for a new photo._

![The Gaussian splat studio displays a captured houseplant, its opacity distribution and inspection controls.](../../../images/history/splat-playground.png)

**Inspect a capture from the inside.** The Gaussian splat studio opened real captured
objects, measured their contents, and let users orbit, inspect individual Gaussians,
cut cross-sections and export the visible selection. Its
[worker pipeline](https://github.com/riteofstring/setta-site/blob/f2802703613b0092037ab2e375e7d7d1e82f3439/src/studio/splat.worker.ts)
read, decoded, measured and packed the data; Spark and Three.js supplied the rendering.

_Original archived screenshot. Houseplant contains 113,648 Gaussians and is a multi-view
capture by [Marcel Padilla](https://marcelpadilla.com/Gaussian_Splat_Object_Dataset/),
licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). It is distinct from
the generated single-photo examples that followed._

## October 2026: make the processing visible

![A robot photo progresses through cutout preparation, a radiance-field slice, extracted Gaussians and a final editable scene.](../../../images/history/photo-reconstruction.png)

**See every step from a photo to a 3D object.** The later playground added object
selection, cutout refinement, a radiance-field viewer and Gaussian extraction.
Users could scrub through the field, change the extraction threshold and adjust
sampling without rerunning the reconstruction model. A pipeline panel exposed stage
progress beside the intermediate results.

The [application](https://github.com/riteofstring/setta-site/tree/c55310fa8befe0265cf8334d41a11a1c48bdbe17/src/studio)
used SlimSAM for selection and TripoSR for reconstruction in the browser. TripoSR
predicted a radiance field; application code placed Gaussians on its estimated surface.
Unseen surfaces were guesses, so this was an approximate single-image reconstruction,
not a measured multi-view capture. The screenshot shows a saved generated example.

![The 3D sketchbook connects Disperse, Vortex and Ripple rotary controls to a duck scene and its individual parameters.](../../../images/history/sketchbook.png)

**One knob, several related changes.** The 3D sketchbook made those relationships
visible. Disperse linked spread and splat size; Vortex linked twist and hue;
Ripple linked wave amplitude and saturation. The native meta controls and individual
parameters operated on the same application state. The scene could be reshaped,
recolored, animated and exported.

_Original archived application screenshots. Exact source checkpoints and asset credits
are recorded in [image provenance](../images.md#library-era-application-screenshots)._

## Five local applications around the library

The same retained line also explored focused local tools. Their source is preserved
before the example applications and Python runtime were removed in October 2026.

| Application     | What made it interesting                                                                                                                                                                                                                                          | Preserved source                                                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Python Canvas   | Compose real scikit-learn objects into a classifier. Changing polynomial degree from 1 to 3 changes the learned decision boundary; the model workshop plots mistakes on held-out samples and can download the generated Python.                                   | [Model workshop](https://github.com/riteofstring/setta/blob/5344734e39ae8eb8fbd0f2253c8271a8388d7644/apps/python-canvas/README.md)    |
| Realtime        | Signal Bloom Press turns a drawing into a shared ink plate, runs SVG and Pillow treatments in separate branches, then joins their results into a poster. Python handlers power this example.                                                                      | [Drawing playground](https://github.com/riteofstring/setta/blob/74837d35da5cb21bdff2ebc1ebaab0cbb77d5ceb/apps/realtime/README.md)     |
| Review          | Claims and choices stay connected to exact Git hunks, source lines, JSON values and artifacts. A poster comparison supports drawings anchored to the reviewed image, then records a portable human response.                                                      | [Review](https://github.com/riteofstring/setta/blob/74837d35da5cb21bdff2ebc1ebaab0cbb77d5ceb/apps/review/README.md)                   |
| Experiment Lens | Shared selections connect scatterplots, histograms, heatmaps, parallel coordinates, tables, trajectories and artifact galleries. A simulated battery study contains 864 observations across 24 cells; selected evidence and annotations can be exported together. | [Experiment Lens](https://github.com/riteofstring/setta/blob/74837d35da5cb21bdff2ebc1ebaab0cbb77d5ceb/apps/experiment-lens/README.md) |
| Bench           | Run competing candidates against the same case set, inspect their artifacts and shared checks, then save a human preference. The product-thumbnail example compares contain and cover strategies across ten generated catalog images.                             | [Bench](https://github.com/riteofstring/setta/blob/674bbd18ad04c6878c128784920dd0ac08263dd1/apps/bench/README.md)                     |

Review recorded decisions without running agents. Experiment Lens explored already-recorded
results without launching experiments. Bench executed local candidate commands and kept their
outputs beside evaluations and human reviews. The model workshop's small synthetic dataset illustrated
composition and generalization; its accuracy was not a claim about real-world performance.

The [focused demonstrations](../feature-demos.md) follow three of these tools
through a saved result: an annotated Experiment Lens export, a qualified Review
claim and poster response, and a Bench preference backed by twenty actual case
executions. Their stills and step-by-step descriptions distinguish imported
fixtures from newly computed outputs.

## The current library

[![The ambient instrument uses Setta controls and panels around an application-owned audio engine.](../../../images/instrument.png)](https://setta.dev)

The current package keeps the reusable interactions: typed controls, nested sections,
saved views, windows, graph presentation, navigation and optional structural history.
[Browser pipelines](../../../packages/workspace/BROWSER.md) coordinate dependent stages
with progress, latest-input queuing, cancellation and recovery. A consuming application
supplies its data, algorithms and persistence.

The independently maintained instrument at [setta.dev](https://setta.dev) supplies its
musical rules, audio engine and scenery. Its workspace and worker coordination use Setta.

## Implementation landmarks

These are preserved implementation landmarks, not a release calendar.

| Month   | Preserved work                                                                 | Source                                                                                                                                                                                              |
| ------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08 | Workspace package extraction starts on the Setta 2-derived line.               | [Change](https://github.com/riteofstring/setta/commit/57f92584bff7f31b18ed1e829ea4b02b69fadfd8)                                                                                                     |
| 2026-10 | Python Canvas gains the composition model workshop.                            | [Change](https://github.com/riteofstring/setta/commit/5344734e39ae8eb8fbd0f2253c8271a8388d7644)                                                                                                     |
| 2026-10 | React and browser-worker APIs become reusable package entry points.            | [Change](https://github.com/riteofstring/setta/commit/74837d35da5cb21bdff2ebc1ebaab0cbb77d5ceb)                                                                                                     |
| 2026-10 | Browser pipelines expose progress by stage.                                    | [Change](https://github.com/riteofstring/setta/commit/e003c84df188b0dcc154e33c14f718c1cd39756e)                                                                                                     |
| 2026-10 | The Python runtime and example applications are removed from the library line. | [Change](https://github.com/riteofstring/setta/commit/4919cb096ebbcd861619e54bd0330b09b47088ff)                                                                                                     |
| 2026-11 | The unused local Go backend is removed.                                        | [Change](https://github.com/riteofstring/setta/commit/2866560207b0c2926136748fce42322f3a43aebf)                                                                                                     |
| 2026-11 | Hosts can define graph port families and record their own undoable operations. | [Ports](https://github.com/riteofstring/setta/commit/7ee1c6ba30c890683817345d6f5d84616403f123) · [History](https://github.com/riteofstring/setta/commit/9ed6e5739c901f3386a402c61a763931302a7ba5)   |
| 2026-11 | Graph cables can share bundles and route around workspace sections.            | [Bundles](https://github.com/riteofstring/setta/commit/02a947202a23ee3252982a4fc28cd7c34c91c351) · [Routing](https://github.com/riteofstring/setta/commit/e48fe6bbf822a9cb6b5284dddeb033d9411b1179) |

The summer experiments above are separate directions. Their position in the
reconstructed chain does not make them ancestors of the Setta 2-derived library.

[Historical guide](../README.md) · [Repository composition](../timeline.md)
