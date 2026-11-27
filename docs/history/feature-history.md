# Setta: chronological feature history, 2020–2026

[Documentation](../README.md) / [History](README.md)

Setta began as a way to describe Python objects and build interfaces for their arguments. It grew into a spatial programming and experiment workbench, acquired live Python interaction and AI tools, explored separate agent-centered applications, and eventually became a reusable React workspace library. This document follows those changes chronologically, including features that were replaced, removed, or confined to an experimental branch.

The account covers the preserved source history from October 2020 through November 21, 2026. Dates identify implementation evidence in this repository, not necessarily public launches. The endpoint is the source tree at [d7ac38a6ff](https://github.com/riteofstring/setta/commit/d7ac38a6ff), following the first 0.1.0 package release. Historical behavior is described from source, commit changes, and contemporaneous documentation; an implementation in the archive does not establish that every historical environment still works.

| Period                      | Chapter                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2020                        | [Python descriptions and generated forms](#2020-python-descriptions-and-generated-forms)                                                         |
| 2021                        | [Saved interfaces, local execution, and spatial navigation](#2021-saved-interfaces-local-execution-and-spatial-navigation)                       |
| 2022                        | [The freeform workspace](#2022-a-freeform-workspace)                                                                                             |
| 2023                        | [Experiments, charts, documentation, and the local monorepo](#2023-experiments-charts-documentation-and-a-local-monorepo)                        |
| 2024                        | [Executable sweeps and live artifacts](#2024-executable-sweeps-and-live-artifacts)                                                               |
| 2025                        | [Reactive Python, chat, MCP, and the expanding workbench](#2025-reactive-python-chat-mcp-and-the-expanding-workbench)                            |
| January 2026                | [Sharing, a new runner, agents, files, and Watch Code](#january-2026-a-programmable-workbench-and-a-new-experiment-runner)                       |
| February 2026               | [App mode, remote workspaces, plugins, and specialized sections](#february-2026-applications-remote-workspaces-plugins-and-specialized-sections) |
| March–May 2026              | [Workflows, windows, and the Setta 2 backend transition](#marchmay-2026-workflows-windows-and-the-setta-2-backend-transition)                    |
| Late May–July 2026          | [The Setta 3 experiment](#late-mayjuly-2026-the-setta-3-experiment)                                                                              |
| Late July–early August 2026 | [The Setta 4 Director experiment](#late-julyearly-august-2026-the-setta-4-director-experiment)                                                   |
| August 2026                 | [The reusable Workspace library](#august-2026-extract-the-reusable-workspace-library)                                                            |
| August–October 2026         | [Python Canvas, Realtime, Bench, Review, and Experiment Lens](#augustoctober-2026-focused-applications-built-on-workspace)                       |
| October 2026                | [Browser pipelines and a smaller product boundary](#october-2026-browser-pipelines-and-a-smaller-product-boundary)                               |
| November 2026               | [Current library inventory and the first npm release](#november-2026-the-current-react-library-and-first-npm-release)                            |
| Cross-reference             | [Feature continuity and removals](#feature-continuity-and-removals-at-a-glance) · [Source landmarks](#source-landmarks-for-further-reading)      |

The [visual coverage index](coverage.md) maps these feature families to real application examples and identifies capabilities explained from source.

The [technology history](technology.md) follows the languages, libraries and server
architectures behind these capabilities. The [tag guide](tags.md) explains the source landmarks.

## Reading this history

The repository combines formerly separate projects and branch experiments. Its chronological sequence is a reconstruction: a **History transition** restores another source baseline, and **Recovered WIP** identifies unfinished saved work. Those transitions are not product features. Setta 3 and Setta 4 are separate experiments; today's library was extracted from the Setta 2 workbench. A later date therefore does not mean that all earlier capabilities were inherited.

The coverage is organized around observable capabilities: what users could create, edit, run, inspect, save, share, or extend. Internal refactors appear when they changed those capabilities or explain a product boundary. Repeated fixes, dependency changes, and imported upstream commits are not listed as separate features. “Prototype” and “experiment” distinguish exploratory implementations from established functionality. The [reconstruction methodology](methodology.md) and [repository composition timeline](timeline.md) explain the archive itself.

Several recurring terms changed meaning over time:

| Term               | Meaning in the relevant generation                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Section            | Initially a nested block of callable parameters; later a movable canvas card, group, editor, artifact, chat, or other tool surface.                          |
| Callable           | A Python function or class constructor represented by editable arguments.                                                                                    |
| Parameter          | An input to a callable or another structured value; later also a standalone interface control.                                                               |
| Version or variant | A saved alternative configuration of a section. This is separate from a software release.                                                                    |
| Reference          | A connection to another generated value, section, or parameter. Later graph edges also represented AI access and workflow control, with different semantics. |
| Saved view         | A named presentation of a workspace. It does not necessarily duplicate the underlying data.                                                                  |
| Window Space       | A saved arrangement of floating windows, distinct from a saved canvas view.                                                                                  |

## 2020: Python descriptions and generated forms

### October: describe Python objects before constructing them

The earliest preserved work, beginning October 11, centered on Python training and testing configuration. The important generalization was to describe the objects a program would need instead of constructing every object immediately.

By October 17, the metadata system could describe functions and classes through **ClassInfo**. It inspected signatures, argument names, default values, and annotations; recorded presentation metadata; chose which arguments to expose; and emitted JSON that a frontend could consume. A configuration could consequently describe a model, optimizer, or other component without writing a separate form for each one.

The accompanying configuration model supported named references and factories. One object could depend on an earlier object, and construction order mattered. Optimizer factories were an early practical use: an optimizer could be described before the model parameters it would eventually receive were available. Work on YAML references and execution order belonged to this object-composition problem, rather than to a general visual workflow engine.

By October 24, **TypeMap** added custom Python type registration and aliases. The interface could associate a Python type with a useful UI representation, including project-specific types, instead of relying only on a small fixed set of primitives.

Evidence: [October metadata checkpoint](https://github.com/riteofstring/setta/commit/6ab75eb9bca555c3db6b04e7cfa232af9efadab4), [ClassInfo implementation](https://github.com/riteofstring/setta/blob/6ab75eb9bca555c3db6b04e7cfa232af9efadab4/ABCDE/src/abcde/registration/class_info.py), [type registration](https://github.com/riteofstring/setta/commit/05ee6933a1c0d9241710c9a10152a220709eddf1).

### November: recursive callable forms

The Python description layer expanded into a UI-building API. **UICreator** combined module and callable descriptions, selected included or excluded members, and supported reusable parameter descriptions. Functions could be filtered by name, including regular-expression selection. Defaults and UI types could be overridden separately from the underlying Python signature, and common settings could be applied across multiple arguments.

The data model grew beyond flat keyword arguments:

- A parameter could contain another callable or object description.
- Lists and dictionaries could contain nested objects.
- User-defined arguments and keyword arguments could be described alongside inspected arguments.
- References and factory descriptions deferred object construction.
- Python-specific types, including tensor-related values, could receive explicit mappings.

The React frontend turned these descriptions into recursive forms. Selecting a callable revealed its parameters; selecting a different callable changed the child controls. The UI retained entered values for previous selections so switching away and back did not necessarily discard work. Nested sections could collapse, hide descendants, and expose a breadcrumb path for navigating back through the hierarchy.

By late November, the frontend could fetch specifications from a Django backend and export the user's selections. This was a form-driven interface with nested navigation. It was not yet the freely positioned canvas seen in later Setta.

Evidence: [recursive callable selection](https://github.com/riteofstring/setta/commit/f4f2bd2593de3bc71c7121291df5efcb8bfc08af), [default and UI-type overrides](https://github.com/riteofstring/setta/commit/b25a52978d), [selection export](https://github.com/riteofstring/setta/commit/4835438f7a), [backend specification fetching](https://github.com/riteofstring/setta/commit/a8a7926278).

### November–December: Sections and Details split selection from value entry

The first panes already divided work between two surfaces. By November 15, selecting a callable in **Sections** populated a separate **Details** pane with its arguments. Details edited the object's values; it was not yet an inspector for designing controls. December's sweep fields appeared underneath those values, but remained an interface prototype without execution logic.

Evidence: [selected-callable Details](https://github.com/riteofstring/setta/blob/e0d13577355579df318ae0d9c720717cb6fa50c1/abcde-frontend/src/components/DetailsPane/DetailsContainer/DetailsContainer.js), [sweep fields without logic](https://github.com/riteofstring/setta/commit/c436b2cc7939d2c69feafa1419ae95cfa33c2c57).

### December: collections, search, and execution scaffolding

List-based forms gained addition, removal, and ordering controls. Searchable callable menus made larger catalogs manageable, and query and selection state could be remembered per section. Root sections could contain collections of children, extending the recursive interface toward a configurable application layout.

A **parameter sweep editor** appeared on December 13. Its historical significance is the interface idea: users could describe multiple candidate values. The preserved change explicitly lacked sweep logic. It should not be read as the introduction of executable parameter sweeps, which came in January 2024.

The configuration machinery continued toward executable Python: function descriptions, factories, references, and keyword arguments were represented without eagerly creating every object. A Run action collected selections, while an Electron shell and IPC work introduced a path toward launching local commands. The early launch path was Windows-oriented. Terminal and login pages were still developing; actual terminal output and authenticated flows appear in the next chapter.

Evidence: [sweep UI prototype](https://github.com/riteofstring/setta/commit/c436b2cc7939d2c69feafa1419ae95cfa33c2c57), [Electron shell](https://github.com/riteofstring/setta/commit/bf2dbd0fb9).

## 2021: saved interfaces, local execution, and spatial navigation

### January: generate and run Python from the interface

January connected the form model to an execution path. Terminal output appeared through xterm.js, while Django login and signup flows guarded the interface and development pages. Users could save named UI sections and selections, then load them as templates rather than rebuilding the form each time.

The Python generator learned to reconstruct models, optimizers, factories, functions, lists, dictionaries, references, and keyword arguments from the saved selections. This made the UI a description of a program rather than merely a collection of input fields. Function execution was implemented by mid-January.

On January 24, generated Python was written to a temporary file and launched through Electron, with terminal output returned to the interface. That checkpoint contained local Windows paths and batch-file handling; it is evidence of a working local-execution design, not of a portable hosted runtime. By the end of January, a separate desktop companion could be opened from the browser's Run flow.

Evidence: [terminal output](https://github.com/riteofstring/setta/commit/a4f94029d6), [saved UI selections](https://github.com/riteofstring/setta/commit/d0cc65881b), [generated model and optimizer code](https://github.com/riteofstring/setta/commit/fa04ba8d96d257bdf76f80b29d905a1da5d56d1f), [function execution](https://github.com/riteofstring/setta/commit/fa04831c7ae4b84037f089edf55fd0f76ece8bf8), [Electron execution](https://github.com/riteofstring/setta/commit/e8df01c42cf6098d7b2675def33e7a1364766626).

### February–March: pan, zoom, overview, and a local CLI connection

The interface began behaving like a navigable workspace. February added panning and zooming around the existing layout, along with resizable or collapsible panes and editor tabs. An overview let users find nested sections and move the main view to them. These were spatial navigation controls over a structured layout; arbitrary card placement arrived a year later.

Saved UI state became more complete, including YAML representations and named saves. The storage model was still changing: an early SavedVersions concept was replaced as folders and sections took over. It should not be conflated with the later section-variant system.

March introduced a browser-to-CLI WebSocket connection with temporary authentication tokens. The browser could ask a locally connected process to generate or run code in the selected local environment. This established a recurring architecture: the UI controlled a program whose Python environment lived outside the browser.

Navigation and arrangement improved together:

- Overview actions could pan to a root or nested section at an appropriate scale.
- Hidden descendants could be reached through their visible parent.
- Multiple pages evolved toward horizontal groups.
- Drag handles reordered sections vertically.
- YAML could be dropped into the interface.
- Sliders became a working selectable parameter presentation, with saved configuration.
- Parameters-only sections and editable keyword arguments allowed forms that were not limited to an inspected callable's original arguments.

Evidence: [pan and zoom](https://github.com/riteofstring/setta/commit/63ee486f680f60e824b0edc3c7b97aefcc1ff2d4), [CLI connection](https://github.com/riteofstring/setta/commit/1220449bf1), [section reordering](https://github.com/riteofstring/setta/commit/d8c7659f6ade86f53d4268b034d9bc1e71ef852f), [working sliders](https://github.com/riteofstring/setta/commit/1f8db6ae4337f253f3d66d102cffaad7c233af3b).

### April–December: reusable configuration and persistent editing

The nested form system continued to broaden. Dictionary values could contain structured children. Keyword arguments could be added, renamed, or removed while keeping the values associated with the selected callable. YAML export received a dialog, and dropping multiple files opened multiple editor tabs.

Persistence became more granular during the spring and summer. Collections of callables, parameter defaults, UI presentation, section hierarchy and order, and entered values were stored through the backend. A child section could be reused as an interface of its own rather than remaining inseparable from its original parent.

Later in the year, switch controls joined the input catalog. Local-storage drafts reduced the cost of losing an unfinished browser session. Saved presentation settings and reusable parameter collections made it possible to preserve how a control behaved as well as its current value. Column and group dragging, nested movement, and overview updates made larger configurations easier to organize.

The product was still principally a Python configuration interface. Its important cumulative features were reusable forms, nested object composition, saved values and defaults, local execution, and spatial navigation. It did not yet have the later canvas artifact, chat, or workflow systems.

Evidence: [YAML export](https://github.com/riteofstring/setta/commit/311c41abc3), [switch control](https://github.com/riteofstring/setta/commit/f365e7e1d1), [preserved frontend history](https://github.com/riteofstring/setta/tree/source/abcde-frontend/abcde-frontend).

### December: control authoring moves from a modal into the inspector

The surrounding editors changed purpose during 2021. The left **Overview** navigated nested sections. The right **UI Editor** initially edited YAML, gaining separate tabs for multiple dropped files in April. Working widget selection and slider configuration lived in a section's gear modal in March, rather than in that YAML pane.

By December, the right editor grouped **UI Config**, **Parameter Sweeps** and **Edit YAML**. The selected section supplied the parameter list; December 25 wired widget selection and configuration fields to state updates. This moved control design beside the form. Adjacent controls were still unfinished: Apply To/Load/Save lacked handlers and the Parameter Sweeps tab was placeholder text. The preserved December UI Config capture shows this developing layout, not a completed preset-save operation.

Evidence: [working modal editor](https://github.com/riteofstring/setta/commit/ca0829de256e95a7f3240fe1eb22f7210c9bb856), [multi-file YAML editor](https://github.com/riteofstring/setta/commit/37693a339088ce4948538a93300e25efca715ec5), [tabbed right editor](https://github.com/riteofstring/setta/blob/6bcf831fd6f07d2c8a0bb0b9b2ba2fdfe23fc3dd/abcde-frontend/src/components/AppContainer/Main/SidePanes/UiEditor/UiEditor.js), [working inspector fields](https://github.com/riteofstring/setta/commit/fe2d5f4266efb759d8d3749a5edb90615b99713a).

## 2022: a freeform workspace

### January–February: presets and freely positioned sections

January added parameter-control presets and a clearer distinction between shared defaults and project overrides. The global control editor could update a named preset or save a new one. February’s **Section Config** pane exposed callable/object and parameter collections, including which choices and fields a section offered. The inspector therefore authored both the contents of a form and the presentation of its controls. A particular project could supply its own values or settings.

The major interaction change arrived on February 26: sections became **freely positioned ReactFlow nodes**. Users could arrange independent cards on a canvas rather than only reorder them within predetermined columns. Context-menu creation used the chosen canvas position, and viewport controls handled fitting and zoom bounds.

This is the useful boundary between the earlier navigable form layout and the familiar Setta spatial workspace. Pan and zoom existed in 2021; independent section positioning is evidenced here.

Evidence: [control presets](https://github.com/riteofstring/setta/commit/7e3fa175e4701bae478e4ab0a0eee707463215fc), [section contents editor](https://github.com/riteofstring/setta/commit/2233e80e09bd3b446866578e7a00b384672ff8ab), [freeform sections](https://github.com/riteofstring/setta/commit/8217da51fdfe52f8983122c9b8aa091adcbf2243).

### May–August: decks, references, and generated programs

May added a minimap for navigating larger canvases. June added **decks**: users could select several sections, collect them into a container, drop other sections into it, and remove sections while retaining sensible canvas positions. Editable names, nested dragging, overview navigation, and parameter filtering made grouped work more practical.

References became explicit parameter inputs. Rather than duplicate a value or nested object, a parameter could refer to another section's result. Code generation expanded to cover primitive values, callables, references, lists, and dictionaries. This let a spatial configuration describe a connected Python object graph.

Selection export supported YAML and JSON during this period. Dragging between lists, groups, and the free canvas gained previews and highlighted targets. Unique sibling naming helped generated references remain unambiguous.

Evidence: [Minimap](https://github.com/riteofstring/setta/commit/265561755d058b1e5f6f6c64d01fa2477c6dc170), [decks](https://github.com/riteofstring/setta/commit/e85fb1f9bd64d4e44ae306ae579feff93fb50cb2), [reference input](https://github.com/riteofstring/setta/commit/645f3df3d3ba77558cb1c945bc359ecb11436766).

### September–November: Card and Parameters replace the old YAML pane

The right editor narrowed to **Card** and **Parameters** in September. The old YAML-entry tab and implementation were removed, followed by the old Templates button. Project/configuration save-and-load dialogs and direct section creation took over that work. November's Run flow generated a `runcoder run <id>` command for the local CLI, while the old JSON/YAML export menu was removed. Later YAML generation and round-trip editing were new implementations, not an uninterrupted continuation of the 2021 pane.

Evidence: [remove YAML tab](https://github.com/riteofstring/setta/commit/0e5a6ecf27e2d20d972cc844b2e3158a5c8b49dd), [remove Templates button](https://github.com/riteofstring/setta/commit/76fee594d05778c3affd3c86853ae85e619d620e), [project/configuration chooser](https://github.com/riteofstring/setta/commit/6792ff2fce22fc314221097f5afb4e83bc7ce0f4), [CLI handoff](https://github.com/riteofstring/setta/commit/1a6b25c90386b79d3fe0bb1399397e05dba15b65).

### September–December: explicit groups, project configurations, and CLI execution

September introduced an explicit **Group** section and a separate Node backend for accounts, projects, and configurations. Project loading and saving included canvas layout, not just parameter values. Configurations could be previewed, selected, and saved under a new or existing name.

The execution handoff became more explicit in November. The server generated code and returned an identifier; the interface supplied a CLI command; the Python CLI downloaded, saved, and executed the identified code. CLI configuration included credential handling. This was another local-runtime bridge, distinct from the early Electron-only launch.

Spatial editing also began maintaining program structure automatically. Detaching a nested parameter onto the canvas could replace the original nested input with a reference to the new independent section. The visual move therefore preserved a relationship in the generated program rather than simply deleting it.

Some earlier interfaces were retired. The old YAML entry route was removed in September, and the old JSON/YAML export menu was removed in November. Later import and export features were new iterations; there was no uninterrupted single YAML editor spanning the entire history.

Evidence: [Group sections](https://github.com/riteofstring/setta/commit/19527db913b842d4e9195c0c6450257fe52203ae), [generated-code identifier](https://github.com/riteofstring/setta/commit/1a6b25c90386b79d3fe0bb1399397e05dba15b65), [CLI download and execution](https://github.com/riteofstring/setta/commit/86b1385c8fff3db435472b199cb08069956cfcc0), [detach-to-reference behavior](https://github.com/riteofstring/setta/commit/087c911436), [old export menu removal](https://github.com/riteofstring/setta/commit/b5aa5c7c02).

## 2023: experiments, charts, documentation, and a local monorepo

### January–March: bring program output back onto the canvas

A new logging path associated program output with the correct project and run. A Python logger sent data to the backend, which streamed updates to the workspace. A PyTorch Lightning integration made training metrics a concrete use case. Named output groups organized results from a run.

Charts turned those results into live visual feedback. Early Chart.js experiments became responsive line charts with multiple series, colors, legends, shared hover information, and updates as data arrived. Resizable sections made the chart surface useful beside controls, and resizing was propagated through containing layouts. Double-click sizing shortcuts followed.

The canvas also became a place to explain a program. Markdown sections and section descriptions supported editable notes and rendered documentation. Early social and video embedding work broadened the possible content, although the initial embed implementation was limited and should not be treated as a complete integration platform.

Parameter filtering, including a keyboard shortcut, reduced searching within large callable forms. Project-level search, a runtime tab, callable filters, global configuration work, and raw code expressions improved the bridge between structured inputs and ordinary Python.

Evidence: [project logger](https://github.com/riteofstring/setta/commit/3695dc1974cf39f9a15f461e13c21b7939ebe9d7), [Lightning logger](https://github.com/riteofstring/setta/commit/c4a7f4de59), [initial charts](https://github.com/riteofstring/setta/commit/268715911a89dbc7c5b8f1d8bbfe3a7f4197ea43), [Markdown sections](https://github.com/riteofstring/setta/commit/07ef6381f0cffd6aeb242334a17c9bfc5761287d), [parameter filtering](https://github.com/riteofstring/setta/commit/435d3ef16b).

### February–March: author explanations in the inspector

February expanded the inspector beyond appearance. The **Parameters** pencil editor saved a description for an individual parameter; hovering that parameter could show its explanation in the left **Quick Help / InfoView**. The right **Info** tab edited the selected section's Markdown description. The two sides could now author and present documentation for the program being assembled.

A **Runtime** tab appeared in March, but its preserved implementation was an empty component followed by an unbound “Test” switch. It did not establish functional execution settings.

Evidence: [parameter descriptions and contextual help](https://github.com/riteofstring/setta/commit/28b516333f8fffe10439c2fcfd458fc4605f2393), [section Markdown editor](https://github.com/riteofstring/setta/commit/033739513cfa4bf9655f4f6120b2babce90d6532), [unfinished Runtime tab](https://github.com/riteofstring/setta/blob/9746188b87e5984dd4a7bd6a8b2e12b50b055022/abcde-frontend/src/components/AppContainer/Main/UiEditorContainer/SidePanes/UiEditor/RuntimeOptions/RuntimeOptions.jsx).

### April–August: reversible editing and reusable sections

Undo and redo expanded across the actual project model. Supported changes included values, arguments, section creation and deletion, grouping, renaming, movement, resizing, callable or UI-type selection, descriptions, and chart-related choices. This made spatial experimentation less costly: changing the program and changing its layout could be reversed through the interface.

A persistent dark theme appeared in July. Global variables made shared values available to generated code, and saved sections could be loaded for reuse. Together, defaults, presets, saved sections, and global values offered different levels of reuse: control presentation, an entire configured component, or a value shared by several components.

Evidence: [project undo and redo](https://github.com/riteofstring/setta/commit/d47946d06496c46f5c1f53afe4ea19d45b38c663), [global variables](https://github.com/riteofstring/setta/commit/89bd4c9372).

### September–December: a consolidated local application

September consolidated the previously split components into a **local monorepo**. The application moved toward a local Python/FastAPI backend that combined responsibilities previously spread across the server and CLI. A local command could serve the application, and development reload and macOS execution paths were part of the continuing work. This reduced the conceptual distance between the browser workspace and the local Python project it controlled.

Autocomplete began connecting the editor to the local Python environment in September. It was still evolving; the later April 2024 milestone is the stronger boundary for the working completion feature.

Project interchange returned through JSON export and import. YAML generation also reappeared, initially without the later full round trip. Code references became highlighted and navigable, including control-click navigation, and generation became more aware of imports and referenced sections.

Saved section versions gained selection and hover preview in a card-header dropdown. The dedicated right-hand Versions pane came later, in August 2024. Users could keep alternate configurations of a component and inspect them before committing to a choice. Copy and paste placed sections at a chosen canvas position.

On December 24, an **interactive Python proof of concept** connected changing interface state to a user function. This was the start of a live feedback loop: control changes could produce new results without treating every interaction as a separate manually launched script. Interactive charts followed in January.

Evidence: [monorepo boundary](https://github.com/riteofstring/setta/commit/edd855830c07bea237a5e3f7c19c68a82cdd6c80), [early autocomplete](https://github.com/riteofstring/setta/commit/65bbb3510d), [JSON import](https://github.com/riteofstring/setta/commit/878bd4d0ca), [navigable references](https://github.com/riteofstring/setta/commit/b49d250999), [version preview](https://github.com/riteofstring/setta/commit/81c8ebf0e0557ee287fd7d3b430676fe1c5b333b), [interactive Python](https://github.com/riteofstring/setta/commit/2cf4f39dceaf2e9bf28c1f267c8b238fd404c102).

## 2024: executable sweeps and live artifacts

### January–February: a full experiment loop

Interactive line charts connected live Python output to the canvas in early January. CodeMirror-based editors added syntax-aware editing, language selection, line wrapping, and theme handling. The workspace could contain code, controls, explanatory text, terminals, and results at the same time.

Terminals became long-lived resources. Code could be sent to an existing terminal, an available terminal, or a new terminal when others were occupied. Terminal identifiers and streamed output maintained the association between a running program and its surface. Windows and macOS handling evolved separately, and terminal history restoration was added later in the year. Preserved xterm.js changes also addressed mouse coordinates when a terminal was displayed on a zoomed canvas.

The first **executable parameter sweeps** arrived on January 27. A sweep section described alternative parameter values; execution expanded combinations and dispatched generated programs. Run groups chose the participating sections and organized the runs. February added sweeps over saved section versions. Alternatives for the same section were handled as alternatives rather than blindly multiplying incompatible selections together.

This was materially different from the December 2020 sweep editor: the 2024 feature had generation and execution behind it. It was also different from the replacement SettaRunner API introduced in 2026.

Other editing features made experiments easier to manage: pinned parameters stayed prominent, frozen sections protected a chosen configuration, multi-section copying retained relative positions, and viewport state could be saved.

Evidence: [interactive line charts](https://github.com/riteofstring/setta/commit/6d21c9c7e53f991cea12174bae1c038a241b75a1), [long-lived terminals](https://github.com/riteofstring/setta/commit/6e69cf3568a39db9d42442972c5b16aafbe24e74), [parameter-sweep execution](https://github.com/riteofstring/setta/commit/2d0edd8357f059abb08f1ecc333108b8df2d283c), [run groups](https://github.com/riteofstring/setta/commit/ed71f6ae255f83d875e80a3d1dc60917ab12abe4), [version sweeps](https://github.com/riteofstring/setta/commit/18df00fb4771ddabf4bdac276526803dcf789714).

### March–July: editing assistance and Python awareness

Autosave covered ordinary edits and undo/redo. Grid snapping became configurable, keyboard shortcuts could be customized, and reset-zoom and fit behavior accounted for the surrounding panes. Groups could arrange their contents in different orientations. Parameter editing gained keyboard movement and nesting operations.

Autocomplete became a working feature in April. Parameter information, inferred imports, references to sections and global values, and missing-argument feedback brought Python-aware assistance into the structured editor. June 22 connected callable parameter requests to language-server signature help. Working basedpyright integration followed in July, supplying completions, signatures, and diagnostics. Generated-variable metadata linked argument-type errors back to section and parameter IDs. This was a local Python development capability, not merely browser text completion.

Evidence: [autosave](https://github.com/riteofstring/setta/commit/416b00d69b), [working autocomplete](https://github.com/riteofstring/setta/commit/2c1ee8f26306eba3eb1fb7d78ebe7045138b647a), [language-server parameter requests](https://github.com/riteofstring/setta/commit/9622a37e95d7ea283cc1fda8fbb484f0120f0b41), [working basedpyright integration](https://github.com/riteofstring/setta/commit/7fa3179419), [diagnostics linked to controls](https://github.com/riteofstring/setta/blob/77cb88eca9/backend/runcoder/lsp/reader.py).

### August–September: images, drawing, and external source files

Interactive code moved closer to the section it controlled instead of relying only on a hardcoded external function path. Reference sections provided another way to expose a value elsewhere on the canvas. Configuration and version previews continued to improve.

Artifacts became a broader output model. Images and chart data could be persisted as files, loaded into sections, and updated from interactive computation. Image manipulation was demonstrated in early September.

Drawing sections introduced an input that was neither a scalar nor code. Users could draw multiple strokes, choose brush color and size, adjust opacity, erase, and use a background image. The drawing could be sent to a dependent interactive task, supporting image-to-image applications where changing the sketch changed the result.

YAML returned as an editable representation that could be parsed into GUI state and code information. Pinned and unpinned parameters were represented, and later September work improved value round trips.

**JSON-backed sections** appeared on September 21. A section could read its values from a JSON source and save edits back to that source. This is the start of a file-backed data contract; it should not be mistaken for the more complete external-file watching and hot reload added in 2025. Nested paths and multiple matching files arrived later.

Evidence: [interactive image manipulation](https://github.com/riteofstring/setta/commit/87275831fe509bd7a265a7fc1ed877bc9a5672dd), [drawing input](https://github.com/riteofstring/setta/commit/82e84e5ae3da61d2592124180bec62a03b357ffe), [YAML-to-GUI parsing](https://github.com/riteofstring/setta/commit/49014dbdf6f899e6b504a904ef8560d03e8ff9f8), [JSON-backed controls](https://github.com/riteofstring/setta/commit/ec9c5eeaa236334b48eb1306f8d7ad2bbabe67b1).

### September: automatic backups protect the project

Automatic database backups appeared on September 15, with configurable frequency, retention and an off switch. This protected saved project data independently of undo history or named section versions. The February 2026 work later enabled backups by default and added an explicit restoration command.

Evidence: [initial backup implementation](https://github.com/riteofstring/setta/commit/f38c819e23b9b057b6f4e73ecfc5a1dea4528f09), [configurable backup policy](https://github.com/riteofstring/setta/commit/6db9895468eeccdba220ba4016160dde3f93dbfe).

### September–October: Setta edits its own settings

On September 21, the settings interface became a Setta project. Its settings section used the same JSON-backed controls as other projects, with `setta-settings.json` as the source. Setta's own preferences were an application of its central idea: turn structured data into an editable workspace.

October 12 separated persistence from presentation. Saving this special project wrote the JSON source and reloaded application settings instead of saving it as an ordinary project in the database. The settings workspace and the configuration file were two views of the same preferences.

Evidence: [settings as a project](https://github.com/riteofstring/setta/commit/2a87c216017cfc5d65ef1369355fda7ce43f3fbe), [file-backed settings save](https://github.com/riteofstring/setta/commit/819e8fb57437af273edfdfc280882c25176937ba), [settings project definition](https://github.com/riteofstring/setta/blob/819e8fb57437af273edfdfc280882c25176937ba/constants/settingsProject.json).

### August–December: versions and parameter help become dedicated inspector tools

On August 17, the version list moved from individual cards into the right **Section Variants** pane. Selecting a section now chose which alternatives the inspector displayed. December completed Add Version, rename, deletion and default selection. This changed where users managed variants; variants themselves already existed in 2023.

September's **Quick Info** editor wrote parameter descriptions directly into code information, extending the earlier description-authoring path. A short-lived **DB Sources** tab had exposed a section's source identifier in March; it was removed in September. It was not a database browser. The inspector was evolving through additions and removals rather than accumulating a permanent list of tabs.

Evidence: [move versions into the pane](https://github.com/riteofstring/setta/commit/e017c6de110b1eace21980b7a753af2eb6515c89), [working Add Version](https://github.com/riteofstring/setta/commit/9b3403121e84216ed2b4b657efd77826bd23fb48), [functional parameter-help editor](https://github.com/riteofstring/setta/commit/c929ab268b59cf4b0fa38d532ba854fa9e442ca8), [DB source field](https://github.com/riteofstring/setta/commit/c800118b6761edb5fdfb992d9ee78fc6b1d40974), [DB Sources removal](https://github.com/riteofstring/setta/commit/eacb7e516e1fbb3a511c56aa47da0edda0782d78).

### October–November: richer documentation and two-way representations

Source-backed editing expanded to nested JSON paths and file patterns that could supply different versions. Terminals and their grouping became more restorable. Plain text and Markdown presentation continued to converge around reusable editor behavior.

Quick information surfaced callable documentation near the controls that needed it. Docstrings could be inspected in a tooltip and turned into a persistent canvas note. Mathematical notation gained LaTeX rendering in November. Dropdown controls joined the growing control catalog, alongside color-oriented inputs and existing text, slider, and switch presentations.

By November 24, YAML round trips covered more of the actual experiment model, including sweeps and run groups. Users could edit and save the source representation without first switching back to the graphical view. Exported trees combined configuration and code files in a readable form.

These were several related features, not one universal serialization format: whole-project interchange, editable YAML representations, and sections backed by external JSON files had different responsibilities and histories.

Evidence: [nested JSON paths](https://github.com/riteofstring/setta/commit/b223913060), [LaTeX rendering](https://github.com/riteofstring/setta/commit/8c09a654a16c05ccb50eda2547a10a991cfef38b), [callable quick info](https://github.com/riteofstring/setta/commit/9849f6b277a249c9330822bd77cf58457ecf96c8), [dropdown control](https://github.com/riteofstring/setta/commit/e35800d731), [expanded YAML round trip](https://github.com/riteofstring/setta/commit/e1e934e626fe9ebafab656a8a16120e56d3b667e).

### December: references survive restructuring; drawing gains layers

Reference maintenance became part of structural editing. Renaming, moving, and grouping sections could update references so the generated program continued to refer to the intended objects. Settings allowed automatic rewriting, confirmation, or leaving references unchanged. Replacements covered code areas, callable information, and parameter expressions. This mattered because visual organization was no longer independent of program structure.

Drawing grew into a layered artifact editor. Layers could be added, deleted, reordered, hidden, and given opacity. A layer could contain multiple artifacts, including file images and brush strokes. Images gained resize and transform handling, including flipped scaling, and erasing became sensitive to the selected artifact. Drawing history continued into early 2025.

The right **Section Config** pane exposed the composition behind those outputs. December 21 connected its artifact list and layer groups to real section state, including dropping artifacts into a layer and removing them. Image and plot settings followed, with chart data, horizontal axis and category-column selection. Charts gained more explicit line and scatter configuration, axes, categories, and hover behavior. The generated-code placeholder also allowed generated Python to occupy a defined part of a larger authored program, with surrounding code contributing to completion context.

Evidence: [reference updates](https://github.com/riteofstring/setta/commit/b8ec26789066d81eddf1c0ac4b203033eb5e8a2a), [replacement implementation](https://github.com/riteofstring/setta/blob/b8ec267890/frontend/src/state/actions/infoToEVReferrer.js), [drawing layers](https://github.com/riteofstring/setta/commit/30bdf9dda496eadf3388586b8f27e3e54577acd1), [artifact transforms](https://github.com/riteofstring/setta/commit/3a89e8ae537250c421e344d42824b8e3a1a802f5), [chart modes](https://github.com/riteofstring/setta/commit/587c6d3fd4), [real artifact/layer operations](https://github.com/riteofstring/setta/commit/3116c2ceaeb97e62f4baf430d21864d72afae641), [chart-data settings](https://github.com/riteofstring/setta/commit/440f33cf4a002448eec12d9423e89194195d78d8).

### December–February: template variables compose scripts across sections

Template variables connected authored code to generated programs and other sections. `$SETTA_GENERATED_PYTHON` placed generated code inside a larger Python program; a separate imports placeholder controlled where inferred imports appeared. January 2025 added explicit Bash handling and moved template-variable discovery into the backend.

The February syntax exposed a section's selected version, Python import path and runtime file path as `$section_name$version`, `$section_name$import_path` and `$section_name$file_path`. A Python section could import a function from another section, while a Bash section could launch its generated file. These references were resolved during code generation, distinct from reusable section templates and later AI prompt templates.

Evidence: [Bash composition](https://github.com/riteofstring/setta/commit/3d20845857cb1d2d333e341fd01780e81ad3f140), [backend discovery](https://github.com/riteofstring/setta/commit/22b1cda9d9d661b8d2d1cf50e9cc1d065609621d), [explicit metadata suffixes](https://github.com/riteofstring/setta/commit/cf5216d0388e49444b2a43cccb6a723438407da1), [original illustrated guide](https://setta.dev/old/docs/how_template_variables_work).

## 2025: reactive Python, chat, MCP, and the expanding workbench

### January–March: live artifacts and concrete applications

The interactive runtime increasingly treated inputs and outputs as named values passed to user functions. Results could stream back into the workspace, while drawings and file artifacts acted as inputs. Drawing gained undo and redo, and dropping files could create image or chart artifacts. Charts could combine multiple CSV sources, choose axes, and use row index when a source lacked an explicit horizontal axis.

The companion **setta-examples** collection showed what the programming model could support. These were application configurations and Python integrations, not models or services built into Setta itself:

| Example                        | What it demonstrated                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| StreamDiffusion image-to-image | A drawing or image input feeding a live image-generation loop, with outputs displayed beside the controls.   |
| TRL language-model fine-tuning | Configurable training components and arguments for a language-model fine-tuning program.                     |
| Transformers Trainer           | Dataset, model, Trainer, and related training configuration, including saved alternatives and result charts. |
| PyTorch Metric Learning        | Composition of embedding models, losses, miners, and training components.                                    |
| FLUX Fill                      | Image filling and related inpainting/outpainting experiments driven by editable inputs.                      |
| Groq API chat                  | A canvas conversation backed by user Python code calling an external model service.                          |
| SapientML AutoML               | A configurable interface around an automated machine-learning workflow.                                      |

The examples made the same broad point through different domains: controls could describe a program, artifacts could be both inputs and outputs, and the canvas could keep configuration and feedback together. Their third-party model, GPU, service, and credential requirements belonged to the examples.

Evidence: [preserved example collection](https://github.com/riteofstring/setta/tree/source/setta-examples/setta-examples), [fine-tuning example](https://github.com/riteofstring/setta/commit/c2c1e3005b8646f9ddeb4b0f6166e02c9f135c8a), [StreamDiffusion example](https://github.com/riteofstring/setta/commit/003797b855c46b8c1a919eb25148f862783e0e17), [example guide](examples.md).

### February–March: canvas chat and an application-level assistant

On February 23, **Chat sections** brought conversation directly onto the canvas. Chat-history artifacts represented messages, pending input, and returned responses. This could be a user-authored Python chat application: the section supplied the interface while the program supplied the model call and response logic.

A separate **project chat pane** developed in March. It added application-level conversation history, model selection, and provider configuration. Early history used browser storage before the later persistent backend implementation. An experimental LLM branch explored the same direction, but its existence should not be mistaken for an additional public product release.

The distinction matters: a canvas Chat section was one programmable surface among other sections; the project assistant was an interface for working on the Setta project itself. Both later acquired richer tool and agent behavior, but they did not begin as the same feature.

Evidence: [canvas chat](https://github.com/riteofstring/setta/commit/65ccfe429425509bf9d709bfdf616cd2ba2ca52e), [chat-history artifacts](https://github.com/riteofstring/setta/commit/339c16e3e9d80cfc3467271434fc94dff960ad43), [LLM experiment](https://github.com/riteofstring/setta/commit/f383021d7601ecbf4656f5f5e52c2f24f67011ea), [continuing project-chat implementation](https://github.com/riteofstring/setta/commit/bf10abdc4d15183a0400d9629659c2f77c41d1f2).

### March: presentation modes, notifications, and JSON-backed variants

The left pane gained persisted **Developer / User / Edit User View** modes. Users could hide sections while composing the user-facing presentation, and Overview respected that visibility. Notifications also became a persisted, dismissible history rather than an initial hardcoded list. These were separate from the backend-log viewer introduced in December.

On the right, JSON-source setup moved into individual version rows. A variant could switch between Python and JSON configuration and load its source values. The old InputAreaSettings panel was withdrawn as watched files and glob patterns changed the model. This was a relocation and redesign of file-backed configuration, not the disappearance of JSON support.

Evidence: [persisted presentation modes](https://github.com/riteofstring/setta/commit/1234bd4e7222f768a111d0a2c0577c60f8f7ba5e), [persisted notifications](https://github.com/riteofstring/setta/commit/a963e435d16fa49e337cf4c60c9a8c4915554f71), [per-variant JSON source](https://github.com/riteofstring/setta/commit/0179185a694527670ef484262d37b6d8bb62c4f6), [source loading](https://github.com/riteofstring/setta/commit/4caab49e8883484795180b6de21872f0a0794475), [old settings withdrawn](https://github.com/riteofstring/setta/commit/8abbfc65d36edb467a0a4dbb9e58979863399d7a).

### March–April: SettaListener and SettaChat

**SettaListener** turned live interaction into an explicit Python API. A program could subscribe to relevant interface changes, register callbacks, and emit artifacts back to the frontend. Instead of reconstructing a whole script for every slider movement, a long-lived process could respond to changing values.

**SettaChat** provided a corresponding programmatic path for chat-oriented interactions. User code could participate in the conversation surface rather than being limited to a one-shot text result.

This reactive architecture eventually supported full initial snapshots, incremental updates, dependency selection, callback scheduling, binary artifacts, and hot reload. Those later improvements should not all be dated to the first March implementation, but the API's purpose was already established: connect a running Python program to a changing workspace.

Evidence: [SettaListener](https://github.com/riteofstring/setta/commit/e99fb4c1fb7cfee63bffd66a8978d4326c8a71e4), [callback API](https://github.com/riteofstring/setta/commit/298f466ba3bb0ec09396b21106035c810e3957a6), [SettaChat](https://github.com/riteofstring/setta/commit/b2503fcecc7a4557e32230d0383297c27d8d45d7).

### April: MCP tools can operate the workspace

FastMCP integration appeared on April 6. The assistant could discover and invoke tools, receive tool results, and continue a streamed conversation. The important expansion was from discussing the project to changing it through named operations.

Over the following weeks, tools could create sections, choose callables, inspect code information, add parameters, change values, run code, and perform structural actions such as grouping, ungrouping, and moving sections. These operations exposed the same project concepts users manipulated visually.

The project-chat pane showed tool names, partial arguments, active calls and returned results alongside the conversation. Chat persistence moved into the backend. Streaming conversations recorded message and tool steps, stopping a run preserved partial history, and multiple chats could show independent activity states. The interface was becoming a workbench with ongoing assistant activity rather than a single request-response box.

Evidence: [FastMCP integration](https://github.com/riteofstring/setta/commit/5bd0161148fb1b28c0eb01dfab5afd74671f5225), [section-creation tool](https://github.com/riteofstring/setta/commit/074824b9723723320e53d2227b60a00b2bab611a), [parameter-value tools](https://github.com/riteofstring/setta/commit/b1750b1971fd89a8723f0267654ab20c770e3772).

### May–June: generated state, file tools, hosted projects, and sweep removal

May introduced generated state access through a Python class, commonly represented as **S**. Programs could address configured values through generated state rather than only through expanded constructor calls. Generation walked each eligible top-level section and its dependencies, emitting shared dependencies once and placing them before the sections that used them.

This began a shift from inserting generated Python through template variables toward importing a generated state module. The later `SettaState` class and `state` instance put configured values behind ordinary Python attributes; authored code could live around a protected generated body. January 2026 would add a separate metadata module describing the project, sections and selected variants. The [technology history](technology.md#from-template-variables-to-generated-state-and-metadata) follows that progression.

File tools allowed the assistant to view, create, replace, and insert text in project files. Generated-code prefixes and retrieval made those operations aware of the code produced by Setta, extending assistant work beyond the graphical model.

A separate **setta-saas** project explored deploying projects through Fly.io. Deployment creation, deletion, startup, and status formed an early hosted-project flow, with repository-based input developing further in the summer. This was a companion hosting experiment, not evidence that all historical local features were available through a mature hosted service.

On June 1, the old **parameter sweeps and run groups were removed**. Their UI and behavior were deliberately taken out. The later Python RunPlan system was a new design introduced in January 2026, not an uninterrupted continuation of the old sweep cards.

Evidence: [generated state](https://github.com/riteofstring/setta/commit/0c8758825ab766bd75227989915c5b889af38504), [dependency-ordered generation](https://github.com/riteofstring/setta/commit/fea01c019ebc43c0cd82cbec32c5582d3ca85f59), [hosted-project experiment](https://github.com/riteofstring/setta/commit/714290e028dcef6d83d5ac6649b8223b107e7b33), [sweep and run-group removal](https://github.com/riteofstring/setta/commit/e33715d454805045e7f1160c343a46e61181ad23).

### May–July: write around generated Python in the right pane

A **Generated Python Code** settings editor arrived on May 11 for authored prefix code; a suffix editor followed on July 20. Users could surround generated code with imports, setup and follow-on work. This was a real code-authoring surface in the right pane, with completion added to the prefix editor, not just a preview of generated output. December moved the same task into the canvas editor and removed this pane component.

Evidence: [prefix editor](https://github.com/riteofstring/setta/commit/406b8e30de59a005c6e7035f52ae869f1761d5f1), [prefix completion](https://github.com/riteofstring/setta/commit/03adfd99c6615212c491b742261a0131ddc10f1b), [suffix editor](https://github.com/riteofstring/setta/commit/6b78751453863f3b2bc41c34463fd959c4408abd).

### Summer–September: richer configuration models and watched artifacts

The project model underwent substantial changes during the summer. Section and code-object representations, implementation layers, presets, variants, and overrides separated shared configuration from a particular instance's choices. Much of this was internal restructuring, but its user-facing purpose was to make reusable components and alternate configurations coexist without copying every setting.

The parameter inspector reflected that redesign. By July it could select a reusable control implementation or create an instance-specific implementation and modifier. This rebuilt the existing widget editor around presets and overrides; it was not the first introduction of slider configuration.

The backend increasingly became the authority for typed project state. That mattered for synchronized editing, persistence, and assistant operations: a graphical action and a tool action needed to agree on the same section, argument, and variant identities.

This involved generated contracts as well as adding type annotations. May's Pydantic project/settings models supplied frontend schemas, TypeScript types and default-aware factories. Route signatures later generated endpoint calls; the Go migration changed the authoritative source again. The [typed-contract history](technology.md#typed-contracts-across-python-typescript-and-go) distinguishes this application infrastructure from user-facing Python generation.

External artifacts became more reactive. JSON sources and image or chart files could be watched, and updates outside the browser could refresh the corresponding surface. This expanded the earlier file-backed sections into an interface for data that other tools were actively changing.

Evidence: [working preset/implementation selection](https://github.com/riteofstring/setta/commit/6b452ca9f6d356c0effd222d8d8c241341009310), [artifact watching](https://github.com/riteofstring/setta/commit/75dc391356), [continued source-file watching](https://github.com/riteofstring/setta/commit/2e900b35d5), [later workbench source](https://github.com/riteofstring/setta/tree/source/setta-2025).

### October–November: two-way files and hot-reloaded Python

Code and text sections became more directly tied to canonical project files. File access could be read-only or writable, edits could be saved back, and external changes could be reflected in the workspace. The right-hand Code settings selected the canonical file path and Read & Write, Read Only or Write Only mode. This let Setta coexist with an ordinary editor instead of requiring every file edit to happen inside the canvas.

The listener system acquired a fuller synchronization model: an initial state snapshot, incremental dependency updates, explicit emitted results, and callback scheduling. Dependencies could distinguish live values from saved values. Programs could consequently choose whether to react immediately to an edit or to a committed configuration.

November added **hot reload** for listener code. A long-running interactive program could update its callback implementation as source files changed, while preserving the surrounding workbench interaction. It was a development loop built around running Python and live controls, separate from Watch Code's later job of creating callable cards from file definitions.

LLM configuration also became more general. Provider-independent abstractions and LiteLLM configuration supported multiple model providers, project-level presets, watched configuration, and selected models. The November settings editor exposed providers, endpoints, headers and models, then gained provider presets and reset. Its rendering in Overview was explicitly disabled on November 29, so that editor was not continuously exposed through the later snapshots. Streaming, reconnection, stop handling, and partial tool-loop histories improved continuity when a conversation was interrupted.

Evidence: [file synchronization](https://github.com/riteofstring/setta/commit/0f7b11670974fdaf4d3780a9a2ade1ca5c2f9794), [two-way text files](https://github.com/riteofstring/setta/commit/61fc3210ad), [code-file reload](https://github.com/riteofstring/setta/commit/150d894824), [listener hot reload](https://github.com/riteofstring/setta/commit/04435ec501efa94e6bb5ff4ee20109eafd004a14), [file-binding inspector](https://github.com/riteofstring/setta/commit/28143c0b256ff06998172ffd99ded23b18d8dd26), [provider editor](https://github.com/riteofstring/setta/commit/0a285e692387ae28315d880eeafaea209bc71206), [settings-pane withdrawal](https://github.com/riteofstring/setta/commit/6ef5a83830221565a1a0adb747a1f824d0dfe2b7).

### December: AI navigation, named views, and standalone controls

MCP integration expanded toward multiple external servers, live configuration, environment placeholders, and a searchable tool catalog. Tool discovery could expose a smaller relevant set rather than filling every interaction with the entire catalog. Chat context included stable identities for the sections and objects being discussed.

The direction also worked outward: a December 13 **stdio MCP bridge** let external assistants call Setta's workspace tools through its running backend. It relayed between stdio and the backend's SSE endpoint and retained the selected project configuration across tool calls. By February 2026, `setta tools` exposed tool schemas and `setta api` invoked named operations with JSON arguments. An assistant could operate Setta from outside its built-in chat, rather than merely edit files that Setta might later read. Sources: [stdio bridge](https://github.com/riteofstring/setta/commit/a1a25f079792a6faa9d9b38e347eaaf6e3e054ea), [CLI tool interface](https://github.com/riteofstring/setta/blob/eabd8f56e9273148d3cd771860dc290ca191255d/backend/setta/start.py).

**Follow AI** connected assistant activity to the canvas. When a tool operated on identified sections, the interface could pan to and highlight the affected content. This made an assistant's actions easier to follow in a spatial project.

Named **view modes** replaced March’s single Developer/User/Edit User mode on December 20. The left Views pane could create, rename and delete these presentations. Named views controlled which sections were visible. A project could present a focused subset for one task and a different subset for another. Later work extended views to carry separate layouts; the first December boundary was primarily about named presentation and visibility.

**Meta controls** made a single parameter into an independent canvas section. Sliders, rotary-style sliders, switches, text inputs, colors, dropdowns, buttons, and later other input types could serve as the front panel of an application. A control no longer needed to remain a row inside a large callable card. Its header could be minimized or hidden according to the presentation, and its value participated in live state.

Buttons introduced event-oriented behavior: pressing one could trigger an action without pretending the click was a durable scalar value. This distinction later mattered for listeners and dropzones as well.

The end of December also began a new **share-deployment** model based on project snapshots and isolated sessions. This was separate from the earlier setta-saas project.

Evidence: [Follow AI](https://github.com/riteofstring/setta/commit/7c29be57c70eaabdf9de08dd11c80d0b673c4116), [named view modes](https://github.com/riteofstring/setta/commit/57e438be1714f12cde879c5eaf04e67da397ca07), [meta-control sections](https://github.com/riteofstring/setta/commit/e08f15a8a646ef2ad58b55b685308fb4f2d30f9a), [live meta-control state](https://github.com/riteofstring/setta/commit/256f31e1d10fb2afe42a446d6022873beb606553), [button actions](https://github.com/riteofstring/setta/commit/3d4e88186dc714c4e7479b92b77941c6afc632f3), [share deployments](https://github.com/riteofstring/setta/commit/8b4ee8d7122b0efb2fa59efd597b1ceefffcb4d0).

### December: Custom Runs and logs arrive; generated-code editing returns to the canvas

The left **Backend Logs** pane arrived on December 14, with retention, filters and unread error indicators. **Custom Runs** followed on December 20: create a named entry from a code block, choose once or continuous execution, and decide whether it appears in the main Run dropdown. This interactive launcher was distinct from January's detached RunPlan API.

On the same day, the generated-code settings component was deleted. Authored prefix and suffix code moved into the canvas **Code** editor around a protected generated region. Users could now read and edit the whole program together instead of dividing that work between the code card and its inspector. December 27 also gave standalone Meta Controls their own settings and added audience-friendly parameter names alongside descriptions.

Evidence: [backend logs](https://github.com/riteofstring/setta/commit/7a3f3a9ac2345bb0a6ef0fd674b3921e8b1fbe40), [Custom Runs](https://github.com/riteofstring/setta/commit/8bcd1a8da108e7bf566607f1e0300dfd06115a97), [move authored code into the canvas editor](https://github.com/riteofstring/setta/commit/60884cb8f0a0ce2fa96e550487c0191f6d53159a), [Meta Control settings](https://github.com/riteofstring/setta/commit/deae8a19f6decadd09ffe7e4e8929059a9ece41d), [friendly parameter names](https://github.com/riteofstring/setta/commit/e006820db954ece89bccd8557baf2901747f5be9).

## January 2026: a programmable workbench and a new experiment runner

### Share deployments and per-session interaction

Sharing developed around a frozen project deployment with its own name and configuration. The routing model changed during January, including an early version-bearing route that was subsequently simplified. The lasting feature was the distinction between editing the original project and interacting with a deployed snapshot.

Shared sessions could have their own terminal and state behavior. Policies controlled which values or file-backed controls could change. The shared interface did not simply expose the whole IDE: structural editing, editor access, and general assistant operations were restricted according to the deployment mode. This allowed a project to present an application-like surface while keeping its authoring environment separate.

Evidence: [named share deployment](https://github.com/riteofstring/setta/commit/2eba48c6436edaec29908d37412cd7bafaf4bd23), [route simplification](https://github.com/riteofstring/setta/commit/fd0fb5b2ac).

### SettaRunner and RunPlan replace the old sweep design

The new **SettaRunner** API launched detached runs from Python. It exposed a summary of sections, variants, and parameters so callers could resolve readable names to stable identities, then construct explicit run overrides.

**RunPlan** supported several ways of expanding an experiment:

- Cartesian grids over parameter choices.
- Zipped parameter choices, with matching lengths.
- Seeded random selections.
- Repetition of a plan.
- Alternative section variants and project configurations.
- Per-run tags and explicit parameter overrides.

Runs used snapshots of the selected configuration and runtime/code inputs according to the supported snapshot policy. They reported queued, running, exited, failed, canceled, or lost states, retained output and metadata, and could be canceled. Parameter override strings followed the same value conventions as the UI. Code-generation-disabled entry sections could run authored Python or Bash rather than forcing a generated program.

This system was programmatic and detached. It did not restore the deleted 2024 sweep and run-group cards, and detached execution was not generally available inside shared deployments.

Evidence: [runner introduction](https://github.com/riteofstring/setta/commit/ba758e7e090536356f67a1bd787db14c9f11d83f), [runner API source](https://github.com/riteofstring/setta/blob/eea7fb38c8/backend/setta/api/runner.py), [historical run-plan reference](https://github.com/riteofstring/setta/blob/eea7fb38c8/docs/reference/param-sweeps.md).

### January 11–18: author data ports and nested file paths

The right Section Config editor made data connections explicit. Users could choose which parameters appeared as input ports and author ordered output accessors, with completion for the accessor expressions. These described a section's data interface; they were separate from the later workflow-edge inspector's execution rules.

The same settings area gained a JSON-source path editor with validation, refresh feedback and rollback on failed changes. A section could expose a nested part of a file without replacing the entire JSON object.

Evidence: [data-port editor and backend operations](https://github.com/riteofstring/setta/commit/32f7197ef22dd3fce314e5a8c6ccd67a8ea4aa89), [JSON-path editor](https://github.com/riteofstring/setta/commit/204340a8ca9d64faddbdfb9a3c6d1c2fe0a8ce6a), [refresh and rollback](https://github.com/riteofstring/setta/commit/c6ff4833a173f5477ab8b8fc4c6fccd9828d934d).

### January 17: Custom Runs takes over code-generation setup

Custom Runs gained the code-generation target toggle, generation policy and snapshot choices alongside its once/continuous launch entries. The older whole-project GUI/YAML editing mode was removed. That removal did not end external YAML/TOML file-backed values, which had a different role.

Evidence: [move target toggle into Custom Runs](https://github.com/riteofstring/setta/commit/98ff6b6f24e18e6840edceb0743c1a2a205554f9), [generation policy](https://github.com/riteofstring/setta/commit/fcb042edc5fabff913a8e2b1e03f6cd1044045a9), [remove GUI/YAML mode](https://github.com/riteofstring/setta/commit/947b480d8ab49407b68fa03c7aaa9f68bda2522a).

### January 17–25: generated metadata and customizable output defaults

Generation policies let users choose eligible section and control types, override inclusion for individual sections and select supported value representations. Type defaults could be overridden for a particular section or parameter. The later January modes distinguished expressions, strings, parsed JSON, file paths and file reads; a drawing could provide an image path instead of immediately reading its contents. These were output-generation choices, separate from changing a slider's default value.

Optional meta-generated code in `setta_gen_meta.py` exposed project identity and section metadata, including paths, parents and selected variants. A dedicated generated-metadata section appeared on January 18. Runtime code could inspect the metadata through `state.__state__` alongside generated values. This feature was distinct from the Meta Control section type.

Evidence: [policy and metadata](https://github.com/riteofstring/setta/commit/b7a93c84a2258dd08c28e7deb68d1c6e919d80bd), [metadata section](https://github.com/riteofstring/setta/commit/a6339d695e28ffefb4e6c81e482a95e6cf6eabc2), [representation modes](https://github.com/riteofstring/setta/commit/3189679ae8439e45e9118bc83a237f45f0b518d2), [later generated-code contract](https://github.com/riteofstring/setta/blob/eea7fb38c8fdb452766d06b08610248e2962c4fc/docs/reference/codegen-section-policy-and-metadata.md).

### External coding agents and richer chat execution

The agentic runner integrated external coding-agent systems, including Claude, Codex, and OpenCode paths. A new **Project AI Settings** pane on January 18 managed API keys, named profiles, reusable prompt templates and external-agent adapters. Profile wiring connected system prompts, models, tool allowlists and memory scopes to actual chat execution. Adapter settings supplied commands or base URLs, working directories and sandbox/approval choices. This replaced the limited 2025 provider editor with a broader agent-configuration surface. Tool activity and reasoning-related status could stream into chat, and approval requests became part of the conversation lifecycle.

The adapters evolved during the month, including a move toward the Codex app-server integration. These were backend-dependent workbench features. They should not be attributed to the present React library merely because it can display a chat surface supplied by a host application.

Evidence: [agentic runner](https://github.com/riteofstring/setta/commit/836cb0ba72152f069190f532ad6c365b305eefb2), [new AI settings pane](https://github.com/riteofstring/setta/commit/cb1bf595541dfe31173ce9554aa1faf9832221c1), [profile/prompt execution wiring](https://github.com/riteofstring/setta/commit/6372875f20def48fc801f43b7afa2fc9545a3074).

### Code files, source-backed values, and Watch Code

A file explorer exposed code files alongside the canvas. Files could be edited as ordinary sources, including non-runnable languages. Code-generation targets and their enabled state became explicit.

External structured sources expanded from JSON to YAML and TOML, with nested keys and JSON-compatible values. These file-backed values survived the removal of the separate whole-project GUI/YAML mode.

**Watch Code** connected source definitions to callable sections. Watching selected Python files or folders could detect new top-level functions, async functions, and classes, create their callable cards, and update parameters when signatures changed. Renames could preserve parameter state. Deleted definitions could remove corresponding generated entries, while syntax errors were handled without treating an unparseable file as proof that all its definitions had disappeared. An initial baseline avoided flooding a project with unwanted cards from every existing definition.

By the spring, Watch Code was a provider-based plugin with explicit prerequisites, including Python generation and an appropriate language-server setup. Its purpose remained distinct from listener hot reload: Watch Code synchronized the visual representation of code; hot reload changed the implementation of a running callback.

Evidence: [GUI/YAML mode removal](https://github.com/riteofstring/setta/commit/947b480d8a), [code explorer](https://github.com/riteofstring/setta/commit/a2444de42201253b7e05f4ca06869474c65fc57f), [YAML/TOML sources](https://github.com/riteofstring/setta/commit/41bb0ed637), [Watch Code](https://github.com/riteofstring/setta/commit/8786063d529c8517cb6df4f8687d010d9002dd27), [rename preservation](https://github.com/riteofstring/setta/commit/aac08321ebd9eb8a37fe293f703650762625bc5e).

### Passwords, dropzones, media, and presentation controls

Password controls gained runtime secret storage rather than embedding the secret in ordinary project state. The UI could report that a secret existed and request a reveal when appropriate. Shared presentation restricted revealing secrets, and copying a control was not intended to copy its saved secret as ordinary document data.

Dropzones accepted files or other input under configured type and size policies. They could represent retained state or emit a transient event. A server-side picker complemented browser uploads, and attachments could feed chat or interactive code. Media surfaces expanded to carousels and previews for images, audio, video, and text.

On January 25, **chat attachments** connected file selection and message previews to the project assistant, canvas chat, the Python chat toolkit and external-agent adapters. Image attachments could reach a vision-capable model as image content; text files could supply their contents. This enabled asking about an attached chart or screenshot instead of transcribing it into the prompt. Support still depended on the selected model and adapter.

View tabs, URL synchronization, startup defaults, and keyboard focus handling made the expanding workbench easier to enter and navigate. Parameter editing included multi-selection, reordering, indentation, outdentation, and movement between groups. Language diagnostics gained controls for ignoring or muting findings and refreshing information for unresolved callables.

Evidence: [runtime password storage](https://github.com/riteofstring/setta/commit/8041d86298), [server-side file picker](https://github.com/riteofstring/setta/commit/fc2dabc56e), [chat attachments](https://github.com/riteofstring/setta/commit/144787457d), [media carousel](https://github.com/riteofstring/setta/commit/b3bf197f37), [view defaults](https://github.com/riteofstring/setta/commit/599bd8c818), [historical meta-control reference](https://github.com/riteofstring/setta/blob/eea7fb38c8/docs/reference/meta-controls.md).

## February 2026: applications, remote workspaces, plugins, and specialized sections

### Branched conversations and explicit AI access edges

Editing an earlier message could create a chat branch, and branches could themselves branch. Conversation history became a navigable set of alternatives rather than one mutable linear transcript.

**Agentic edges** made section access visible on the canvas. A section-to-chat relationship granted context/read access; chat-to-section relationships could grant read/write access; chat-to-chat relationships exposed peer context. Context could be represented by references, excerpts, or cached summaries. These edges were separate from Python value dependencies and from the workflow-control edges introduced later.

Stable identities, duplication remapping, cleanup when endpoints disappeared, and Follow AI highlighting helped the visual relationships remain meaningful as a project changed.

Evidence: [chat branching](https://github.com/riteofstring/setta/commit/165ad31a57b7bf43e977aebc87075c962587a204), [nested branches](https://github.com/riteofstring/setta/commit/ec331e59377643afbff33271aad10d0996f0a449), [agentic edges](https://github.com/riteofstring/setta/commit/2468b2d36433e138d3e4c52b6abc790c4886d3a6), [edge semantics](https://github.com/riteofstring/setta/blob/eea7fb38c8/docs/reference/agentic-edges.md).

### App mode: turn project state into an application interface

**App mode** introduced a state-backed application specification. An application could arrange catalog components using containers, boxes, grids, spacers, theme tokens, responsive choices, and motion-related presentation. A draft could be previewed and validated before being saved.

Assistant-driven app-spec generation and streamed patches made this another destination for AI editing. Saved templates and skills supported reuse. This was an application-building subsystem inside the workbench, not the same thing as the later reusable Workspace library or the Setta 4 artifact-rendering experiment.

Evidence: [App mode](https://github.com/riteofstring/setta/commit/bc0989e379aca4581368bc5104ac45786161bd19), [app-spec generation](https://github.com/riteofstring/setta/commit/cf9fe3fbe4d4bd9dc167a79cf45338ddadcd0a7c).

### Remote workspaces, Git inspection, and plugins

SSH support allowed the workbench to connect to remote workspaces, with workspace switching, remote roots, launch/status handling, and tunnels. This extended the local-development model to code and environments on another machine.

A Git surface exposed repository status, diffs, history, and a graph-oriented view. Syntax-aware diffs and paged history made it useful for inspecting a project alongside its controls and chats. These checkpoints establish inspection features; they are not a claim that every possible Git mutation was implemented.

Plugin management made extension points explicit. Plugins could contribute frontend sections, navigation, settings, backend routes, code-generation behavior, listener behavior, and state-host integrations. A CLI and package/source management supported installation and discovery, with capability and trust boundaries. First-party features were later moved behind the same plugin model.

Evidence: [SSH workspaces](https://github.com/riteofstring/setta/commit/ae708854b1fc5d9db79966ebdabbf9f0f43835c4), [Git inspection](https://github.com/riteofstring/setta/commit/d95c966bd0dbeedb0e4d421391434569db9f3ed9), [plugin management](https://github.com/riteofstring/setta/commit/7beab4e61d4fe3e6cc928faae0c7a369ac45d7d9), [plugin CLI](https://github.com/riteofstring/setta/commit/d768b4e425f441909dc99acf510fc359f4d10c22).

### February 7: restore a backup without losing the previous project

Automatic backups became enabled by default, with a five-minute interval and ten retained backups for default settings. The CLI could list backups and restore the latest, a numbered entry or an explicit path. Before replacing an existing project file, restoration preserved it under a separate `restore_stash_` filename that ordinary backup retention did not prune. It also refused an apparently running workspace unless explicitly overridden. This was a recovery path for project data, separate from autosave and undo.

Evidence: [defaults, listing, restoration and stash preservation](https://github.com/riteofstring/setta/commit/4924b708e09d380a305605bc8b4d01535e01b03f).

### February 15: assistants can find and reveal settings

Settings tools added another kind of navigation. `search_ui_settings` found registered settings by natural-language query; `get_ui_setting_value` and `set_ui_setting_value` read and validated their values. `reveal_ui_setting` opened the appropriate side pane and tab, scrolled to the control and briefly highlighted it. A write could request the same reveal afterward.

The initial registry covered Watch Code, App configuration and parameter display names, with plugin extension points. It did not promise access to every setting. Unlike Follow AI's navigation between canvas sections, this path could lead a person to a control inside a side pane.

Evidence: [setting registry, tools and reveal pipeline](https://github.com/riteofstring/setta/commit/eabd8f56e9273148d3cd771860dc290ca191255d).

### Spreadsheets, task boards, date/time controls, and dictation

Specialized data surfaces and project tools widened the range of work that could stay in the application:

- **Files became an editor.** Its February 14 spreadsheet surface opened CSV, TSV, XLS and XLSX, edited cells, added rows and columns, and saved with modification-time checking. This was separate from the later canvas Spreadsheet section, whose presentation included sorting and filtering.
- **Task boards** offered task-list and Kanban presentations, then became a dedicated section type alongside Spreadsheet.
- **Date and time controls** supported input and display modes, including calendar-style selection and 12/24-hour presentation.
- **Dictation** added speech-to-text input, with provider and streaming behavior evolving afterward.
- **Skills and MCP browsing moved into Project Chat** on February 14, out of App configuration. This viewer listed discovered instructions, server configurations and tool availability; it did not yet provide enable/disable controls. Custom skill authoring and rendered/raw Markdown editing followed on March 1.

Clock and Calendar sections briefly existed, then were removed the following day as date/time behavior moved into the appropriate text/meta-control forms. They should be recorded as a short-lived design, not as permanent members of the section catalog.

Chat added queued drafts, editing and dispatch of pending messages, richer activity status, and visibility into reasoning, compaction, tools, and context usage. Desktop launcher packaging covered the major desktop platforms. Saved views gained separate layouts, extending December's visibility-based views into distinct arrangements of the same project.

Evidence: [spreadsheets](https://github.com/riteofstring/setta/commit/69e253ded2b29963f7023a46346041651868fc28), [task-list/Kanban modes](https://github.com/riteofstring/setta/commit/67c7b3d9cd0fe1ecca0ac09df70ed3090a93bb68), [dedicated section types](https://github.com/riteofstring/setta/commit/8d8729e5aa4598b27041925f0b73862a94f2f6e2), [Clock/Calendar removal](https://github.com/riteofstring/setta/commit/d7a63e1f68c7a839587990414f5676ec5b51c490), [date/time controls](https://github.com/riteofstring/setta/commit/01d3c59cf2b960e129c5dea4584ffe137f1e81b1), [dictation](https://github.com/riteofstring/setta/commit/e46c1267f27aac4e2b8c085c1875aa7f4c4e1de0), [per-view layouts](https://github.com/riteofstring/setta/commit/3383f5a22c27ff02367076376b5c7db71206b3d0).

The new project tools had distinct entry points: the [App editor](https://github.com/riteofstring/setta/commit/d5d00bd1e244f1d178bf5d506a5da1a3b12b6882) edited live specification JSON, with separate [theme/assets editors](https://github.com/riteofstring/setta/commit/25b6768ac81b2185382b0d9fd87ec9a0d624f2b6). The [Plugins pane](https://github.com/riteofstring/setta/commit/f2530503ff307534cca1b95e9cb9dd13ee6a08ec) managed extensions, which could [register their own panes and commands](https://github.com/riteofstring/setta/commit/734b413977bfaeb1a72f721174e35bc345be56ee). SSH connection setup belonged to the workspace-switcher modal. The [Skills/MCP relocation](https://github.com/riteofstring/setta/commit/87a7e13d8c28928ecd862c64b84a8ac42fd53410) made chat the home for agent-related discovery.

## March–May 2026: workflows, windows, and the Setta 2 backend transition

### March 1: author skills and reusable slash commands

Following February’s read-only viewer, the project chat's **Skills / MCP / Slash Commands** browser developed into an authoring surface. Users could create custom skills, edit and save their Markdown, and switch between rendered and raw views. The browser also identified skill sources and activity. MCP entries exposed configuration-file locations, transport/endpoints and runtime status. Custom slash commands associated a name with reusable prompt text and a submission mode.

Evidence: [custom skill authoring and rendered/raw views](https://github.com/riteofstring/setta/commit/71417d5cf6fc4a7da7049a648a35f133e8422638), [custom slash commands](https://github.com/riteofstring/setta/commit/84b5c7926c84e161de12ef485ea8a890a758e91c), [combined browser](https://github.com/riteofstring/setta/blob/eea7fb38c8fdb452766d06b08610248e2962c4fc/frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx#L1250).

### February–March: chat gathers its threads, settings and reusable instructions

A resizable inline thread list appeared beside the conversation in February. Engine/model choices persisted, conversations could continue across engine switches, and deleted threads had local undo. On March 1, Skills, MCP, Slash Commands and AI Settings became auxiliary views inside Project Chat; the old standalone AI-settings tab state routed into chat. This changed the organization of the pane again, after January’s standalone configuration editor.

March added drafts that survived reload, restored waiting history, and search that navigated individual occurrences. These controls supported ongoing work across several conversations, not just sending a single prompt. Transcription profiles and completion checks also belonged to the later settings surface; they are not evidence that those managers existed in the 2025 API-key pane.

Evidence: [inline thread list](https://github.com/riteofstring/setta/commit/baff6bfcc56685bd2dcf3d03737c62b6ec73887a), [auxiliary views](https://github.com/riteofstring/setta/commit/75357af8f8a40b85f93f9164b93209646a198145), [retire standalone AI-settings entry](https://github.com/riteofstring/setta/commit/a900e1a31c21f1d0ae55189d42a8781f3ef84b27), [persistent drafts](https://github.com/riteofstring/setta/commit/b57794be1fdaa8df40441f5fdcc678f2f022b9a4), [search occurrences](https://github.com/riteofstring/setta/commit/21c64590a582d692949e66cb9a740534a1bc5fe9), [later settings managers](https://github.com/riteofstring/setta/blob/eea7fb38c8fdb452766d06b08610248e2962c4fc/frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx).

### Linked chats and executable workflow graphs

Linked peer chats allowed one conversation to request bounded work from another and receive a text result. The early implementation limited delegation depth rather than treating the graph as unrestricted recursive agent spawning.

The **Workflow** system added an explicit control-flow graph. Its section types included Start, End, Gate, and Chat. A valid runnable group needed one Start and at least one End; an incomplete graph could remain a draft without being executable.

Selecting an edge opened the right **Workflow Edge** inspector rather than the selected-section settings. Its source/target, trigger, signal filter, action/prompt, thread strategy and permissions made the connection itself editable. The left Custom Runs pane supplied start, stop and reset.

Edges and gates expressed more than visual relationships:

- Completion, failure, and signal conditions could trigger downstream work.
- Payload matching and activation counts refined those conditions.
- AND, OR, and XOR gates combined incoming activation.
- Loop and activation limits bounded repeated dispatch.
- Chat steps could send a prompt or reset a thread, with choices about continuing or starting fresh.
- Start, stop, and reset controls managed runs and propagated to child activity.
- Progress and edge state exposed satisfied, blocked, or failed paths.

**Prompt sections** supplied reusable templates, including a source for workflow dispatch. Changes to templates affected rendered prompts, and referenced prompts had deletion guards. This was a third graph meaning alongside data dependencies and agentic access: it represented execution order and conditions.

Evidence: [linked peer chats](https://github.com/riteofstring/setta/commit/f347b886ac7f4273b220e57bbce30360955c4efd), [workflow editing](https://github.com/riteofstring/setta/commit/8d9b5b5fba1375648fd8ca75e101956e0d1dd0ed), [workflow dispatch](https://github.com/riteofstring/setta/commit/d4c99108f3267bcd64a88653f0b4589b406d08fb), [gate execution](https://github.com/riteofstring/setta/commit/1f435b942c7d2860b368f34d91cf6fe1cd7becea), [Prompt sections](https://github.com/riteofstring/setta/commit/f45ac534938934bc01d01fd42a8bbda006612252), [workflow reference](https://github.com/riteofstring/setta/blob/eea7fb38c8/docs/reference/state-machine-workflows.md).

### Floating windows and Window Spaces

From March 7–8, project chat and Git Graph could move into floating or docked windows. Git also gained worktree status inspection on March 14; this exposed branch/HEAD and current/prunable information without establishing stage, commit, push or worktree-creation controls. Window management separated the tool's content from its placement: a conversation or Git view did not have to remain in one fixed sidebar.

**Window Spaces** saved arrangements of windows, with dedicated views for reopening an arrangement. This was separate from a canvas view, which chose and arranged sections. A project could therefore have both a canvas presentation and a window-based working environment.

Evidence: [window-space and dedicated-view work](https://github.com/riteofstring/setta/commit/f75bef87614f0651b15af57e16117dd60522ae7b), [Git worktree inspection](https://github.com/riteofstring/setta/commit/d9af2238e2882db639af2f07eb646f1c8409ea04).

### Go becomes the workbench backend; Python remains a runtime

March introduced a Go backend and moved core workbench ownership toward it. State, routes, execution coordination, and other services increasingly used the Go implementation. Python remained important for generated programs, SDK APIs, listeners, and plugin workers. The March transition was not the removal of Python support.

During the spring, first-party subsystems moved into plugins. Python language-server integration included basedpyright and ty-related work, App mode acquired a plugin runtime, and Watch Code became a first-party provider. Users could enable a capability through a more explicit extension boundary instead of assuming every subsystem was inseparable from the core application.

The [May 10 workbench checkpoint](https://github.com/riteofstring/setta/tree/eea7fb38c8fdb452766d06b08610248e2962c4fc) is a useful source for the combined feature set: Python composition, live listeners, detached runs, files, artifacts, agent chats, MCP, plugins, workflows, App mode, remote workspaces, and managed windows.

Evidence: [Go backend transition](https://github.com/riteofstring/setta/commit/1db3317abf1d6fdcb288f67649c0f2744ea01018), [Go-first source transition](https://github.com/riteofstring/setta/commit/69a785fc79), [Python language-server plugin work](https://github.com/riteofstring/setta/commit/116d58f830), [App plugin runtime](https://github.com/riteofstring/setta/commit/028c2d3731).

### April–May: experimental WebGPU and CanvasFlow renderers

These were implemented rendering experiments aimed at making large, editable workspaces easier to move through. **GPUFlow** began with a WebGPU device and frame-scheduling foundation, then composed cached HTML textures, retained parameter surfaces and GPU-drawn visuals. By the May 24 architecture checkpoint, browser-owned editors and native controls used projected DOM controls or DOM islands, coordinated with the displayed frame.

**CanvasFlow** explored a separate HTML-in-Canvas path. Its WebGL renderer uploaded changed visible nodes as textures, cached them within a memory budget and drew edges on the canvas. Pan and zoom could reuse those textures. Browser capability checks selected the WebGL texture path where supported, with a 2D renderer otherwise. The preserved validation report still identified gaps in pointer-created edges and box selection.

Both paths relied on experimental Chromium HTML-in-Canvas APIs. Their presence does not establish cross-browser support, a general performance guarantee or inclusion in today's package. The [technology history](technology.md#experimental-workspace-renderers-webgpu-and-canvasflow) explains the architecture and interaction tradeoffs.

Evidence: [WebGPU foundation](https://github.com/riteofstring/setta/commit/07b1e718a14a216e3cabd071ffa249bc3a073fff), [May WebGPU architecture](https://github.com/riteofstring/setta/blob/964a673e38711afdece6e1a1ae05b241f31847d2/docs/reference/html-in-canvas-architecture.md), [CanvasFlow WebGL selection](https://github.com/riteofstring/setta/commit/70fedb48b442c91a6dc0d3100ca339522dc2fde7), [CanvasFlow validation and remaining gaps](https://github.com/riteofstring/setta/blob/70fedb48b442c91a6dc0d3100ca339522dc2fde7/perf/reports/frontend/2026-04-28_canvasflow-webgl-default-promotion.md).

### May 30: compact nodes move whole forms into Contents

A later Setta 2 layout experiment changed the division of work sharply. **Callable** and **Dict** sections stopped displaying their full argument/value forms on the canvas. They became compact title-and-icon nodes with data-edge ports. Selecting a single node opened its actual editable form in a new right-hand **Contents** tab; other section kinds kept their ordinary surfaces.

The follow-up changes gave compact nodes their own presentation and removed duplicate connector handles from the pane. Default automatic project-chat creation was also disabled, making the side-pane entry the starting point for Project AI. This was not just another settings tab: the primary form itself had moved out of the canvas.

Treat this as a dated layout experiment. A subsequent synthetic History transition changes the source baseline; it does not establish an authored rollback or prove that this presentation continued into the August library.

Evidence: [move Callable/Dict contents](https://github.com/riteofstring/setta/commit/5eb3e92e2d8fd9c3b15e8cc829cc225abee36c25), [compact node surface](https://github.com/riteofstring/setta/commit/8a7f98ee2e6033b04963904cb8aa91ce5451cdb8), [hide pane connector handles](https://github.com/riteofstring/setta/commit/795ede4c1a987b2acb15430c4dcddd48d92e2d55), [final May 30 presentation](https://github.com/riteofstring/setta/commit/94dcef790b304b9dc2b456c18dcbd4b45de6988c).

## Late May–July 2026: the Setta 3 experiment

Setta 3 was a separate application experiment centered on agent conversations and workspaces. It used an Electron shell, a Go backend started with the application, a TypeScript renderer, and Codex integration. It should be read as a branch of the product's exploration, not as a simple upgrade that inherited and replaced every Setta 2 feature.

The [restored July 11 captures](features/libraries-and-detours.md#summer-2026-two-agent-workspace-experiments) show actual local-model workspace use and an Easy Button run in progress, plus an authored semantic graph and a validated workflow draft. These captures establish selected behavior; they do not verify every source capability described below.

### Late May: local workspaces and an agent conversation shell

The initial application established workspace lifecycle and chat execution, then added queued messages and steering of active work. Model and permission menus, slash commands, attachments, search within chat, sidebar search, pinned messages, notifications, logs, and rule creation made it a usable conversation-oriented environment.

Panes could be resized and maximized, with top/bottom arrangements and a four-pane grid. Dynamic tools and an authenticated backend interface gave agent activity access to application operations. These features pursued a different starting point from the older callable canvas: begin with ongoing agent work, then organize its context and outputs.

Evidence: [initial application](https://github.com/riteofstring/setta/commit/dd4b58e616), [workspace lifecycle](https://github.com/riteofstring/setta/commit/35ac804d45), [chat](https://github.com/riteofstring/setta/commit/17d03d6d09), [queue and steering](https://github.com/riteofstring/setta/commit/aa5d223221), [four-pane layout](https://github.com/riteofstring/setta/commit/d23b3e0593), [dynamic tools](https://github.com/riteofstring/setta/commit/79e979094f).

### June: a scrolling pane workspace

The layout evolved toward a **Niri-inspired scrolling and tiling workspace**. This referred to the interaction model, not an integration with the Niri operating-system compositor. Users could arrange and move through panes, adjust widths, reorder them, maximize a focus area, and enter an overview.

The pane catalog combined agent chat, canvas content, terminals, Git views, and embedded browser content using Electron WebContents. Overview work used snapshots and different levels of detail to navigate many panes without showing every live surface at full detail. Persisted dimensions and placement preserved the user's arrangement.

Mobile-oriented work added a full-screen active pane and compact bottom controls. It was an adaptation of the same workspace concepts to a smaller screen, rather than proof that every desktop integration had a mobile equivalent.

Terminals became managed sessions with profiles, lifecycle controls, and checks before closing busy work. Later changes supported background agent terminal activity, duplex streaming, snapshots, and controlled writes through the CLI.

Evidence: [mobile pane presentation](https://github.com/riteofstring/setta/commit/3a9be9484e), [preserved Setta 3/4 application snapshot](https://github.com/riteofstring/setta/tree/milestone/2026-07-setta-4-graph).

Part of this pane and navigation work later became [Onirigiri](https://onirigiri.dev/), a reusable React window system with tiled columns, keyboard navigation, resizing, overview and serializable layouts. Applications supply the pane content. This continuation of Setta 3's spatial interface is separate from the Setta 2-derived `@riteofstring/setta` library; it does not carry over every agent or workflow service. See the [Onirigiri repository](https://github.com/riteofstring/onirigiri) and [visual comparison](https://setta.dev/features/#f-onirigiri-continuation).

### June: another workflow engine and a semantic context graph

Setta 3 developed its own Go workflow orchestrator. Codex action nodes, typed routes, approval handling, liveness checks, SQLite persistence, and recovery supported longer-running work. The editor exposed nodes and edges, while run detail, cancellation, and history made execution inspectable. This was a separate implementation from the Setta 2 Start/End/Gate canvas system.

A **semantic graph** and **cartographer** experiment attempted to make agent context visible. It derived a graph from recorded agent activity, attached source evidence, and let a user inspect or choose working sets for subsequent context. Context compilation and steering connected the graph back to future work. Runtime markers and activity pulses distinguished active work from the accumulated map, while model and budget settings governed the extraction process.

The graph was an interpretation and organization of recorded activity, not direct access to a model's private internal reasoning. Source links and explicit provenance were important because a derived summary could differ from the raw event that supported it.

Evidence: [workflow orchestration](https://github.com/riteofstring/setta/commit/ddc42af5ca), [Codex workflow actions](https://github.com/riteofstring/setta/commit/e4394be4f1), [SQLite workflow persistence](https://github.com/riteofstring/setta/commit/47dbe9bee6), [workflow authoring](https://github.com/riteofstring/setta/commit/484f1c816b), [run history](https://github.com/riteofstring/setta/commit/68616a46d1), [semantic graph](https://github.com/riteofstring/setta/commit/1ee22e13e8), [evidence capture](https://github.com/riteofstring/setta/commit/47bd2b8f91), [graph editing and steering](https://github.com/riteofstring/setta/commit/c0a79e1cf4), [context compilation](https://github.com/riteofstring/setta/commit/3af6168fb6).

### Late June–early July: transcripts, remote runtimes, and a web client

The conversation surface increasingly combined user and assistant messages, tools, and background activity in chronological order. Codex history and goal commands, image attachments, MCP activity, and permission settings expanded the supported interactions.

A runtime picker distinguished local and remote execution. Device authentication and pairing, known-runtime identity, and CLI commands for serving and pairing runtimes supported connecting an interface to a separately running backend. A web/PWA client could be served by the Go binary, and web-push work explored notifications outside the desktop shell.

Remote setup experiments included an existing machine over SSH, AWS quick creation, an OpenTofu-based setup kit, and Tailscale-assisted pairing or reachability. These were bring-your-own-runtime and provisioning flows, not an assertion that Setta operated a universal managed cloud.

The CLI also exposed application operations: read and change workspace layout, open or close panes, focus content, read and send chat messages, queue or steer work, inspect terminal snapshots, and manage workflow definitions and executions. This made the application scriptable in addition to being directly interactive.

Evidence: [Codex goals/history](https://github.com/riteofstring/setta/commit/ad743c42c6), [image attachments](https://github.com/riteofstring/setta/commit/40c6e3b324), [runtime pairing](https://github.com/riteofstring/setta/commit/490b734683), [runtime CLI](https://github.com/riteofstring/setta/commit/388d136f45), [web/PWA client](https://github.com/riteofstring/setta/commit/d46f6b7dcd), [web push](https://github.com/riteofstring/setta/commit/06698f7e29), [remote setup work](https://github.com/riteofstring/setta/commit/ea44bac87d).

### July: Easy Button, topic conversations, and narrated progress

The **Easy Button** experiment simplified the surface for initiating and following work. Agent execution still had a lifecycle underneath, but the primary experience emphasized a conversation, visible progress, steering, and results instead of exposing every execution detail at once.

Typed artifacts gave results a more structured form. A narrator summarized progress and terminal outcomes in plain language, with a separate model/configuration path and event-backed highlights for what was happening now. This was a presentation layer over agent activity, not evidence that every narrated inference was a runtime fact.

Conversation identity became more durable and flexible. SQLite-backed topic threads, multiple panes, a navigator, durable forks, short-lived side conversations, lineage, archiving, and role/voice/color identity supported parallel lines of work. A master conversation could route new requests into an appropriate topic. Folderless work later allowed a conversation to begin before selecting a filesystem project.

Evidence: [Easy Button lifecycle](https://github.com/riteofstring/setta/commit/ab1e1a18f2), [steering](https://github.com/riteofstring/setta/commit/a8c2ee5e2d), [typed artifacts](https://github.com/riteofstring/setta/commit/a3439bc190), [event-backed progress highlights](https://github.com/riteofstring/setta/commit/d84782c521).

### July: voice and cloud-runtime experiments

Voice work included realtime WebRTC transcription, microphone configuration, speech synthesis, progress readouts, replay, speaking indicators, and arbitration between competing speech outputs. The interface tracked whether input was directed to the master conversation or a particular pane.

Bring-your-own-key OpenAI voice configuration used an in-app credential vault. A local macOS helper explored capture and synthesis. An always-listening, wake-word-driven state machine was another experiment; it should not be described as completed cross-platform voice support.

Cloud experiments explored private runtimes on Sprites/Fly infrastructure. These were distinct from the 2025 hosted-project companion and the Setta 2 share-deployment feature. They addressed the newer agent runtime's placement and connection model.

Evidence: [voice credential configuration](https://github.com/riteofstring/setta/commit/220f9b204b), [macOS speech helper](https://github.com/riteofstring/setta/commit/fa2fe58b66), [wake-word experiment](https://github.com/riteofstring/setta/commit/ce66040ca2), [private cloud-runtime work](https://github.com/riteofstring/setta/commit/cddaccd21e).

## Late July–early August 2026: the Setta 4 Director experiment

Setta 4 pursued a **Director command center** rather than making a pane the primary identity of a task. A durable **workstream** represented a line of work, backed by a conversation. A folder could be attached as a resource, while folderless work remained a valid starting point.

The [restored August 2 captures](features/libraries-and-detours.md#setta-4-follow-workstreams-and-inspect-their-artifacts) use the original graph replay and artifact catalog. The restored live Director did not dispatch work successfully with the substitute model, so these labeled demonstrations establish the interfaces rather than live orchestration.

### Workstreams and actionable status

The Go contracts defined idle, running, queued, awaiting approval, awaiting resource, blocked, failed, completed, and archived workstreams. Records included pending counts, active-run identity, artifacts, parent relationships, and the last meaningful milestone. This made background work inspectable without loading its entire transcript.

Selection determined presentation detail. The selected workstream could show its recent trajectory; adjacent workstreams could show status, milestones, blockers, and artifacts; background workstreams could stay at aggregate status. This was a product-level attempt to keep many concurrent tasks legible.

Evidence: [Director graph implementation](https://github.com/riteofstring/setta/commit/10427d2e74), [workstream contracts](https://github.com/riteofstring/setta/blob/milestone/2026-07-setta-4-graph/internal/director/workstream.go), [workstream creation](https://github.com/riteofstring/setta/commit/562cb14161).

### An evidence-linked semantic graph

The Director graph represented user goals, decisions, plans, milestones, delegations, investigations, actions, resource and approval requests, artifacts, validation, blockers, retries, recovery, completion, failure, and cancellation.

Its relationships were typed: followed by, delegated to, depends on, blocked by, produced, validated by, and recovered by. Edges were intended to represent recorded relationships, not merely visual proximity or similarity between labels.

The source distinguished three evidence classes: runtime facts, structured declarations, and attributed Director interpretations. Interpretations carried model attribution and source-event references. This distinction limited what the graph could legitimately claim about an agent's activity.

A WebGL2 renderer, rails, a Now surface, and command-center navigation presented the graph. Narrator-driven highlights and an ask interaction linked it to ongoing work. Earlier dithered visualizations, full-screen reasoning streams, and parallel-thread layouts were concept prototypes; they should not be mistaken for measured runtime behavior.

Evidence: [semantic graph contracts](https://github.com/riteofstring/setta/blob/milestone/2026-07-setta-4-graph/internal/director/semantic_graph.go), [WebGL2 renderer](https://github.com/riteofstring/setta/commit/4f7a52c7b6), [command-center cutover](https://github.com/riteofstring/setta/commit/c750f4f986), [visual concept work](https://github.com/riteofstring/setta/commit/3d692e385a).

### Artifact presentation and experimental deployment

An OpenUI static-profile compiler explored rendering bounded structured artifacts, with a gallery for inspecting results. This was narrower than the older App-mode builder: an artifact presentation experiment did not imply arbitrary application code generation or execution.

Sprites support extended the Director's cloud-runtime experiments. Independent evaluation and orchestration work continued into August, including lifecycle and usage accounting. These branches remain historical experiments. The present library returned to a Setta 2-derived workspace baseline rather than inheriting the Director application.

Evidence: [static artifact compiler](https://github.com/riteofstring/setta/commit/3864a7b3ef), [artifact gallery](https://github.com/riteofstring/setta/commit/b99bb75b27), [Director cloud-runtime support](https://github.com/riteofstring/setta/commit/7d9a042658).

## August 2026: extract the reusable Workspace library

### August 9: retain the Setta 2 workspace as an embeddable foundation

The retained library extraction began on August 9. A parallel blank-slate workspace prototype also appears in the archive around this period, but the continuing library came from the established Setta 2 interaction model.

The initial reusable pieces included section containers and headers, resize behavior, nested layouts, drag and drop, the canvas and viewport controls, tooltips, the minimap, and parameter/item trees. A host application could register its own content instead of accepting a hardcoded catalog of Python, chat, and artifact sections.

The central boundary changed: **Setta supplied workspace interaction; the host supplied application meaning**. A section could display a host's chart, editor, data, or renderer while using Setta's movement, grouping, selection, and presentation. Styling was scoped so embedding the workspace would not restyle the entire host page.

Typed built-in item schemas gave ordinary controls a reusable data contract. A shell and Outline supplied surrounding navigation. Accessibility and adaptive behavior became package concerns, including keyboard use, writing direction, compact layouts, pointer characteristics, and reduced-motion preferences.

Evidence: [retained library extraction](https://github.com/riteofstring/setta/commit/57f92584bff7f31b18ed1e829ea4b02b69fadfd8), [typed items](https://github.com/riteofstring/setta/commit/f9458c0229), [workspace shell](https://github.com/riteofstring/setta/commit/083c1735c8), [Outline](https://github.com/riteofstring/setta/commit/fdc28f7985).

### Mid-August: Inspector, commands, and reusable editors

The new library panes retained the surrounding-workspace idea while changing its behavior. The workbench Overview used as the extraction reference recursively flattened its visible records; the library **Outline** added real disclosure, ARIA tree semantics and keyboard/typeahead navigation. The old inspector primarily required one selected section. The new **Inspector** followed a selected typed item as well as a section, and supported compatible multi-section group, ungroup, lock and delete actions. Hosts could contribute domain-specific settings while reusing the package's section settings and typed-control configuration.

Menus and a command registry let applications add actions to consistent surfaces. Keyboard bindings could be configured and rebound, and application commands could participate in the workspace's interaction rules. Group scrolling, parameter authoring, filtering, help, and diagnostics became reusable features rather than workbench-only behavior.

Built-in text/Markdown and code sections provided common content without requiring every consumer to rebuild an editor. Hosts still decided whether to register them, which modes to allow, and what actions such as submission meant.

Evidence: [Inspector](https://github.com/riteofstring/setta/commit/5672885e20), [contemporaneous old/new pane comparison](https://github.com/riteofstring/setta/blob/5672885e2072afb4967244358e56e01edb562015/docs/evidence/workspace-shell/reference/README.md), [menus](https://github.com/riteofstring/setta/commit/095b216900), [command registry](https://github.com/riteofstring/setta/commit/30577ef25f), [keyboard rebinding](https://github.com/riteofstring/setta/commit/0efb1aab21).

### Late August: windows, history, clipboard, views, and graphs

Managed windows and Window Spaces became reusable package features. Applications could float or dock content and hand an eligible section between the canvas and a window. A global navigator combined Find and command-palette behavior.

Structural undo/redo became opt-in, with a local in-memory authority or delegation to an application's own history. Section clipboard operations supported copying, pasting, and duplication, including host-specific reference rewriting. Automatic layout offered a way to pack top-level sections instead of manually arranging every card.

Saved views became a library feature with named layouts, visibility, camera state, a dedicated management pane, direct view editing and optional tabs. Hosts owned their documents and persistence, replacing the old application-global view store. A controlled graph layer exposed ports and edges while leaving their meaning and persistence to the application. Section attention and fitting allowed a host to draw attention to relevant content.

A standalone section surface rendered a subtree outside the normal canvas. The rendering adapter moved to upstream XYflow rather than requiring the preserved fork. These changes made the workspace usable in multiple compositions: a full shell, a custom shell, a section embedded elsewhere, or a windowed presentation.

Evidence: [global navigator](https://github.com/riteofstring/setta/commit/a8515231cc), [structural history](https://github.com/riteofstring/setta/commit/f04838844f), [section clipboard](https://github.com/riteofstring/setta/commit/6f3a6e12bd), [automatic layout](https://github.com/riteofstring/setta/commit/f9ba77a1c6), [saved views](https://github.com/riteofstring/setta/commit/33c7575eec), [controlled graph](https://github.com/riteofstring/setta/commit/06090c3457), [standalone section surface](https://github.com/riteofstring/setta/commit/48aa49a573).

## August–October 2026: focused applications built on Workspace

The extraction did not immediately leave only a library. Several focused applications exercised it while keeping their domain logic outside Workspace. Their source demonstrates what consumers could build, but their Python or Go runtimes did not become permanent dependencies of the final browser library.

### August: Python Canvas

**Python Canvas** retained a narrower part of the older product: compose Python through callable sections and typed parameters. It began with a read-only scaffold and grew editable controls, basedpyright completion, code generation, nested list/dictionary structures, references between sections, and terminal execution.

Generated Python occupied a reserved region inside an otherwise authored file. The interface could therefore combine structured composition with hand-written surrounding code. Canonical state, revision-aware apply operations, and streamed updates supported a CLI/API surface for reading a schema or snapshot and changing a project.

This was an application using Workspace's controls, shell, editors, and graph; Python interpretation, generation, language-server behavior, and execution belonged to Python Canvas. October examples explored model composition and an interactive scikit-learn decision-boundary workshop. Some playground implementations were removed during the same period, and the Python application/runtime was removed from the current checkout on October 18.

Evidence: [Python Canvas source and guide](https://github.com/riteofstring/setta/tree/74837d35da/apps/python-canvas), [August API work](https://github.com/riteofstring/setta/commit/18372a210b), [model-composition workshop](https://github.com/riteofstring/setta/commit/5344734e39ae8eb8fbd0f2253c8271a8388d7644), [playground removal](https://github.com/riteofstring/setta/commit/6dc4f1fb7b).

### September 6–12: Realtime and live computation graphs

**Realtime** was a smaller application for connecting controls and drawings to Python handlers. Its project described input, output, button, status, drawing, handler, and code sections. An authored runtime source file could be edited, applied, and reloaded into an active version.

Bindings described events, joins, and disconnected inputs. A handler received the appropriate event and a frozen snapshot of section inputs. Named outputs could feed another handler independently of whether they were also displayed in an output section.

The execution model addressed rapidly changing inputs and branching pipelines:

- Scheduling modes distinguished one-shot, latest-input, and parallel work.
- Concurrency groups bounded activity.
- Fan-out let one input drive independent branches.
- Fan-in joined outputs from the same input lineage rather than combining unrelated runs.
- Older completions were prevented from replacing newer accepted output.
- Successful output could remain visible while another run was pending or failed.
- Cancellation was cooperative where possible; timeout or worker failure could require restarting the worker.

The CLI exposed schema, snapshot, apply, reload, and invoke operations. Revision checks kept external changes from silently overwriting newer state.

The **Signal Bloom Press** example made the graph visible: a Fabric drawing supplied an inkplate and profile; SVG and Pillow-based treatments ran along separate paths; a poster stage joined matching results. It demonstrated application-owned computation coordinated through a common workspace.

Evidence: [Realtime introduction](https://github.com/riteofstring/setta/commit/2bb7b293c9), [concurrent pipelines and lineage](https://github.com/riteofstring/setta/commit/61129f22df), [Realtime reference](https://github.com/riteofstring/setta/blob/74837d35da/apps/realtime/README.md).

### September: the Realtime drawing surface

Realtime's drawing application was more capable than the later generic normalized-stroke primitive. Its Fabric-based editor included selection, pen, highlighter, eraser, text, lines, arrows, rectangles, ellipses, and images. Users could transform, layer, group, align, lock, and style objects, including opacity and typography.

Undo/redo, clipboard keys, image-file dropping, and a configurable canvas size supported ordinary drawing work. Resizing could preserve anchored content or scale it, while grid snapping was a local presentation aid. The drawing lived within the workspace's pan/zoom surface rather than introducing another independent inner viewport.

This feature belonged to the Realtime application. The final library retained reusable controls and a lighter stroke surface; it did not ship the entire Fabric drawing program as a built-in section.

### September 12–13: Setta Bench

**Setta Bench** explored comparing multiple code-based candidates against the same frozen set of cases. Build, Runs, and Compare were fixed saved views. Case sets, candidates, and shared checks appeared as sections connected by a controlled graph, while managed windows showed run history and aligned results.

A candidate executable accepted a JSON request on standard input, emitted progress and a final result as newline-delimited JSON, and wrote declared artifacts to an output directory. Bench managed concurrency, timeouts, cancellation, durable run records, artifact identity, and shared checks. Launching froze the experiment definition; imported Python Canvas bundles could be copied into immutable project-owned storage.

The example compared contain and cover thumbnail strategies across ten generated catalog images, producing 512 × 512 PNG results and collecting a saved preference. This was a focused local comparison application, not a general experiment-tracking service. Its source appears on a short branch detour and is not a feature of the current package.

Evidence: [Bench checkpoint](https://github.com/riteofstring/setta/commit/befd4bbbef), [Bench guide and candidate protocol](https://github.com/riteofstring/setta/blob/674bbd18ad/apps/bench/README.md).

### September 19–20: Setta Review

**Review** separated a producer's request for a decision from the person or tool providing that decision. A producer-neutral JSON contract could describe completion claims, a choice matrix, or alternative artifacts. Optional external assessments could accompany the request without making Review itself an agent harness.

Evidence could point to exact Git hunks, source lines, JSON locations, logs, and artifacts. Relationships explained whether evidence supported, challenged, qualified, or informed a claim. Selecting content could highlight and frame the associated evidence on the canvas.

The application offered Current and Old views, persistent decisions, text feedback, and normalized drawing annotations anchored to the precise artifact being reviewed. Failed evidence resolution remained visible instead of making the rest of the request disappear. Unsaved drafts survived within the tab, and revision checks guarded durable writes.

CLI operations opened a review, exposed its schema or snapshot, applied changes, and exported a response and continuation packet. Review inspected and handed off evidence; it did not run the producer's tests, execute an agent, or modify the proposed source on its own.

Evidence: [Review contracts](https://github.com/riteofstring/setta/commit/a531f7ed2f), [portable artifact feedback](https://github.com/riteofstring/setta/commit/726a462030), [provider-neutral commands](https://github.com/riteofstring/setta/commit/3701c396a3), [Review guide](https://github.com/riteofstring/setta/blob/74837d35da/apps/review/README.md).

### September 19–20: Experiment Lens

**Experiment Lens** opened already-recorded experiment results and linked population views to exact observations and artifacts. A versioned manifest declared factors, metrics, observation sources, provenance, artifact relationships, and the presentation. It did not launch or schedule experiments.

Its nine built-in section families were facets, scatter, histogram, heatmap, parallel coordinates, table, aggregate metrics, timeline, and artifact gallery. The manifest placed them in named views; producers could define their own view names and layouts without supplying executable React components.

Shared state connected the investigation. Filtering a condition changed the relevant views; selecting a point or row focused the same observation elsewhere; a comparison basket retained selected cases. Chart annotation selected the actual observations represented by a mark, with additive selection behavior. Freehand strokes and text recorded context, questions, or follow-up requests.

Timelines and artifacts were bidirectionally linked. A pointer could snap to a sample and select its related image, while choosing a timed artifact could move the series cursor. A managed window compared up to four selected trajectories and metrics, while the full basket remained exportable. Galleries, text, JSON, passive media, and inert downloads covered different artifact forms.

The exported selection packet retained source identity, filters, observations and values, artifact references, ranges, and structured annotations. A battery-aging example supplied 864 observations across 24 cells, showing how a fixed dataset could be explored without rerunning its experiment. Later recovery work preserved a visible draft when saving failed or conflicted, and required resolving it before export.

Evidence: [Experiment Lens introduction](https://github.com/riteofstring/setta/commit/9ff9180cb4), [declarative presentation](https://github.com/riteofstring/setta/commit/03b3fb3a53), [data-aware selection](https://github.com/riteofstring/setta/commit/de69275f75), [Experiment Lens guide](https://github.com/riteofstring/setta/blob/74837d35da/apps/experiment-lens/README.md).

### September–October: shared primitives and recovery behavior

The focused applications led to reusable **carousel** and **normalized-stroke** surfaces in Workspace. The carousel handled navigation through related items; the stroke surface handled pointer capture and vector marks in normalized coordinates. Artifact identity, annotation intent, storage, and domain relationships remained the application's responsibility.

Other shared work extracted local hosting, durable-file handling, transport, and latest-value publication. Those backend foundations supported the companion applications during this period; they were not retained as a required local server for the final library.

Startup and save-failure recovery received attention in October. The applications could preserve a user's visible draft, explain a conflict, and offer retry or restoration rather than silently discarding edits. This was a concrete usability improvement even though those applications were later removed from the current checkout.

Evidence: [carousel extraction](https://github.com/riteofstring/setta/commit/787245259a), [normalized-stroke extraction](https://github.com/riteofstring/setta/commit/e2fc4d968e), [local hosting foundation](https://github.com/riteofstring/setta/commit/0503bc4f2f), [latest-value publication](https://github.com/riteofstring/setta/commit/03393be5a3).

## October 2026: browser pipelines and a smaller product boundary

### October 11: a public browser-computation entry point

The package added an independent **browser pipeline** entry point. A host could move suitable computation into a Web Worker while continuing to use Setta's controls and workspace in the main UI. The entry point had no React or workspace-runtime dependency of its own.

A pipeline defined named stages and dependencies. Validation rejected an empty graph, duplicate or empty stage identities, missing dependencies, and cycles before stage execution. Each stage ran once per request, shared dependencies were reused, and independent asynchronous work could progress concurrently. One worker did not imply a pool of CPU threads.

The client bounded rapidly changing input: one request could be active and only the newest pending request was retained. Monotonic revisions distinguished the latest requested input from the last successful output. A late result from an older request could not overwrite a newer requested state, while the previous successful output could stay visible during loading or an error.

Cancellation terminated the worker and discarded queued input; a later request could create a fresh worker. Timeouts and worker errors had recovery paths, with a ten-second default timeout and a configurable positive finite duration. Disposal ended the client and its subscriptions.

Per-stage status and progress reported what was running, complete, or failed. Progress could include a bounded fraction and a message, and late progress from obsolete work was ignored. Inputs and outputs used structured clone. The application still supplied the worker, stage functions, algorithms, and rendering loop; GPU resources remained with the renderer that owned them.

Evidence: [public browser APIs](https://github.com/riteofstring/setta/commit/74837d35da5cb21bdff2ebc1ebaab0cbb77d5ceb), [stage progress](https://github.com/riteofstring/setta/commit/e003c84df188b0dcc154e33c14f718c1cd39756e), [browser pipeline guide](../../packages/workspace/BROWSER.md), [client implementation](../../packages/workspace/src/browser/client.ts), [dependency execution](../../packages/workspace/src/browser/execute.ts).

### October 18: remove the historical Python application/runtime

The Python runtime and historical application code were removed from the current checkout. Their source remained in earlier commits. The continuing product was the reusable library rather than a packaged local Python workbench.

Browser-local persistence helpers restored shell-pane layout and saved views using validated localStorage values. The host still owned the full application document and its persistence policy. Later October work improved direct dragging of parameters and meta controls.

The removal is an important feature boundary. Current consumers did not automatically receive SettaListener, SettaRunner, Python code generation, the language server, local terminals, provider credentials, or any of the older applications simply by importing the library.

Evidence: [Python runtime removal](https://github.com/riteofstring/setta/commit/4919cb096ebbcd861619e54bd0330b09b47088ff), [browser persistence work](https://github.com/riteofstring/setta/commit/6bad8a8db3), [parameter and meta-control dragging](https://github.com/riteofstring/setta/commit/21f96555bd).

### Library-era demonstrations

The independent showcase illustrated browser applications built with the public library. Its domain-specific code lived outside Setta's reusable workspace:

| Demonstration               | What Setta contributed and what the application supplied                                                                                                                               |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Print studio                | Workspace controls, drawing interaction, sections, and pipeline coordination surrounded application-owned image treatments, SVG/PNG export, and poster composition.                    |
| Photo-to-particles          | Controls adjusted the presentation of a depth-derived particle scene; the application owned model inference and the 3D renderer, so visual adjustments need not rerun the model.       |
| Gaussian capture inspection | Controls and panels supported inspection, thresholds, orbiting, and selected export; the application supplied the captures and Spark/Three-based rendering.                            |
| Single-image 3D experiment  | A segmentation and reconstruction pipeline exposed intermediate progress and threshold/resampling controls. Its inferred reconstruction was distinct from a measured Gaussian capture. |
| 3D sketchbook               | Linked macro controls such as Disperse, Vortex, and Ripple adjusted several renderer values together, including spread, size, twist, hue, wave, and saturation.                        |
| Ambient instrument          | A spatial control surface organized an audio/visual instrument; the sound engine, simulation, and rendering were application code.                                                     |

These examples showed the library's range without making image generation, reconstruction, Gaussian rendering, or audio synthesis built-in Setta features. The [illustrated timeline](tour.md) and [image provenance](images.md) identify the preserved sources and captures; they should be consulted before treating a screenshot as evidence of a particular historical implementation date.

## November 2026: the current React library and first npm release

### November 1–15: complete the browser-only boundary and refine interaction

The local Go backend was removed on November 1. Together with October's Python removal, this left a browser-oriented library that a host could use without installing Setta's historical server or runtimes. KaTeX support was also removed, so the old workbench's built-in LaTeX rendering was not part of the final text-section contract.

Graph interaction gained host-defined port families, host changes that could join structural history, and clearer connection presentation. Shared-port cables could be bundled, and routing learned to avoid section obstacles. These changes improved the usefulness of graph-heavy applications without choosing what the edges meant.

Custom meta controls allowed an application-owned widget, such as a two-axis pad, to use Setta's headerless control presentation. The shell could omit either side pane and the floating canvas toolbar. Optional expanded titles and the omission of unsupported edit affordances let applications present simpler interfaces while retaining the underlying interaction model.

Evidence: [Go backend removal](https://github.com/riteofstring/setta/commit/2866560207b0c2926136748fce42322f3a43aebf), [KaTeX removal](https://github.com/riteofstring/setta/commit/7c95ca91d1), [graph families](https://github.com/riteofstring/setta/commit/7ee1c6ba30c890683817345d6f5d84616403f123), [host history entries](https://github.com/riteofstring/setta/commit/9ed6e5739c901f3386a402c61a763931302a7ba5), [cable bundling](https://github.com/riteofstring/setta/commit/02a947202a23ee3252982a4fc28cd7c34c91c351), [obstacle routing](https://github.com/riteofstring/setta/commit/e48fe6bbf822a9cb6b5284dddeb033d9411b1179), [custom meta controls](https://github.com/riteofstring/setta/commit/77906b90c2).

### November 18: @riteofstring/setta 0.1.0

The [0.1.0 release](https://github.com/riteofstring/setta/tree/v0.1.0) established the npm package **@riteofstring/setta**, licensed under Apache-2.0. It exposed the React workspace API, the independent browser pipeline API, compiled styles, TypeScript declarations, and an optional Tailwind preset. The package used ESM and a React 19 host contract. CodeMirror and icons were bundled so consumers did not have to assemble the historical editor dependency setup themselves.

The public product was now a toolkit for building interactive tools around an application's own data and code. The following inventory describes the capabilities present at the end of this history; it also makes clear which parts of the earlier workbench survived as reusable features.

Source reference for this inventory: [Workspace guide](../../packages/workspace/README.md), [public exports](../../packages/workspace/src/index.ts), [package manifest](../../packages/workspace/package.json), and [release changelog](../../CHANGELOG.md).

### Workspace documents and host-owned content

Each workspace has an explicit host with its own document, registrations, interaction state, and lifetime. A serializable document contains sections, nesting, top-level placement, selection, viewport, and optional saved views. Loading validates the complete document before making it visible; subscriptions report accepted document changes so an application can persist or synchronize them.

Applications register section kinds, content renderers, icons, size defaults and constraints, validation, header actions, searchable text, and Inspector contributions. Application data remains opaque to the generic workspace. The package owns the structure and interaction; the application owns what a chart, model, file, chat, or other custom section actually means.

A host can compose the complete shell, build its own surrounding chrome, or render a standalone section subtree. Section and item updates use explicit operations rather than requiring access to the package's internal renderer or state store. Multiple hosts can coexist without treating one global workspace as the authority for all of them.

### Canvas, sections, groups, and automatic layout

The canvas supports pan, zoom, fitting, a minimap, selection, free placement, resizing, and drag-based organization. Sections can have names, icons, minimum/maximum size constraints, semantic accents, categorical color tags, lock state, and minimized presentation.

Groups provide nested horizontal or vertical organization. They can size intrinsically or use bounded dimensions with internal scrolling. Grouping, ungrouping, nested movement, and item reparenting preserve a coherent hierarchy. Native inputs, editors, links, and custom interactive surfaces can retain their own pointer and wheel behavior while the surrounding workspace remains pannable.

Automatic layout packs unlocked top-level sections using their measured geometry while treating locked sections as fixed obstacles. It changes placement rather than interpreting the graph or the application's data. Hosts can use the same pure planner to preview an arrangement. Section fitting and attention APIs can frame or temporarily emphasize relevant content without changing its application meaning.

### Shell, Outline, Inspector, and navigation

The shell has controlled leading and trailing panes, optional host tabs, resizable boundaries, and remembered pane state. Either pane can be omitted completely. The floating canvas controls can also be omitted while gestures and keyboard commands remain available.

The **Outline** presents sections and recursive group children in document order, with disclosure, selection, keyboard navigation, typeahead, and focus behavior. The **Inspector** presents the selected section or typed item: identity, name, accent/tag, lock/minimize, dimensions, group layout, and valid control configuration. Compatible multi-section actions include grouping, ungrouping, lock changes, and deletion. Custom data can receive a host-supplied Inspector rather than being guessed at by the package.

**Global Find** searches section names and kinds, built-in item labels, and additional text explicitly supplied by the application. Activating a result can fit a section or focus an available item. Hidden, filtered, or unmounted rows retain their presentation policy instead of being silently exposed.

The **command palette** projects registered actions and creation commands with current availability and disabled reasons. Commands can appear in menus, toolbars, and the palette, and keyboard bindings can be rebound with conflict handling. Native text editing and browser context menus remain available in the surfaces that own them.

### Typed parameter trees and the control catalog

Ordinary sections can contain a typed item tree with nested groups, editable or fixed labels, values, help text, and control configuration. Hosts choose an authoring-and-filter toolbar, a filter-only toolbar, or a hidden toolbar, and may provide a factory for new items. Selection, insertion, deletion, reordering, and reparenting use the package's structural operations.

The item control catalog includes text, code, multiline text, switches, dropdowns, colors, sliders, rotary controls, passwords, dates, times, and dropzones. Configuration is specific to the chosen control rather than an arbitrary unvalidated settings object. A section-wide label/value divider can be resized and reset, with keyboard support and persistence in the item layout.

Filtering matches labels and ancestor paths while retaining canonical item order. It helps navigate large parameter trees without turning a filtered projection into a new structural order. Movement is constrained while filtering would make its result ambiguous. The default section-local filter shortcut is distinct from global Find.

Rotary input uses relative drag movement rather than jumping to an absolute pointer angle, and supports discrete wheel/keyboard adjustments. Dropzones expose accepted and rejected input callbacks, attachment metadata, optional server-picker integration, and removal behavior. Password controls expose host-owned save/reveal behavior. The historical secret server and upload backend are not embedded in these UI controls.

Meta-control sections offer Button, Text, TextArea, Date, Time, Slider, Rotary, Switch, Color, Dropdown, Password, Dropzone, and Custom presentations without ordinary section chrome. Hosts own values and actions. Custom controls receive the appropriate disabled state and use application-defined semantics while Setta supplies framing, focus behavior, gesture isolation, and resizing.

### Help, diagnostics, and editor assistance

Quick info appears while holding **Q** over an eligible control or focused parameter. It supports multiple pages, copying, and freezing the information box so it can remain open, move, and widen. The historical action that turned a tooltip into a new application section is not automatically part of this generic tooltip primitive.

Hosts can provide parameter and code diagnostics with error, warning, or informational severity. The package presents them with the relevant row/editor and accessible status. Domain validation, Python analysis, and provider calls belong to the application.

Editor completion hooks allow a host to supply suggestions where the editor contract supports them. This is not the older bundled Python language server: the library's ordinary typed text/code configuration does not itself start basedpyright, inspect a Python environment, or execute user code.

### Built-in text and code sections

Two opt-in content section kinds ship with the package:

| Section | Supported behavior                                                                                                                                                                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text    | Plain text or GitHub-flavored Markdown, edit/render modes, font size, read-only presentation, tables, task lists, inline/fenced code, highlighting, and copying code blocks. Raw HTML is not interpreted.                                                     |
| Code    | Python, Bash, JavaScript, TypeScript, JSON, YAML, TOML, Markdown, and plain text; line wrapping, line numbers, indentation configuration, editable/read-only/generated-document modes, host completion and diagnostic seams, and an optional submit callback. |

A generated-document code section declares an explicit protected range inside its text. The generated block remains selectable and copyable, while edits around it remain possible. An edit crossing the protected range is refused as a whole; accepted surrounding edits update the range's offsets. A locked section becomes non-editable without losing its generated-region presentation.

The submit shortcut passes the current controlled content to a host callback. The host decides whether that means apply, save, validate, or run. The editor itself does not restore the historical Python execution engine. Hosts can narrow allowed languages and display modes or omit either built-in section entirely.

### Controlled graphs

Applications supply graph ports, edges, port families, and connection/reconnection rules. The package presents connections, selection, deletion, family styling, and status, while the host owns the actual edge state and meaning.

Ports can represent different families without forcing every edge to be Python dataflow, agent permissions, or workflow execution. Nested visibility affects which endpoints are displayed. Cable bundling and obstacle-aware routing improve readability, and connection hit areas are designed to coexist with controls inside sections.

This generic graph layer is a retained interaction capability. It does not include the old workflow scheduler, listener dependency engine, or Director semantic graph merely because all of those also used nodes and edges.

### Saved canvas views and browser-local layout

Saved views are named presentations of one document. Each stores a complete top-level layout, camera, section visibility, and optional tab bookmark. The underlying section identity, hierarchy, content, values, and authored sizes remain shared.

Users can create, activate, rename, reorder, and delete views, manage visibility in an Edit mode, and bookmark views as bottom tabs. Switching captures the outgoing presentation and applies the incoming one coherently. New and deleted sections are reconciled into the saved-view collection, and the last view cannot be deleted. Read-only layout mode can still activate an existing view.

Shell-pane state is separate from saved canvas views. Browser-local helpers can load and save both kinds of state, validate stored values, and tolerate unavailable storage. Full application persistence, conflict handling, sharing, and routing remain host decisions.

### Managed windows and Window Spaces

The window system is controlled separately from the workspace document. Generic windows can float, dock at the bottom, minimize, maximize, snap, resize, close, and reopen. Bounds are reconciled with the actual available space around panes and saved-view tabs. A recovery strip and manager make hidden, minimized, or closed content reachable in compact layouts.

Eligible ordinary sections can move into a floating window. The canvas keeps a measured placeholder and the single live section body changes placement; it is not duplicated into two independently mounted copies. Groups and meta controls are excluded from this handoff.

Window Spaces save arrangements of visible ordinary floating windows. Restoring merges an arrangement with existing content, reuses matching identities, and handles collisions rather than discarding unrelated live windows. Docked, minimized, maximized, closed, and canvas-owned instances are not ordinary floating-layout entries. A standalone Window Space surface can show a saved arrangement with local interaction without persisting those local changes.

Read-only layout presentation removes layout-changing controls while retaining appropriate focus and reopening behavior. The application owns content identity, window renderers, persistence, and routes for dedicated views.

### Clipboard and structural history

Section copy, paste, and duplicate are opt-in. A local authority can copy complete selected subtrees, allocate new section and item identities, preserve relative layout, and let the host rewrite domain references. A delegated authority can instead ask a backend or another canonical model to perform the operation and publish its accepted result. Native editor clipboard behavior remains independent.

Structural history is also opt-in. A bounded local stack records completed structural and layout operations, such as create/delete, group/ungroup, move/resize, name, minimize, color, item insertion/deletion/reordering, and column width. A completed gesture forms one entry. A host can add its own reversible operations, such as graph-edge edits, to the same stack.

The local stack is not universal application history. It excludes ordinary value changes, opaque content, editor history, viewport-only changes, and saved-view management. Loading or projecting a new authoritative document clears it. Applications with their own history can delegate recording and navigation instead.

### Carousels, annotations, appearance, and accessibility

The reusable carousel shows one related item at a time with previous/next controls, thumbnails, keyboard navigation, and focus handling. The host decides what selecting an item means, including whether it moves a timeline or changes a domain selection.

The normalized-stroke surface records bounded pointer strokes in unit coordinates, renders draft and committed paths, supports cancellation, and cooperates with canvas gestures. The host owns annotation identities, text, intent, evidence anchors, persistence, and validation. It is a reusable drawing primitive, not the full historical layered image editor or Fabric application.

Appearance supports light, dark, and system modes, scoped to the package rather than imposed on the host page. Semantic section accents derive readable presentation; named color tags provide a separate categorical marker. The compiled stylesheet includes the package's required styling without global Tailwind preflight or a requirement that the consumer configure Tailwind.

Keyboard navigation, focus restoration, accessible labels and statuses, right-to-left presentation, coarse-pointer targets, reduced-motion behavior, and host-size reflow are built into the package surfaces. The workspace remains a two-dimensional canvas, while surrounding shell controls adapt to smaller containers. Host-rendered content retains responsibility for its own accessibility and motion.

### November 19–21: preserve and explain the earlier generations

The final source-history and showcase work added the historical guide, feature chapters, provenance, and imagery. These changes made the evolution easier to inspect; they did not reintroduce the removed Python/Go workbench into the current npm package.

## Feature continuity and removals at a glance

This table cross-references the chronological account. A familiar name across generations does not imply the same implementation or product scope.

| Feature family                           | Earlier development                                                                                    | State at the November 2026 endpoint                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Python metadata and callable composition | Python metadata from 2020; generated programs; later Python Canvas.                                    | Historical application behavior. Hosts may build it with the library, but it is not built in.     |
| Spatial workspace                        | Navigation in 2021; freeform sections in 2022; groups and richer content afterward.                    | Core reusable capability.                                                                         |
| Parameter controls                       | Defaults and nested forms from 2020; sliders/presets; later standalone meta controls.                  | Typed controls and host-defined data remain; Python introspection is external.                    |
| Parameter sweeps                         | UI-only in 2020; executable cards/run groups in 2024; removed June 2025; new RunPlan API January 2026. | No built-in experiment runner.                                                                    |
| JSON/YAML/TOML                           | Several export/import iterations; YAML GUI mode; file-backed values and watching.                      | Editors can display these formats; historical project conversion and file watching are external.  |
| Live Python                              | Interactive function proof of concept in 2023; artifacts in 2024; listeners/hot reload in 2025.        | Historical runtime removed. Browser pipelines are a separate retained execution helper.           |
| Local terminals and SSH                  | Electron/CLI bridges, persistent terminals, remote workspaces.                                         | Host application integrations, not built-in runtime services.                                     |
| Charts, image processing, and media      | Logger charts, CSV sources, images, drawing, media carousels, focused examples.                        | Custom section rendering and carousel/stroke primitives remain; domain engines are external.      |
| Markdown and code editing                | Markdown from 2023, richer editors in 2024, LaTeX temporarily supported.                               | Opt-in text and code sections remain; built-in KaTeX was removed.                                 |
| Saved configurations and variants        | Templates, project saves, section versions, presets and overrides.                                     | Host-owned domain state. Saved canvas views remain a distinct package feature.                    |
| Undo/redo                                | Broad project editing in the workbench.                                                                | Opt-in structural history or delegation; native editor and application histories remain separate. |
| Chat, MCP, and coding agents             | Canvas chat, project assistant, MCP tools, external agents, branching and delegation.                  | Historical workbench/experimental applications, not bundled AI services.                          |
| Graphs                                   | Value references, agentic access edges, workflows, semantic graphs.                                    | Controlled generic ports and edges; hosts supply semantics and execution.                         |
| Workflows                                | Setta 2 canvas workflows and a separate Setta 3 orchestrator.                                          | No bundled workflow scheduler.                                                                    |
| Application generation                   | Setta 2 App mode; Setta 4 bounded artifact rendering.                                                  | Historical subsystems; the library is an application-building toolkit.                            |
| Hosting and sharing                      | setta-saas, share deployments, remote runtimes, Sprites/Fly experiments.                               | Host-owned deployment and sharing; no required Setta backend.                                     |
| Windows and views                        | Workbench floating windows, named views, Window Spaces.                                                | Retained as reusable controlled features with explicit boundaries.                                |
| Review and experiment inspection         | Bench, Review, and Experiment Lens companion applications.                                             | Preserved in history; generic supporting workspace primitives remain.                             |
| Packaging                                | Split Python/frontend/desktop projects, local monorepos, Go-backed applications.                       | Apache-2.0 ESM package with React workspace, styles, types, and an independent browser entry.     |

## Source landmarks for further reading

The following tags provide stable entry points into the reconstructed archive. A tag identifies preserved source, not a promise of an installable historical environment or compatible adjacent components.

| Period                         | Useful source landmarks                                                                                                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2020                           | milestone/2020-10-python-metadata; milestone/2020-12-sweep-ui-prototype.                                                                                                                                                  |
| 2021–2022 split components     | source/abcde-django; source/abcde-pip; source/abcde-frontend; source/abcde-electron; source/abcde-cli; source/abcde-backend; source/abcde-utils; source/abcde-test; source/abcde-demos.                                   |
| 2022 spatial workspace         | milestone/2022-02-freeform-sections; milestone/2022-05-iovuu; milestone/2022-08-runcoder.                                                                                                                                 |
| 2023–2024 local execution      | milestone/2023-09-monorepo; milestone/2023-12-interactive-python; milestone/2024-01-sweep-execution; milestone/2024-07-setta; source/runcoder.                                                                            |
| 2025 reactive and AI workbench | milestone/2025-02-canvas-chat; milestone/2025-04-mcp-control; milestone/2025-05-generated-state; milestone/2025-05-hosted-projects; milestone/2025-06-sweeps-removed; milestone/2025-12-meta-controls; source/setta-2025. |
| Companion examples and hosting | source/setta-examples; source/setta-saas.                                                                                                                                                                                 |
| Early 2026 workbench           | milestone/2026-01-runner; milestone/2026-02-app-mode; milestone/2026-03-go-backend; milestone/2026-03-workflows.                                                                                                          |
| Agent-centered detours         | milestone/2026-05-setta-3-experiment; milestone/2026-07-setta-4-graph.                                                                                                                                                    |
| Library                        | milestone/2026-08-library-extraction; milestone/2026-10-browser-pipelines; milestone/2026-11-current-library; source/setta; v0.1.0.                                                                                       |
| Preserved dependency changes   | source/xterm.js and source/xyflow contain selected fork changes, not complete upstream histories.                                                                                                                         |

The [illustrated timeline](tour.md) provides a shorter illustrated route. The [feature chapters](features/python-interfaces.md), [examples](examples.md), [composition timeline](timeline.md), and [image provenance](images.md) provide complementary views of the same source history.
