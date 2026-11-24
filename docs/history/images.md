# Image provenance

[Documentation](../README.md) / [History](README.md)

The [illustrated timeline](tour.md) combines original example previews, original library-era application
screenshots, and captures of restored applications made in November 2026. Restoration captures
show the named source checkpoints with demonstration data, not original release-day screenshots.
Runtime restoration can include dependency, connection and provider adaptations. The
implementation tables identify feature history independently of these captures.

**On this page**

- [Expanded visual tour](#expanded-visual-tour)
- [Summer 2026 restoration captures](#summer-2026-restoration-captures)
- [Focused feature demonstrations](#focused-feature-demonstrations)
- [Earlier restoration captures](#earlier-restoration-captures)
- [Library-era application screenshots](#library-era-application-screenshots)
- [Current example](#current-example)
- [Original example screenshots](#original-example-screenshots)
- [November 24 feature captures](#november-24-feature-captures)
- [Live callback and front panel](#live-callback-and-front-panel)
- [Side-pane Git history](#side-pane-git-history)
- [Parameter inspector](#parameter-inspector)
- [Pane evolution additions](#pane-evolution-additions)

## Expanded visual tour

These six captures use new demonstration projects, assembled in the restored applications
on November 19, 2026. The interfaces are application renders, not mockups; computed images,
curves and model responses are real outputs.

| Image                                                                         | Source checkpoint                                                                                               | What it shows                                                                                                                                                                 |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Cluster lab](../../images/history/runcoder-experiments.png)                  | [January 2024 workbench](https://github.com/riteofstring/setta/commit/898e0b615d4a982358699733713901a3080bb8f1) | Shared parameters, scikit-learn callable controls, saved seed variants and a feature-count sweep. This is a configured experiment, not evidence of completed sweep execution. |
| [Julia studio](../../images/history/setta-image-lab.png)                      | [November 2024 Setta](https://github.com/riteofstring/setta/commit/6ad993c8524aff5923286989f02cd1f8aa92c492)    | An interactive Python task computes three 640 × 640 Julia-set studies and an escape-time distribution, using NumPy and Pillow.                                                |
| [Training review](../../images/history/setta-model-workbench.png)             | [May 2026 Setta](https://github.com/riteofstring/setta/commit/eea7fb38c8fdb452766d06b08610248e2962c4fc)         | Two chat reviews in an executed Start–AND–End workflow. Both responses completed and the gate received both inputs.                                                           |
| [Regression lab — Analyze](../../images/history/setta-research-workbench.png) | [May 2026 Setta](https://github.com/riteofstring/setta/commit/eea7fb38c8fdb452766d06b08610248e2962c4fc)         | Native code, chart, spreadsheet and file-browser sections, populated with a real six-rate numerical experiment.                                                               |
| [Regression lab — Plan](../../images/history/setta-project-operations.png)    | [May 2026 Setta](https://github.com/riteofstring/setta/commit/eea7fb38c8fdb452766d06b08610248e2962c4fc)         | Another saved view of the same project: a native Kanban board, research notes and the same convergence chart. Validation and further experiments remain planned tasks.        |

The May 2026 demonstrations use 81 synthetic samples, 40 gradient-descent steps and six
learning rates. A separate Python calculation produced the CSV and curves; these were
imported into the application's native displays. The captures do not demonstrate SettaRunner
or detached-job execution. At the displayed precision, rates 0.3 and 0.6 both reach a training
MSE of 0.007273; no validation set was used.

The current Training review image was recaptured on November 24 with **Qwen3-30B-A3B, Q4_K_M**, served locally on a temporary GPU through the application's OpenAI-compatible provider connection. Its five workflow sections occupy separate columns with clear branching and joining routes. Native view controls hide the unrelated evidence sections and access links for this workflow view. The measured results were included explicitly in both workflow prompts. The canvas also has section-context links, but this capture does
not establish that those links alone supplied the evidence. The responses reproduce neither
an original provider's answers nor its performance.

Two small frontend repairs were needed in the May build: a missing Lodash import in the
chat layout, and an explicit Blob download mode for the spreadsheet's binary-file request.
The retained dependencies were used to rebuild it. These repairs restore the existing widgets;
they do not add the demonstrated workflow, chart, spreadsheet or task-board features.

## Summer 2026 restoration captures

The original frames were extracted on November 23, 2026 from retained cloud
recordings of the July 11 Setta 3 and August 2 Setta 4 builds. The PNGs preserve
the recorded pixels at the crops below. The webpage uses 1800 × 1013 WebP
derivatives. Frame times refer to the original source recordings.

| Image                                                                     | Source checkpoint                                                                                       | Recorded frame and evidence                                                                                                                                                                                   |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Scrolling workspace](../../images/history/setta3-workspace.png)          | [July 11 Setta 3](https://github.com/riteofstring/setta/tree/6258039962ac90a9e5fd44c141c50ce48843b209)  | `r12-01-niri-workspace-take02.mp4` at 0.3 s; crop x/y/w/h [0, 0, 2560, 1440]. Agent chat, passing tests and task status in the scrolling pane workspace. Actual local-model work in a prepared project.       |
| [Easy Button](../../images/history/setta3-easy-button.png)                | [July 11 Setta 3](https://github.com/riteofstring/setta/tree/6258039962ac90a9e5fd44c141c50ce48843b209)  | `r12-04-easy-button-run.mp4` at 5 s; crop x/y/w/h [208, 150, 2144, 1206]. A submitted request and the active run. Completion of this request is not established.                                              |
| [Semantic research graph](../../images/history/setta3-semantic-graph.png) | [July 11 Setta 3](https://github.com/riteofstring/setta/tree/6258039962ac90a9e5fd44c141c50ce48843b209)  | `r14-setta3-semantic-graph-take02.mp4`, final poster; full 2560 × 1440 frame. Authored nodes, typed edges and file evidence. The experiment results are synthetic; automatic cartography is not demonstrated. |
| [Workflow draft](../../images/history/setta3-workflow.png)                | [July 11 Setta 3](https://github.com/riteofstring/setta/tree/6258039962ac90a9e5fd44c141c50ce48843b209)  | `r12-03-workflow-editor.mp4` at 6.5 s; crop x/y/w/h [0, 108, 2368, 1332]. Native node editing and successful draft validation. The prepared workflow was not executed.                                        |
| [Structured report](../../images/history/setta4-report.png)               | [August 2 Setta 4](https://github.com/riteofstring/setta/tree/bd5cd3d0898d5ced1961532034e3b9284fa3146b) | `r12-06-artifact-report.mp4` at 4.5 s; crop x/y/w/h [328, 258, 1888, 1062]. The original Weekly platform review artifact. Built-in example metrics, a table and a chart.                                      |

Setta 3 uses its native web client and Go backend. Its Codex integration runs
local **Qwen3-30B-A3B Q4_K_M**, served by llama.cpp, in place of the original
provider. The prepared Food-101 project contains synthetic experiment results
and a real sorting bug that the model fixed. The workspace transcript and
terminal output are actual recorded work. The recorded Easy Button request remained active until the backend was restarted.

The semantic graph was reframed on November 24 through native node-position and label operations. The replacement preserves all seven original summaries, seven edges and their evidence, while showing every node and route inside the frame. The graph was authored through the native API: seven nodes, seven
typed edges and three file-evidence links. The cartographer did not produce
an accepted patch. The separate workflow draft passed native validation but
was not executed. Its prepared sequence is Start → Compare experiments → Plan
the next run → Ready.

Setta 4 runs in the restored Electron desktop. The graph uses the original
replay harness and its native 2.5× fixture clock. The report uses the original
artifact catalog. The live Director did not dispatch work successfully with
the substitute model, so neither demonstration establishes live orchestration
or an agent-authored artifact. No historical UI or model response was fabricated.

The complete source takes and restoration inputs remain in the retained
capture collection and cloud disks.

## Focused feature demonstrations

Four native application screenshots accompany the [feature demonstrations](feature-demos.md).
They were captured on November 23, 2026 at 3200 × 1800, without cropping or
reconstructed interface elements. The webpage uses 1920 × 1080 WebP derivatives.

| Image                 | Historical source                                        | Visible evidence                                                                                                             |
| --------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `experiment-lens.png` | `74837d35da5cb21bdff2ebc1ebaab0cbb77d5ceb`, October 11   | Original simulated battery study, two-cell comparison, a retained outside-cohort observation and annotated thermal evidence. |
| `review.png`          | `74837d35da5cb21bdff2ebc1ebaab0cbb77d5ceb`, October 11   | Original fictional Aperture poster, newly drawn underline and final changes-requested response in Old.                       |
| `bench.png`           | `674bbd18ad04c6878c128784920dd0ac08263dd1`, September 13 | Original ten-image catalog; newly executed Contain/Cover outputs and saved Cover preference.                                 |
| `runplan.png`         | `eea7fb38c8fdb452766d06b08610248e2962c4fc`, May 10       | Prepared regression experiment; six real detached runs, actual training losses and unchanged live parameters.                |

Historical builds and Python execution ran on OVH; a dedicated Runpod Chrome
browser rendered and recorded the applications. The workstation transferred and
encoded media. Original source revisions and frozen dependency graphs were
retained. The three library applications used their original preparation tools;
RunPlan used a new small experiment and helper that read actual run logs.
The May editor's three analysis diagnostics remain visible; the six runs succeed.
Review's imported model assessments are fixture data, not fresh inference.

Raw takes, JPEG frames, timestamps, final application state and the Lens selection
packet remain in the capture collection's `setta-retrospective/footage/gap/` retention
set. `CAPTURE-REVISION13.md` and `plans/revision13/feature-demos.json` in that
collection record runtime limits, capture repairs and exact edit decisions.

## Earlier restoration captures

The following images remain available in the feature histories.

| Image                                                                      | Restored build                                                                                                     | What it shows                                                                                                                                         |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Nested forms](../../images/history/abcde-nested-forms.png)                | [November 2020 frontend](https://github.com/riteofstring/setta/commit/cf95643cd5a6c9a7fe67736db07815fecc1addcc)    | Compose and ColorJitter controls with nested arguments. Execution is not demonstrated.                                                                |
| [Early canvas](../../images/history/iovuu-workspace.png)                   | [June 2022 frontend](https://github.com/riteofstring/setta/commit/a0c694437b8cb938b2cfe9aa8c969ef48b6b8364)        | Revision-nine minimap take at 3.5 seconds: canvas navigation and configured dataset sections.                                                         |
| [Interactive Python](../../images/history/runcoder-interactive-python.png) | [January 2024 application](https://github.com/riteofstring/setta/commit/898e0b615d4a982358699733713901a3080bb8f1)  | A global parameter and the calculated chart from interactive Python.                                                                                  |
| [Setta configuration](../../images/history/setta-configuration.png)        | [November 2024 application](https://github.com/riteofstring/setta/commit/6ad993c8524aff5923286989f02cd1f8aa92c492) | GUI values after a YAML edit: `c = 3`, `n = 64`. The editor itself is outside this frame.                                                             |
| [Connected chats](../../images/history/setta-connected-chats.png)          | [March 2026 application](https://github.com/riteofstring/setta/commit/c88c01bf751b0417dbc03ad29bc8168befa05ca4)    | A new six-run demonstration table connected to two chats. A substitute local model produced the displayed responses through the restored application. |
| [Saved view](../../images/history/setta-saved-view.png)                    | [March 2026 application](https://github.com/riteofstring/setta/commit/c88c01bf751b0417dbc03ad29bc8168befa05ca4)    | A new listener demonstration in the Operate view: a gain control and its live computed result.                                                        |

The earlier connected-chats screenshot's “CONTEXT UNAVAILABLE” indicator concerns provider context-usage
reporting. The connected table was supplied to the model; the displayed answer identifies
the lowest-loss row. This restoration does not claim to reproduce the original provider's
answers or performance.

The build links resolve to rewritten commits in this repository. They identify the source
checkpoint, not a self-contained restoration environment. Full capture projects, restoration
patches and recordings are retained separately in private preservation archives.

## Library-era application screenshots

These PNGs show October 2026 applications built around the extracted library,
not the earlier Python workbench. Print studio, Photo playground and Gaussian
splat studio preserve their original screenshots unchanged. Photo reconstruction
and the duck workspace were recaptured on November 23 at 2880 × 2000 from their
exact website checkpoints, replacing small social-preview images. Their
application-specific algorithms are separate from Setta's workspace and
browser-worker coordination.

| Image                                                                 | Capture source                                                                                                                      | Application implementation                                                                                                          | What it shows                                                                                                                                            |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Print studio](../../images/history/print-studio.png)                 | [Setta screenshot](https://github.com/riteofstring/setta/blob/74837d35da5cb21bdff2ebc1ebaab0cbb77d5ceb/images/print-studio.png)     | [Browser print studio](https://github.com/riteofstring/setta-site/tree/7051440aba168e8cc34a2572f5c6ebe7b8b38722/src/studio)         | A drawing, three print treatments and a finished poster. Application SVG rendering and export use Setta's browser pipeline.                              |
| [Photo playground](../../images/history/photo-playground.png)         | [Setta screenshot](https://github.com/riteofstring/setta/blob/6422916e00af57931ed3356165ed69256331e298/images/photo-playground.png) | [Depth-particle playground](https://github.com/riteofstring/setta-site/tree/682754a1894b9f03989a441b30849999b66dc24f/src/studio)    | The fox example, prepared depth and a particle scene. The screenshot uses a saved depth map; the application also supports model-based depth estimation. |
| [Gaussian splat studio](../../images/history/splat-playground.png)    | [Setta screenshot](https://github.com/riteofstring/setta/blob/81c02e5d7eea903167f3723aa89bbdb0bc5ea35a/images/splat-playground.png) | [Splat studio](https://github.com/riteofstring/setta-site/tree/f2802703613b0092037ab2e375e7d7d1e82f3439/src/studio)                 | Houseplant, its opacity distribution and inspection controls, with Textile ball also available. These are real multi-view captures.                      |
| [Photo reconstruction](../../images/history/photo-reconstruction.png) | [Recaptured website checkpoint](https://github.com/riteofstring/setta-site/tree/a34ee19de4f39aa19e9e65f83bd5bb8f0ea13270)           | [Selection and reconstruction](https://github.com/riteofstring/setta-site/tree/c55310fa8befe0265cf8334d41a11a1c48bdbe17/src/studio) | A robot photo, prepared cutout, radiance-field slice, extracted Gaussians and a final scene. The displayed reconstruction is a saved generated example.  |
| [3D sketchbook](../../images/history/sketchbook.png)                  | [Recaptured website checkpoint](https://github.com/riteofstring/setta-site/tree/d304f5dd9b6edf9c113dd4db807dd5bae03725bf)           | [Native splat workspace](https://github.com/riteofstring/setta-site/tree/d304f5dd9b6edf9c113dd4db807dd5bae03725bf/src)              | Disperse, Vortex and Ripple meta controls linked to the duck scene's individual parameters. The duck is a generated example.                             |

The two replacement PNGs use a 1440 × 1000 CSS viewport at device pixel ratio 2;
they are native screenshots with no upscaling or image retouching. Application
code, styles, public assets, locks and compiled Setta dependencies match the
linked checkpoints. The robot uses its initial native workspace and original
72 × 30 CSS-pixel logo. For the duck, native Delete section actions remove the
unrelated welcome and reconstruction panels; a native drag moves the meta
controls beside the scene, followed by Fit view. Both remaining connections
are fully visible. Neither capture runs model inference.

The prior [robot social card](https://github.com/riteofstring/setta-site/blob/a34ee19de4f39aa19e9e65f83bd5bb8f0ea13270/public/social-card.png)
and [duck social card](https://github.com/riteofstring/setta-site/blob/d304f5dd9b6edf9c113dd4db807dd5bae03725bf/public/social-card.png)
remain preserved at their immutable source revisions. The duck was previously
linked to `04db4d1`, which inherited the stale social card but implemented the
later drawing-based sketchbook. This image demonstrates the splat workspace at
`d304f5d`, not the later outline-to-form application. Capture recipes, native
states and build evidence are retained in the video collection's
`setta-retrospective/footage/gap/r16-site-recaptures/`.

The Houseplant and Textile ball captures and their thumbnails are by **Marcel Padilla**,
from the [Gaussian Splat Objects Dataset](https://marcelpadilla.com/Gaussian_Splat_Object_Dataset/),
licensed [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).
The site preserved them from
[revision c3e5ec0a8ddb3ab26f28a067a29d272fe1a23411](https://github.com/marcelpadilla/splats/tree/c3e5ec0a8ddb3ab26f28a067a29d272fe1a23411).
The screenshot shows the application's normalized rendering of Houseplant; the archived
screenshot itself is unchanged. Houseplant has 113,648 Gaussians and Textile ball has 384,589.

The robot input comes from the MIT-licensed
[TripoSR examples](https://github.com/VAST-AI-Research/TripoSR/tree/107cefdc244c39106fa830359024f6a2f1c78871/examples).
The application used SlimSAM for selection and TripoSR for a radiance-field estimate, then
derived surface Gaussians in its own worker. These single-photo reconstructions are approximate
generated objects, not measured multi-view captures. The screenshot shows the stored robot
example with 30,357 Gaussians; it does not show inference running at capture time.

The Setta documentation and independent website commits have different dates within October.
The source links identify exact preserved material, not a public release day.

## Current example

[The ambient instrument](../../images/instrument.png) is a November 2026 capture of the
independently maintained application at [setta.dev](https://setta.dev), after starting
its default patch. Its musical logic, audio and scenery belong to that application.

These are application captures, not illustrations or interface mockups.

[Illustrated timeline](tour.md) · [Reconstruction methodology](methodology.md)

## Original example screenshots

These eight images show seven original example projects, downloaded unchanged from the GitHub
attachments linked by the [preserved examples README](https://github.com/riteofstring/setta/blob/bb40a0d890c29a43039c52bfb3859a1e6e6ed287/setta-examples/README.md)
and the [Transformers project README](https://github.com/riteofstring/setta/blob/bb40a0d890c29a43039c52bfb3859a1e6e6ed287/setta-examples/transformers_trainer/README.md).
Unlike the restoration captures above, they were already part of the historical project documentation. The source checkpoint identifies where the links
were preserved; it does not establish the date each screenshot was taken.

| Image                                                                                           | Original attachment                                                                       |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [Stream Diffusion Image to Image](../../images/history/stream-diffusion.png)                    | [Source](https://github.com/user-attachments/assets/2a063779-ed61-4103-90a5-bf127f3ea012) |
| [TRL Language Model Finetuning](../../images/history/trl-finetuning.png)                        | [Source](https://github.com/user-attachments/assets/96775341-4b6d-4d3c-8bc2-743eafce458a) |
| [Flux Inpainting](../../images/history/flux-inpainting.png)                                     | [Source](https://github.com/user-attachments/assets/5c0ed2f1-cfa7-46aa-a5ce-6f5d93fa414b) |
| [Groq API Chat](../../images/history/groq-chat.png)                                             | [Source](https://github.com/user-attachments/assets/0d8ff9c1-2557-4549-a816-3c6693430d98) |
| [Transformers Sequence Classification](../../images/history/transformers-training.png)          | [Source](https://github.com/user-attachments/assets/1f6554f8-8d49-4ba8-af48-f5dc6bc5d845) |
| [Transformers expanded developer view](../../images/history/transformers-training-expanded.png) | [Source](https://github.com/user-attachments/assets/3d03506a-6c08-47e5-843e-2b6b87f5eaeb) |
| [PyTorch Metric Learning](../../images/history/metric-learning.png)                             | [Source](https://github.com/user-attachments/assets/45ae2047-9dbd-4057-9191-9a3460357ccc) |
| [SapientML](../../images/history/sapientml.png)                                                 | [Source](https://github.com/user-attachments/assets/d58e648a-47e2-4eda-b9e5-9062494518a4) |

## November 24 feature captures

| Image                                                           | Source and evidence                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Python Canvas](../../images/history/python-canvas.png)         | October 11 source `74837d35da`; original Model Workshop fixture `5344734e39`. Actual degree 3 result after 83.3%→94.2% held-out accuracy. Native controls, generated code and terminal output.                                                                                         |
| [Realtime](../../images/history/realtime-signal-bloom.png)      | Same application source; original Signal Bloom drawing and handlers. Final matching-lineage joined poster after native drawing and recipe edits.                                                                                                                                       |
| [AI trainer](../../images/history/ai-training.png)              | March source `c88c01bf751b0417dbc03ad29bc8168befa05ca4`. Actual Qwen3-30B-A3B output after two corrective turns, native typed controls and generated invocation. CLI help/dry-run passed in the historical workspace; exact source separately passed a Runpod PyTorch execution check. |
| [Connected context](../../images/history/connected-context.png) | Same March source. Real answer reads a six-row note through an incoming read-only edge. Prepared native positions keep both full cards and the route visible.                                                                                                                          |
| [Training output](../../images/history/training-output.png)     | Original January 2025 training_run recording at 28 seconds. Actual step/log/loss output; no completion claim.                                                                                                                                                                          |
| [Image chat](../../images/history/ai-image-chat.png)            | March source `c88c01bf751b0417dbc03ad29bc8168befa05ca4`. Native PNG attachment and actual Qwen3-VL-8B response selecting epoch 5 from an illustrative loss chart. The plotted values and interpretation are not supplied in the text request.                                          |

The May workflow image uses take03 at 36 seconds, cropped 2432×1368 at 64,72.
The same run's web edit removes waiting and a native refresh between its start and
completed model responses. The prompts explicitly include measured training data.
Window Spaces restores a prepared curve-and-note arrangement through the native UI.

The image-chat PNG uses the native x/y/w/h crop [86, 260, 2348, 1068] from the
accepted `image-take02` interaction. The matching 18-second web clip retains source
time 6–24 seconds at 60 fps. The capture uses model files
`Qwen3VL-8B-Instruct-Q8_0.gguf` and its F16 vision projector, from
`Qwen/Qwen3-VL-8B-Instruct-GGUF` revision
`f982a07559d4a2f6c8744d840bf6fccab30eea96`. The app source is unchanged. Source
video, native conversation receipt, illustrative input PNG and model provenance
remain under `footage/gap/r18/ai/` in the retrospective collection.

Python Canvas and Realtime were built and executed on OVH; Chrome ran on Runpod.
Original PNGs, raw takes, generated code, actual terminal results and project state
remain retained. Their [walkthroughs](feature-demos.md) explain the measured outcomes;
the [coverage index](coverage.md) records the limits of each demonstration.

## Live callback and front panel

Both captures use the preserved March 1, 2026 workbench
[`c88c01bf751b0417dbc03ad29bc8168befa05ca4`](https://github.com/riteofstring/setta/tree/c88c01bf751b0417dbc03ad29bc8168befa05ca4),
running on OVH with Chrome recording on Runpod on November 24. The Learning-rate
lab is a new fixture. Its actual SettaListener computes the plotted schedule,
hot-reloads the file-bound callback and responds to the native warmup slider.
No historical application source was changed for these demonstrations.

| Image                                                               | Native framing and evidence                                                                                                                                                                      |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Callback hot reload](../../images/history/callback-hot-reload.png) | `callback-take03.mp4`; crop x/y/w/h [144, 192, 2192, 944]. The final callback contains the cosine expression and the plot visibly curves. The recording starts with the verified straight decay. |
| [Live front panel](../../images/history/live-front-panel.png)       | `front-panel-take02.mp4`; crop [1184, 192, 1152, 944]. Nine-epoch warmup state from the actual 3 → 9 → 3 slider interaction.                                                                     |

These PNGs preserve the native cropped pixels. Raw 2560 × 1440, 60 fps captures,
initial and final fixture code, action plans and listener evidence are retained
under `footage/gap/r18-clarity/native-callback/` in the retrospective collection.
The listener retains the same plot resource and connection across the callback
edit. Matplotlib 3.10.7 and Pillow 11.0.0 were installed in the cloud fixture's
isolated dependency directory; the historical app environment was preserved.

## Side-pane Git history

[Git graph](../../images/history/git-pane-history.png) shows the March 1, 2026
workbench (`c88c01bf751b0417dbc03ad29bc8168befa05ca4`) inspecting an actual prepared
repository. The November 24 capture contains two non-fast-forward merges, an
unmerged augmentation branch and the selected checkpoint commit's Python diff.
The fixture commits are not the Setta repository's own history, and the recording
does not establish training execution or Git mutations through the app.

The PNG is a native frame at 8.5 seconds from
`footage/gap/r18-clarity/native-git/raw/git-graph-take01.mp4`, cropped x/y/w/h
[64, 58, 2432, 966]. The web clip uses source time 0.45–10.05 seconds at native
60 fps, with the graph, commit selection and file diff visible in sequence.
The selected commit is `266544dd438fd5a9369a013b4c5526f3c50a09c3` in the fixture
repository. Raw video, fixture scripts, actual Git history and selected diff are
retained under `native-git/`.

The separate working-tree preview uses `footage/r4-19-git.mp4` at 1.4–6.4 seconds.
The earlier two-commit graph image and combined diff/graph edit remain in the
capture archive.

## Parameter inspector

`images/history/parameter-inspector.png` crops the actual Parameters inspector
and adjacent sliders from `../rite-of-string-videos/setta-retrospective/footage/14-version-panel.png`.
The restored source is November 26, 2024, `36e56a120386407d5cfbe08d4eb0d62acf2a1dcc`;
the crop is x/y/w/h [640, 80, 1856, 1044]. This still establishes the selected
widget types and their configured minimum, maximum and step fields. It does not
demonstrate applying a new setting. The webpage uses an 1800 × 1013 WebP derivative.

## Pane evolution additions

- `feature-early-details.png`: frame 3 of `footage/r3-03-parameter-sweep.mp4`, resized to 1920 × 1080. December 2020 checkpoint `913a721856892e613b577054de598ca3287deaa3`. Selected-callable values and unfinished sweep UI; no execution.
- `early-ui-config.png`: `footage/05-abcde-panels-2021-12-ui-config.png`, cropped [544, 120, 1984, 1116] and resized to 1800 × 1013. December 2021 checkpoint `87eb93d073441364adef298b60abbbc5e4e6d354`. Layout evidence; visible preset buttons are unfinished.
- `generated-code-region.png`: `footage/18-setta-generated-python.png`, cropped [1040, 470, 960, 540] and resized to 1800 × 1013. December 2025 checkpoint `667251f4c6f6a3d42bf116367cc74c8fad13ff66`. Protected generated block inside the canvas code editor; no new surrounding edit is demonstrated.

These PNGs share the website’s inspected WebP framing. Original captures remain in the video collection.

- `contents-editor.png`: `contents-final-02.png`, from the May 30, 2026 build `94dcef790b304b9dc2b456c18dcbd4b45de6988c`, captured on Runpod. Crop [64, 64, 2432, 1368], resized to 1920 × 1080. Actual final state after epochs changes from 12 to 24 in Contents; generated Python reflects the edit.
- `data-port-inspector.png`: `ports-inspector-02.png` from the same build and prepared project. Same crop, resized to 1800 × 1013. Dataset’s native output accessor and one complete connection to Training; no model training is claimed.

Both PNGs use the webpage derivative’s framing. Full-resolution sources, native
project snapshots and screencast frames/timings are retained with the video
collection’s revision-fifteen capture evidence.

[History guide](README.md) · [All documentation](../README.md)

## Follow AI and visible edits

[AI Follow](../../images/history/ai-follow.png) shows the March workbench
(`c88c01bf751b0417dbc03ad29bc8168befa05ca4`) after an actual Qwen3-30B-A3B
response and four configuration edits. The associated recording pans from a
prepared review note to training settings through native Follow AI, with the
application's own edit highlight. Epochs, learning rate, warmup and schedule
change; the response describes those same changes. No training improvement is
claimed.

The native PNG shares the web recording's [86, 360, 2348, 1008] crop. The clip
retains source time 11.5–35 seconds at 60 fps from
`footage/gap/r18/ai/follow-take07.mp4`. Its fixture, conversation, native recording
receipt and exact edit manifest are retained alongside the master. The app
source is unchanged; model inference uses the restored local engine.
