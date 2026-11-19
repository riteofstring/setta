# Image provenance

The chronological tour includes captures of restored applications made in November 2026.
They show the named source checkpoints with demonstration data, not original release-day
screenshots. Runtime restoration can include dependency, connection and provider adaptations.
The implementation tables identify feature history independently of these captures.

## Expanded visual tour

These six captures use new demonstration projects, assembled in the restored applications
on November 19, 2026. The interfaces are application renders, not mockups; computed images,
curves and model responses are real outputs.

| Image                                                                         | Source checkpoint                                                                                              | What it shows                                                                                                                                                                 |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Signal lab](../../images/history/runcoder-signal-lab.png)                    | [January 2024 Runcoder](https://github.com/riteofstring/setta/commit/898e0b615d4a982358699733713901a3080bb8f1) | A frequency slider drives an interactive Python callback and its 180-sample damped waveform.                                                                                  |
| [Cluster lab](../../images/history/runcoder-experiments.png)                  | [January 2024 Runcoder](https://github.com/riteofstring/setta/commit/898e0b615d4a982358699733713901a3080bb8f1) | Shared parameters, scikit-learn callable controls, saved seed variants and a feature-count sweep. This is a configured experiment, not evidence of completed sweep execution. |
| [Julia studio](../../images/history/setta-image-lab.png)                      | [November 2024 Setta](https://github.com/riteofstring/setta/commit/6ad993c8524aff5923286989f02cd1f8aa92c492)   | An interactive Python task computes three 640 × 640 Julia-set studies and an escape-time distribution, using NumPy and Pillow.                                                |
| [Training review](../../images/history/setta-model-workbench.png)             | [May 2026 Setta](https://github.com/riteofstring/setta/commit/eea7fb38c8fdb452766d06b08610248e2962c4fc)        | Two chat reviews in an executed Start–AND–End workflow. Both responses completed and the gate received both inputs.                                                           |
| [Regression lab — Analyze](../../images/history/setta-research-workbench.png) | [May 2026 Setta](https://github.com/riteofstring/setta/commit/eea7fb38c8fdb452766d06b08610248e2962c4fc)        | Native code, chart, spreadsheet and file-browser sections, populated with a real six-rate numerical experiment.                                                               |
| [Regression lab — Plan](../../images/history/setta-project-operations.png)    | [May 2026 Setta](https://github.com/riteofstring/setta/commit/eea7fb38c8fdb452766d06b08610248e2962c4fc)        | Another saved view of the same project: a native Kanban board, research notes and the same convergence chart. Validation and further experiments remain planned tasks.        |

The May 2026 demonstrations use 81 synthetic samples, 40 gradient-descent steps and six
learning rates. A separate Python calculation produced the CSV and curves; these were
imported into the application's native displays. The captures do not demonstrate SettaRunner
or detached-job execution. At the displayed precision, rates 0.3 and 0.6 both reach a training
MSE of 0.007273; no validation set was used.

The chat responses came from **Qwen3-4B, Q4_K_M**, served locally on a temporary GPU through
the application's OpenAI-compatible provider connection. The measured results were included
explicitly in both prompts. The canvas also has section-context links, but this capture does
not establish that those links alone supplied the evidence. The responses reproduce neither
an original provider's answers nor its performance.

Two small frontend repairs were needed in the May build: a missing Lodash import in the
chat layout, and an explicit Blob download mode for the spreadsheet's binary-file request.
The retained dependencies were used to rebuild it. These repairs restore the existing widgets;
they do not add the demonstrated workflow, chart, spreadsheet or task-board features.

## Earlier restoration captures

The following images remain available in the feature histories.

| Image                                                                               | Restored build                                                                                                     | What it shows                                                                                                                                         |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ABCDE nested forms](../../images/history/abcde-nested-forms.png)                   | [November 2020 frontend](https://github.com/riteofstring/setta/commit/cf95643cd5a6c9a7fe67736db07815fecc1addcc)    | Compose and ColorJitter controls with nested arguments. Execution is not demonstrated.                                                                |
| [ioVuu workspace](../../images/history/iovuu-workspace.png)                         | [June 2022 frontend](https://github.com/riteofstring/setta/commit/a0c694437b8cb938b2cfe9aa8c969ef48b6b8364)        | Canvas sections, a project outline and parameter editing.                                                                                             |
| [Runcoder interactive Python](../../images/history/runcoder-interactive-python.png) | [January 2024 application](https://github.com/riteofstring/setta/commit/898e0b615d4a982358699733713901a3080bb8f1)  | A global parameter and the calculated chart from interactive Python.                                                                                  |
| [Setta configuration](../../images/history/setta-configuration.png)                 | [November 2024 application](https://github.com/riteofstring/setta/commit/6ad993c8524aff5923286989f02cd1f8aa92c492) | GUI values after a YAML edit: `c = 3`, `n = 64`. The editor itself is outside this frame.                                                             |
| [Connected chats](../../images/history/setta-connected-chats.png)                   | [March 2026 application](https://github.com/riteofstring/setta/commit/c88c01bf751b0417dbc03ad29bc8168befa05ca4)    | A new six-run demonstration table connected to two chats. A substitute local model produced the displayed responses through the restored application. |
| [Saved view](../../images/history/setta-saved-view.png)                             | [March 2026 application](https://github.com/riteofstring/setta/commit/c88c01bf751b0417dbc03ad29bc8168befa05ca4)    | A new listener demonstration in the Operate view: a gain control and its live computed result.                                                        |

The earlier connected-chats screenshot's “CONTEXT UNAVAILABLE” indicator concerns provider context-usage
reporting. The connected table was supplied to the model; the displayed answer identifies
the lowest-loss row. This restoration does not claim to reproduce the original provider's
answers or performance.

The build links resolve to rewritten commits in this repository. They identify the source
checkpoint, not a self-contained restoration environment. Full capture projects, restoration
patches and recordings are retained separately in private preservation archives.

## Current example

[The ambient instrument](../../images/instrument.png) is a November 2026 capture of the
independently maintained application at [setta.dev](https://setta.dev), after starting
its default patch. Its musical logic, audio and scenery belong to that application.

These are application captures, not illustrations or interface mockups.

[Visual tour](README.md) · [Reconstruction methodology](methodology.md)

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
