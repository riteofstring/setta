# Features in motion

These demonstrations expand the [chronological feature history](feature-history.md).
They accompany the [overview film](film.md), with time to follow an action through
to its result. The [coverage index](coverage.md) maps the full feature inventory to
recordings, real app images and explanations. The clips are silent; the steps
below describe the visible actions and measured outcomes.

| Demonstration     | Watch                                                         | What the recording establishes                                                                                    |
| ----------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Python Canvas     | [18 seconds](https://setta.dev/history/#programming-apps)     | Change a model parameter, execute it and inspect measured results and generated Python.                           |
| Realtime          | [20 seconds](https://setta.dev/history/#programming-apps)     | Edit a drawing and its recipe, then inspect actual branch and joined outputs.                                     |
| Project assistant | [18 seconds](https://setta.dev/history/#agents)               | Request a configurable trainer, inspect real tool checks and adjust generated controls.                           |
| Experiment Lens   | [49 seconds](https://setta.dev/history/#experiment-lens-demo) | A shared selection survives filtering, joins trajectories to a thermal artifact, and exports with its annotation. |
| Review            | [30 seconds](https://setta.dev/history/#review-demo)          | A qualified claim and an image-specific request for changes become durable human responses.                       |
| Bench             | [38 seconds](https://setta.dev/history/#bench-demo)           | Two candidates execute against ten cases each; their generated images support a saved preference.                 |
| RunPlan           | [23 seconds](https://setta.dev/history/#runplan-demo)         | A three-by-two parameter grid produces six successful detached runs while the live parameters stay unchanged.     |

## Python Canvas: change the model, then execute it

[![Python controls beside generated code and the learned decision boundary.](../../images/history/python-canvas.png)](https://setta.dev/history/#programming-apps)

Model Workshop composes Python callables into an executable program. The original
example generates a two-moons classification problem, builds polynomial features,
and fits a classifier. Increasing degree from 1 to 3 changes the learned boundary:
held-out accuracy rises from 83.3% to 94.2%, training accuracy from 86.8% to 97.9%,
and held-out mistakes fall from 20 to 7 of 120. These are the actual terminal
results of this synthetic example, not a benchmark claim.

The recording also inspects the protected generated block inside the authored
Python file. Visual configuration supplies constructor calls while the surrounding
program owns its computation. Python Canvas's runtime belonged to this historical
application; the current React library does not include it.

## Realtime: one drawing, two treatments, one joined result

[![The final Signal Bloom poster combines Aurora and Riso treatments.](../../images/history/realtime-signal-bloom.png)](https://setta.dev/history/#programming-apps)

Move a triangle in the original Signal Bloom drawing. A preparation handler feeds
independent Aurora and Riso treatments, then a join produces the poster from the
same input lineage. The recording follows the real updated outputs and inspects
the running Python recipe. Editing the footer position and applying it produces
the revised poster; the original app source and retained fixture remain intact.

The wide graph leaves clear corridors between sections. Realtime's revision checks,
latest-input scheduling, retained last output and cooperative cancellation are
explained from source; this clip does not pretend to exercise every race condition.

## Agents: ask for a configurable training program

[![The AI-written PyTorch trainer beside its generated controls.](../../images/history/ai-training.png)](https://setta.dev/history/#agents)

The March workbench receives a high-level request to write a small PyTorch image
classifier and make its training configurable. The OpenCode integration writes a
real Python file; Watch Code discovers its typed function and generates epochs,
batch size, learning rate and seed controls. Corrective conversation turns fix
imports and validation. The completed help and dry-run commands execute in the
historical workspace. No code or successful tool output is inserted for the model.

The exact generated file is also checked in Runpod's existing PyTorch 2.8.0+cu128
environment: two training epochs produce a finite 2,410-parameter model and a
three-image, ten-class output. This separate check establishes that the generated
program runs. It is not presented as training inside the March workspace, whose
environment does not include PyTorch. Model output uses local Qwen3-30B-A3B;
this is a restored integration, not a claim about an original 2026 model response.

## Connected context: recommend the next experiment

[Watch the note-to-chat connection](https://setta.dev/history/#agents).

A high-level request asks which learning rate to investigate next and what evidence
is missing. The prompt does not repeat the measurements: the March workbench
supplies them through a native incoming read-only note connection. The real model
response identifies the tied minimum training loss of 0.007273 at 0.3 and 0.6,
then calls for unseen validation data. The note, chat and straight connection
remain visible together.

The native read-only notice is accurate: the chat can read the linked evidence
but cannot edit a section. The quoted values establish that the connected note
was supplied. No successful response was painted into the interface.

## Workflows: wait for two independent reviews

[![Start, two review chats, an AND gate and End with clear connections.](../../images/history/setta-model-workbench.png)](https://setta.dev/history/#agents)

The May workbench starts two genuine model reviews of measured training results.
One suggests the next experiment; the other identifies missing validation evidence.
The AND gate reaches 2/2 only after both complete, then the workflow reaches End.
A dedicated view puts Start, the two chats, the gate and End in separate columns.

The web edit joins the beginning and completed result of the same run, at original
speed. It removes a waiting interval and a native page refresh needed to display
this historical revision's completed messages. The measured rates and losses are
explicit input to both workflow prompts. This clip demonstrates orchestration;
it does not establish that these chats read an independently connected note.

## Window Spaces: return to the evidence

[Watch the saved arrangement return](https://setta.dev/history/#app-mode).

Open the saved Evidence and decisions Window Space. The actual loss curves and
prepared research note return in two separate floating windows, with their saved
positions and sizes. The underlying canvas sections are hidden in this named view,
so unrelated cards and edges do not compete with the restored windows. The note
summarizes measured training losses and explicitly calls for unseen validation data.

## Experiment Lens: keep an investigation together

[![Two battery-cell trajectories compared beside the retained selection and thermal evidence.](../../images/history/experiment-lens.png)](https://setta.dev/history/#experiment-lens-demo)

The original simulated battery study contains 864 observations across 24 cells.
Select cell 22 at cycle 900, then exclude LCO chemistry: the visible cohort drops
to 576 observations, but the selected observation remains in the basket with an
outside-cohort indicator. Select cell 11, click its trajectory at cycle 300, then
advance the linked gallery to cycle 475.

A follow-up annotation asks to recheck the accelerated capacity loss at that
checkpoint. Include the exact thermal artifact, compare the two trajectories,
and export the selection. The downloaded packet contains both observations,
the thermal artifact and its annotation; the saved selection also survives reload.
These are simulated measurements opened for analysis. Experiment Lens does not
launch the experiments that produced them.

## Review: make the decision traceable

[![Aperture poster with an underlined subtitle and a submitted changes-requested response.](../../images/history/review.png)](https://setta.dev/history/#review-demo)

The checkout example contains conflicting imported assessments of the claim
“No database migration is required.” Inspect its Git evidence, then qualify the
claim: “Confirm the audit sink is schemaless before rollout.” That decision
leaves the other four claims unresolved; it does not approve the whole completion.

In the poster comparison, inspect C · Aperture beside its review request, underline the
red subtitle and request more contrast. Submitting the response moves the request
from Current to Old. The saved response identifies the exact image and retains
the normalized drawing with the requested change. The requests, posters and model
assessments are original fictional fixtures. No new model inference is shown.

## Bench: compare actual candidate outputs

[![Contain and Cover thumbnails with a saved preference for Cover and its rationale.](../../images/history/bench.png)](https://setta.dev/history/#bench-demo)

Launch the original product-thumbnail comparison. Contain and Cover each run on
the same ten generated catalog images, yielding twenty case results and twenty
new image artifacts. Both candidates pass the shared checks. Browse the outputs
in Compare, choose Cover and save: “Cover makes the product larger in the square
preview.” The preference and note persist after reload.

Unlike Experiment Lens, Bench executes the candidate commands. Its recorded
measurements describe this small local example, not a general performance ranking.

## RunPlan: vary a snapshot without changing the project

[![RunPlan code, unchanged live parameters, six successful terminal results and their training losses.](../../images/history/runplan.png)](https://setta.dev/history/#runplan-demo)

The May 2026 workbench runs a prepared numerical experiment through the original
Python `SettaRunner` and `RunPlan` APIs. `grid_params` combines three learning
rates with two random seeds. Each `run_detached` invocation gets a separate
snapshot, run identifier, tags, status and log. The demonstration spaces launches
to keep this revision’s second-resolution snapshot filenames distinct.

The experiment fits a line to 81 synthetic samples with 40 gradient steps.
The results below come from the six runs' actual standard output. The helper
writes a CSV and displays those results in a native text section.

| Learning rate | Seed 1 training MSE | Seed 2 training MSE |
| ------------- | ------------------: | ------------------: |
| 0.03          |            0.916159 |            0.289905 |
| 0.1           |            0.017871 |            0.006457 |
| 0.3           |            0.001202 |            0.001202 |

All six runs exit successfully. Reading the project state afterward confirms
that its live learning rate remains `0.1` and its seed remains `1`. Training
loss measures fit on these samples; it does not establish generalization.
The restored editor displays three analysis diagnostics for the SDK/helper
imports and inferred type, while execution completes successfully.

This January 2026 API was a new design after the old sweep cards were removed
in June 2025. The clip demonstrates a grid, not RunPlan's random, zipped or
repeated plans.

## Sources and coverage

Bench uses [September 13 source](https://github.com/riteofstring/setta/tree/674bbd18ad04c6878c128784920dd0ac08263dd1/apps/bench).
Experiment Lens and Review use [October 11 source](https://github.com/riteofstring/setta/tree/74837d35da5cb21bdff2ebc1ebaab0cbb77d5ceb/apps).
RunPlan uses the [May 10 workbench](https://github.com/riteofstring/setta/tree/eea7fb38c8fdb452766d06b08610248e2962c4fc).
These applications and the Python runner are preserved historical software;
they are not bundled services in today's React library.

The [image provenance](images.md#focused-feature-demonstrations) records the
restoration and media sources. The overview and promo use the same accepted replacement recordings. The
[source history](feature-history.md) remains the authority for unfilmed modes
and integrations; the [coverage index](coverage.md) makes those limits explicit.
