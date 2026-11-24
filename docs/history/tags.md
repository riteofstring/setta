# Tags and historical checkpoints

[Documentation](../README.md) / [History](README.md)

The tags are useful navigation anchors, but they serve different purposes. Keep the
existing namespaces and published targets. Add a few landmarks where an entire period,
application or architectural transition is otherwise hard to find; tagging every feature
or dependency update would make the list less useful.

The November 24, 2026 audit found **58 tags**, with identical local and GitHub targets:
24 milestones, 16 source endpoints, 17 historical version tags and one current-package
release tag. The source and milestone tags are lightweight; `v0.1.0` is annotated.

## What the namespaces mean

| Namespace                       | Meaning                                                   | How to use it                                                                                                                           |
| ------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `source/<project>`              | The retained endpoint of an imported source project.      | Identify that project's final imported state. It is not necessarily its best demonstration or a runnable release.                       |
| `milestone/YYYY-MM-description` | A selected implementation or source-history landmark.     | Find a change or period quickly. Read the commit and nearby documentation to distinguish beginnings, prototypes and fuller checkpoints. |
| `version/setta-2025/v0.0.*`     | Version tags preserved from the older Python application. | Inspect that application's versioned history without confusing it with the current npm package.                                         |
| `v0.1.0`                        | The released `@riteofstring/setta` npm package.           | Inspect the package release; reserve this short version namespace for releases of the current package.                                  |

A source tag points into the reconstructed repository, which may contain companion
projects at the same commit. For example, `source/abcde-django` identifies the old
project history, whose files were preserved under `ABCDE/`. Use the
[repository composition timeline](timeline.md) to understand those directories.

## What is already covered

The milestone tags cover Python metadata, the early sweep prototype, freeform canvas
sections, the ioVuu/Runcoder/Setta names, interactive Python, executable sweeps, chat,
MCP, generated state, hosting, meta controls, the runner, app mode, Go, workflows,
the starts of Setta 3/4, library extraction and browser pipelines.

Three distinctions matter when browsing:

- `milestone/2020-12-sweep-ui-prototype` deliberately marks an editor with no sweep
  execution. `milestone/2024-01-sweep-execution` marks the later executable work.
- `milestone/2023-09-monorepo` points to an initial commit containing a one-line README.
  It is a repository boundary, not a complete local workbench. The October checkpoint
  below is a better starting point for reading that application's implementation.
- `milestone/2026-11-current-library` is frozen at **November 15, 2026**, the same
  commit as `source/setta`. Its name does not mean “latest,” and it predates `v0.1.0`.
  Use the release tag for the published package and `main` for today's documentation.

The large gap is **2021**, followed by the later usable Setta 3/4 interfaces and the
focused applications. Technology changes are also less visible than feature introductions.
The [technology history](technology.md) provides that missing route through the archive.

## Recommended additions

These are proposed names for currently untagged landmarks, not existing tags or new
release claims. Each link points directly to its verified commit. The table supplements
the existing tags without moving or renaming them.

| Proposed milestone                         | Source checkpoint                                                                                                | Why it earns an anchor                                                                                          |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `milestone/2021-01-python-execution`       | [2021-01-24 · e8df01c42c](https://github.com/riteofstring/setta/commit/e8df01c42cf6098d7b2675def33e7a1364766626) | Generated Python is written to a file and launched from the Electron frontend; fills the missing 2021 chapter.  |
| `milestone/2022-10-vite-frontend`          | [2022-10-09 · ceb0a25a76](https://github.com/riteofstring/setta/commit/ceb0a25a7696373ca8e5ddb605b687d40538d8a1) | The frontend starts moving from Create React App to Vite.                                                       |
| `milestone/2023-10-local-python-workbench` | [2023-10-22 · 6c6ee5b1cb](https://github.com/riteofstring/setta/commit/6c6ee5b1cb21ee8d09cb67fb4fe0231aa244deda) | A substantive local FastAPI/Python application, beyond the nearly empty monorepo-initialization tag.            |
| `milestone/2026-07-setta-3-workspace`      | [2026-07-11 · 6258039962](https://github.com/riteofstring/setta/commit/6258039962ac90a9e5fd44c141c50ce48843b209) | The later scrolling workspace and research-graph source used by the Setta 3 retrospective captures.             |
| `milestone/2026-08-setta-4-director`       | [2026-08-02 · bd5cd3d089](https://github.com/riteofstring/setta/commit/bd5cd3d0898d5ced1961532034e3b9284fa3146b) | The later Director and artifact-interface source used by the Setta 4 captures.                                  |
| `milestone/2026-08-upstream-xyflow`        | [2026-08-30 · 859ab84ded](https://github.com/riteofstring/setta/commit/859ab84ded514c4bb0f6be9babff8a2bafa1bc8e) | The library replaces its vendored xyflow runtime with the upstream renderer.                                    |
| `milestone/2026-09-bench`                  | [2026-09-13 · 674bbd18ad](https://github.com/riteofstring/setta/commit/674bbd18ad04c6878c128784920dd0ac08263dd1) | A concrete Bench application checkpoint, represented by the executed comparison in the retrospective.           |
| `milestone/2026-09-experiment-lens`        | [2026-09-19 · 9ff9180cb4](https://github.com/riteofstring/setta/commit/9ff9180cb43ffce19eb30444df42cc928670be50) | The Experiment Lens application enters the source history.                                                      |
| `milestone/2026-11-browser-only-library`   | [2026-11-01 · 2866560207](https://github.com/riteofstring/setta/commit/2866560207b0c2926136748fce42322f3a43aebf) | The Go backend is removed after October’s Python removal, completing the library’s server-independent boundary. |

The existing October browser-pipeline tag already contains Python Canvas, Realtime,
Review and Experiment Lens under `apps/`. Those paths provide further entry points
without requiring a tag for every application revision. Bench belongs to a separate
preserved application checkpoint and benefits from its own anchor.

The Setta 3 and Setta 4 suggestions identify the captured source versions. Their
[demonstration limits](images.md#summer-2026-restoration-captures) still apply: an authored
graph, validated draft or built-in replay is not proof of successful live orchestration.

## Naming and annotation

Keep `milestone/YYYY-MM-short-description` for new historical anchors and use
**annotated tags**. An annotation should explain what the commit establishes, the
application generation, and any prototype or restoration limitation. The month in the
name comes from the historical change; the tag's creation date should remain the date
it was actually added.

Prefer a named capability or architectural boundary over “current,” “latest,” “final”
or “working.” A source checkpoint is not a build guarantee. Keep the public tags stable:
correct an explanation in this guide or add a clearer milestone instead of replacing
an existing tag object. Existing lightweight tags can stay lightweight.

## Browse without building

```sh
git tag --list 'milestone/*'
git show --no-patch milestone/2023-12-interactive-python
git show milestone/2023-12-interactive-python:setup.cfg
git ls-tree --name-only source/abcde-frontend
git show source/abcde-frontend:abcde-frontend/package.json
```

These commands inspect retained source without checking out or executing an old
application. For the reconstruction's branch transitions and preservation limits,
read the [methodology](methodology.md).

[History guide](README.md) · [Repository composition](timeline.md) · [Languages and libraries](technology.md)
