# Experiments and the reusable library

**Current library, with preserved experiments.** Extraction separated the workspace's
interaction model from the application that had grown around it. Browser pipelines moved
finite computations into workers, while the Python and Go application backends were removed.
The remaining package can support many kinds of interactive tools.

[![The ambient instrument uses Setta controls and panels around an application-owned audio engine.](../../../images/instrument.png)](https://setta.dev)

_An independently maintained example: the application supplies music, audio and scenery;
Setta supplies workspace interactions and worker coordination._

**Experiments:** Setta 3 and Setta 4 explored parallel directions. Their presence earlier in
this reconstructed chain records their work; it does not change the original ancestry of the
Setta 2-derived library.

## Implementation landmarks

These are preserved implementation landmarks, not a release calendar.

| Month   | Preserved work                                                                             | Source                                                                                          |
| ------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 2026-05 | The Setta 3 rewrite baseline starts a preserved experimental direction.                    | [Change](https://github.com/riteofstring/setta/commit/a18ccaf5e8f0b128f500cc947a4ce6ce550bacf0) |
| 2026-06 | Setta 3 appearance and workspace controls develop on that direction.                       | [Change](https://github.com/riteofstring/setta/commit/4cf22aad61d3da8e416c8911370323593d6032f0) |
| 2026-07 | The Setta 4 director command-center plan records a design proposal, not a shipped feature. | [Change](https://github.com/riteofstring/setta/commit/c294f12861fbca235edc4053bc5d4cf1d4137567) |
| 2026-07 | The Setta 4 graph is measured in a WebGL2 context.                                         | [Change](https://github.com/riteofstring/setta/commit/11609832e994501345e5615e543e9adb216aab46) |
| 2026-08 | Workspace package extraction starts on the Setta 2-derived line.                           | [Change](https://github.com/riteofstring/setta/commit/57f92584bff7f31b18ed1e829ea4b02b69fadfd8) |
| 2026-10 | React and browser-worker APIs become reusable package entry points.                        | [Change](https://github.com/riteofstring/setta/commit/74837d35da5cb21bdff2ebc1ebaab0cbb77d5ceb) |
| 2026-10 | Browser pipelines expose progress by stage.                                                | [Change](https://github.com/riteofstring/setta/commit/e003c84df188b0dcc154e33c14f718c1cd39756e) |
| 2026-10 | The Python runtime and example applications are removed from the library line.             | [Change](https://github.com/riteofstring/setta/commit/4919cb096ebbcd861619e54bd0330b09b47088ff) |
| 2026-11 | The unused local Go backend is removed.                                                    | [Change](https://github.com/riteofstring/setta/commit/2866560207b0c2926136748fce42322f3a43aebf) |
| 2026-11 | The frozen current endpoint improves graph geometry work during gestures.                  | [Change](https://github.com/riteofstring/setta/commit/244558a7879b3cf4ec2098c48e5c1b1971d56287) |

The final library descends from Setta 2. Setta 3 and Setta 4 are parallel experiments preserved here through explicit reconstruction transitions; their position in this single chain does not make them ancestors of the original library.

Today Setta provides workspace interactions, typed controls, saved views, windows and browser-worker coordination. The consuming application supplies its own data, algorithms and persistence. The instrument at setta.dev supplies its own music, audio engine and 3D visuals.

[Historical guide](../README.md) · [Repository composition](../timeline.md)
