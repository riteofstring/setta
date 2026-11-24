# Setta history guide

[Documentation](../README.md) / History

Setta grew from generated Python forms into a spatial workspace, an experiment
environment and a programmable workbench with AI agents. This guide follows what
each change made possible, how the interfaces and architecture evolved, and which
ideas became reusable library features.

## Start here

**[Explore the interactive retrospective →](https://setta.dev/history/)**

For a tour inside this repository, choose one of these:

| Read                                    | What it covers                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------- |
| [Illustrated highlights](highlights.md) | A selection of ideas worth exploring: Python controls, live images, experiments and agents. |
| [The illustrated timeline](tour.md)     | The product's evolution from 2020 to 2026, in order, through screenshots and examples.      |
| [Original example gallery](examples.md) | Seven historical projects, including Stream Diffusion, FLUX inpainting and model training.  |

## Browse by feature or source

These chapters follow an idea across versions. Each includes examples and implementation landmarks.

| Chapter                                                               | What to look for                                                                     |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [Python becomes an interface](features/python-interfaces.md)          | Generated controls and code, nested callables, YAML and source editing.              |
| [Controls, composition and navigation](features/spatial-controls.md)  | Canvas sections, groups, drawing, inspectors and changing side panes.                |
| [Experiments, versions and execution](features/experiments.md)        | Saved variants, parameter sweeps, run groups and detached execution.                 |
| [Reactive state and AI](features/reactive-ai.md)                      | Live Python, generated state, watched files and meta controls.                       |
| [The programmable workbench](features/workbench.md)                   | Files, Git, remote workspaces, agents, context and executable workflows.             |
| [From workbench to reusable tools](features/libraries-and-detours.md) | Setta 3 and 4, library extraction, creative applications and focused research tools. |

For exact dates and capabilities across all chapters, use the
**[chronological feature history](feature-history.md)**. It is the detailed source-backed
reference, including features that were later removed or remained experimental.

The [technology and architecture](technology.md) guide follows the frontend and
backend stack, including the tools behind the original examples.

## Source and media reference

| Reference                                              | Use it to…                                                                           |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| [Tags and historical checkpoints](tags.md)             | Choose a source or milestone tag and understand what it establishes.                 |
| [Technology and architecture](technology.md)           | Understand changing runtimes, engineering challenges and the libraries behind them.  |
| [Repository composition timeline](timeline.md)         | Locate the projects, source trees and major transitions.                             |
| [Reconstruction and local browsing](methodology.md)    | Understand the reconstructed Git lineage and inspect its tags.                       |
| [Feature demonstration walkthroughs](feature-demos.md) | Follow the actions and results shown in the webpage's clips.                         |
| [Visual coverage index](coverage.md)                   | Find a feature on the webpage and see whether it is demonstrated or explained.       |
| [Image and recording provenance](images.md)            | Identify source revisions, original media, prepared examples and restoration limits. |
| [Archived overview film](film.md)                      | Find the chapter timings and captions for the preserved video edition.               |

The current checkout contains the [React library](../../packages/workspace/README.md).
Earlier applications live in earlier commits. Setta 3 and Setta 4 were separate experiments;
the library was extracted from the Setta 2 workbench. The screenshots and source links
identify which generation they describe.

[All documentation](../README.md) · [Repository](../../README.md)
