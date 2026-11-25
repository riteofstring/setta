# Setta documentation

[Repository](../README.md)

Start with Setta's history: six years of experiments with programming interfaces,
creative tools and AI workspaces. Documentation for the current React package follows below.

## Explore the history

| Start here                                                  | What you will find                                                                                    |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [Interactive retrospective](https://setta.dev/)             | The main tour, with automatic demonstrations and full-size images.                                    |
| [History guide](history/README.md)                          | A reading map for the illustrated tour, feature chapters and source references.                       |
| [Illustrated highlights](history/highlights.md)             | A selection of the most interesting ideas, with examples and implementation links.                    |
| [Original videos](history/videos.md)                        | Six original walkthroughs with thumbnails: training, live images, view modes, chat and the workbench. |
| [Chronological feature history](history/feature-history.md) | The detailed account of what existed, when it appeared and what changed or disappeared.               |

[Languages and libraries](history/technology.md) explains how the stack changed.
[Tags and checkpoints](history/tags.md) helps locate the corresponding source.

The [history guide](history/README.md#source-and-media-reference) also links to source
checkpoints, capture provenance and demonstration notes.

## Use the current package

| Guide                                                                                 | Purpose                                                                   |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [React workspace](../packages/workspace/README.md)                                    | Installation, component setup and the public workspace API.               |
| [Browser pipelines](../packages/workspace/BROWSER.md)                                 | Run application computations in Web Workers.                              |
| [Audio demo](https://setta.dev/demo/) and [how it uses Setta](examples/instrument.md) | A live application and the boundary between its behavior and the library. |

Historical application features are described under `history/`; these package guides
describe what is available in the current checkout.

## Develop and maintain the package

| Guide                                                                  | Purpose                                                                 |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [Contributing](../CONTRIBUTING.md)                                     | Pinned tools, source setup and the development workflow.                |
| [Workspace design](design/workspace.md)                                | Ownership, layouts, editing, navigation and execution boundaries.       |
| [Development tooling](design/development-tooling.md)                   | Why the build, browser fixtures and verification tools work as they do. |
| [Release guide](releasing.md)                                          | Maintainer instructions for publishing the npm package.                 |
| [Dependency assessments](security/dependency-assessment-2026-10-09.md) | Dated security reviews and the limits of their conclusions.             |
| [Archived engineering evidence](evidence/README.md)                    | Earlier extraction and renderer comparisons preserved in Git.           |

[Get support](../SUPPORT.md) · [Report a security issue](../SECURITY.md)
