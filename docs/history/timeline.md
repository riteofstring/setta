# Repository composition through time

[Documentation](../README.md) / [History](README.md)

This table describes how preserved projects coexist in the reconstructed
checkout. A project's last commit does not prove it stopped being used. The
transitions below organize source history rather than invent retirement dates.

| Chapter                                      | Projects present together                                                                                             | Transition                                                                                                                                                                          |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Early ABCDE                                  | `ABCDE/` and `abcde-frontend/`                                                                                        | Python metadata and a separate frontend start the interface experiment.                                                                                                             |
| ABCDE and ioVuu ecosystem                    | Those components plus `abcde-pip/`, `abcde-electron/` and `abcde-cli/`                                                | Packaging, desktop execution and command-line work develop alongside the interface.                                                                                                 |
| Split Runcoder                               | The early components plus `abcde-backend/`, `abcde-utils/`, `abcde-test/` and `abcde-demos/`                          | The Node backend, shared utilities and supporting projects coexist with the frontend and CLI. Older components remain available through this chapter without asserting ongoing use. |
| Consolidated Runcoder, then the Setta rename | The `runcoder` monorepo occupies the root; `xterm.js/` and `xyflow/` enter alongside it                               | An explicit transition closes the split-component chapter. The product is renamed within this application history.                                                                  |
| Older public Setta                           | The older Setta repository takes the root; `setta-examples/` and later `setta-saas/` coexist with the preserved forks | The example collection and hosted experiment are companion projects, not successive replacements for Setta.                                                                         |
| Later workbench and experiments              | Later Setta takes the root; supporting projects remain available                                                      | Setta 2, Setta 3/4 detours, agents, workflows, applications and rendering experiments are all represented. Source coexistence is not an assertion of runtime compatibility.         |
| Current reusable library                     | Current Setta at the root, plus this guide                                                                            | The final transition restores the Setta 2-derived library and closes historical-only component directories. Their code remains in earlier commits.                                  |

For the software inside these projects, see [languages, libraries and runtimes](technology.md).
The [tag guide](tags.md) distinguishes source endpoints, milestones and release versions.

## Names and major boundaries

- [ioVuu branding](https://github.com/riteofstring/setta/commit/265561755d058b1e5f6f6c64d01fa2477c6dc170)
- [Runcoder branding](https://github.com/riteofstring/setta/commit/f51e94eab77f6a2e0f1099f4c292fd6bb27c9101)
- [Runcoder monorepo begins](https://github.com/riteofstring/setta/commit/edd855830c07bea237a5e3f7c19c68a82cdd6c80)
- [Setta package rename](https://github.com/riteofstring/setta/commit/241c5e1a7f4b7eea0af6ffb726269c2ec1f0ef6d)
- [Workspace extraction](https://github.com/riteofstring/setta/commit/57f92584bff7f31b18ed1e829ea4b02b69fadfd8)
- [Browser library APIs](https://github.com/riteofstring/setta/commit/74837d35da5cb21bdff2ebc1ebaab0cbb77d5ceb)
- [Python runtime removed](https://github.com/riteofstring/setta/commit/4919cb096ebbcd861619e54bd0330b09b47088ff)
- [Go backend removed](https://github.com/riteofstring/setta/commit/2866560207b0c2926136748fce42322f3a43aebf)

The standalone xterm.js history contains four preserved commits, including canvas-zoom mouse-coordinate work. The xyflow history contains two preserved commits, including a source snapshot. Neither is presented as the complete upstream project's history.

[Historical guide](README.md)
