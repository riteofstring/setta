# Image provenance

The historical screenshots are captures of restored applications made in November 2026.
They show the named source checkpoints with demonstration data, not original release-day
screenshots. Runtime restoration can include dependency, connection and provider adaptations.
The implementation tables identify feature history independently of these captures.

| Image                                                                               | Restored build                                                                                                     | What it shows                                                                                                                                         |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ABCDE nested forms](../../images/history/abcde-nested-forms.png)                   | [November 2020 frontend](https://github.com/riteofstring/setta/commit/cf95643cd5a6c9a7fe67736db07815fecc1addcc)    | Compose and ColorJitter controls with nested arguments. Execution is not demonstrated.                                                                |
| [ioVuu workspace](../../images/history/iovuu-workspace.png)                         | [June 2022 frontend](https://github.com/riteofstring/setta/commit/a0c694437b8cb938b2cfe9aa8c969ef48b6b8364)        | Canvas sections, a project outline and parameter editing.                                                                                             |
| [Runcoder interactive Python](../../images/history/runcoder-interactive-python.png) | [January 2024 application](https://github.com/riteofstring/setta/commit/898e0b615d4a982358699733713901a3080bb8f1)  | A global parameter and the calculated chart from interactive Python.                                                                                  |
| [Setta configuration](../../images/history/setta-configuration.png)                 | [November 2024 application](https://github.com/riteofstring/setta/commit/6ad993c8524aff5923286989f02cd1f8aa92c492) | GUI values after a YAML edit: `c = 3`, `n = 64`. The editor itself is outside this frame.                                                             |
| [Connected chats](../../images/history/setta-connected-chats.png)                   | [March 2026 application](https://github.com/riteofstring/setta/commit/c88c01bf751b0417dbc03ad29bc8168befa05ca4)    | A new six-run demonstration table connected to two chats. A substitute local model produced the displayed responses through the restored application. |
| [Saved view](../../images/history/setta-saved-view.png)                             | [March 2026 application](https://github.com/riteofstring/setta/commit/c88c01bf751b0417dbc03ad29bc8168befa05ca4)    | A new listener demonstration in the Operate view: a gain control and its live computed result.                                                        |

The chat screenshot's “CONTEXT UNAVAILABLE” indicator concerns provider context-usage
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
