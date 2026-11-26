# Technology and architecture

[Documentation](../README.md) / [History](README.md)

Setta's interfaces were built on other people's tools. React remained a common thread,
but the surrounding stack changed substantially: Python introspection and Django,
JavaScript and TypeScript services, a local FastAPI workbench, Go-backed applications,
and finally a browser library. The changes explain both what the interface could do
and where that work actually ran.

This is a guide to the dependencies that shaped the product, rather than every entry
in a lockfile. Links identify preserved manifests and implementations at fixed revisions.
Versions in those files belong to that checkpoint; they are not installation advice.
The [feature history](feature-history.md) covers user-facing capabilities, and the
[tag guide](tags.md) explains how to locate the source. The [technical retrospective](https://setta.dev/how-it-worked/)
presents the architecture as a dedicated companion to the visual history.

## The stack at a glance

| Period                                       | Interface and language                                                                                  | Backend and execution                                                                                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2020–2021 · Generated forms                  | JavaScript, React, Create React App, Chakra UI, Emotion and Easy Peasy; an Electron desktop experiment. | Python introspection; Django, Django REST Framework and SQLite; desktop-launched Python.                                                            |
| 2022–2023 · Spatial configuration            | React Flow and dnd-kit; a gradual move into TypeScript, Vite, Radix UI, Tailwind and Zustand.           | TypeScript/Node server experiments, eventually Express and Prisma; a separate Python CLI.                                                           |
| Late 2023–2025 · Local Python workbench      | React, Vite, React Flow, CodeMirror, xterm.js and charts.                                               | Python, FastAPI and Uvicorn; language analysis, local processes, live tasks and SQLite persistence.                                                 |
| 2025–May 2026 · workbench                    | Richer editors, spreadsheets and agent interfaces.                                                      | Python services and SDKs; Go gradually takes over server responsibilities from March 2026. A separate hosted companion uses FastAPI and PostgreSQL. |
| Summer 2026 · Setta 3 and 4                  | React/Electron; PixiJS in Setta 3's graph, a custom WebGL2 renderer in Setta 4.                         | Go, SQLite and agent-process integrations. These are separate application experiments.                                                              |
| August–November 2026 · library and consumers | TypeScript/React, upstream xyflow, dnd-kit, CodeMirror and scoped styles.                               | Consumers own their backends. The final package needs neither Setta's Python runtime nor its Go server; browser pipelines use Web Workers.          |

**Read by period**

- [Python, React forms and desktop execution](#20202021-python-react-forms-and-desktop-execution)
- [The spatial frontend and Node backends](#20222023-the-spatial-frontend-and-node-backends)
- [The local Python workbench](#late-20232025-the-local-python-workbench)
- [Hosted services, agents and Go](#2025may-2026-hosted-services-agents-and-go)
- [The Setta 3 and Setta 4 experiments](#summer-2026-the-setta-3-and-setta-4-experiments)
- [The reusable browser library](#augustnovember-2026-the-reusable-browser-library)
- [Engineering challenges](#engineering-challenges)
- [Library index by role](#library-index-by-role)
- [Libraries inside the example applications](#libraries-inside-the-example-applications)
- [The websites and documentation](#the-websites-and-documentation)

## 2020–2021: Python, React forms and desktop execution

The earliest Python work used `inspect` to describe functions and classes before
constructing them. The initial environment included **PyTorch, torchvision and CUDA**:
training configuration was the starting problem, while the metadata machinery became
more general. See the [object-description code][python2020] and [Conda environment][conda2020].

The first frontend used **JavaScript and React**, scaffolded with **Create React App**.
**Chakra UI** and **Emotion** supplied interface components and styling; **Easy Peasy**
managed state. **Monaco Editor** appeared in the developer pane, while **Framer Motion**
supported interaction experiments. These are visible in the [December 2020 manifest][front2020].

The Python web backend used **Django**, **Django REST Framework**, **Knox** token
authentication and **SQLite**. A June 2021 branch also explored GraphQL through
**Graphene-Django**; that experiment should not be mistaken for the backend of every
later version. See the [Django configuration][django2021] and [GraphQL change][graphql2021].

**Electron** connected the React interface to local execution. January 2021 code wrote
generated Python to a file and launched it through Node's process APIs. The separate
desktop project also depended on **node-pty** and **electron-builder**. These were
application integrations, distinct from the web frontend's form generation:
[execution bridge][electron2021], [desktop manifest][desktop2021].

### Panning before React Flow

The 2021 interface already had pan and zoom, while its contents were still a structured
form. Setta wrapped **react-map-interaction**, measured the form with **react-sizeme**,
and kept scale and translation together. Its own horizontal and vertical scrollbars
converted between scroll positions and that translation. Bounds depended on the scaled
content, viewport and margins; zooming therefore changed more than a CSS transform.

By March, navigation also accounted for the Overview pane's width and used **Framer
Motion** for positioning. The challenge was keeping scrollbars, the visible form and
navigation aligned as the viewport changed. Independently placed React Flow sections
arrived in 2022; the earlier work was a custom navigation layer around an existing
pan/zoom library.

Sources: [February wrapper](https://github.com/riteofstring/setta/blob/63ee486f680f60e824b0edc3c7b97aefcc1ff2d4/abcde-frontend/src/components/AppContainer/Main/CustomMapInteraction/CustomMapInteractionCSS.js) · [March navigation](https://github.com/riteofstring/setta/blob/18bd0cd27042235f69f9210075b678b40e07388f/abcde-frontend/src/components/AppContainer/Main/CustomMapInteraction/CustomMapInteractionCSS.js).

## 2022–2023: the spatial frontend and Node backends

**React Flow** provided the navigable canvas and independently positioned sections;
**dnd-kit** supported reordering and composition within the interface. The February
2022 checkpoint uses the earlier `react-flow-renderer` package name. See the
[canvas-era manifest][flow2022].

The frontend changed in stages. **Vite** entered in October 2022, **Radix UI** and
**Tailwind CSS** replaced much of the Chakra-based presentation, and **Zustand** began
replacing Easy Peasy in December. **TypeScript** grew alongside existing JavaScript
and JSX rather than arriving in one complete rewrite. The [Vite change][vite2022],
[Radix change][radix2022], [Zustand change][zustand2022] and
[January 2023 manifest][front2023] show those transitions.

The server history contains several distinct approaches:

| Source checkpoint                                    | What was being explored                                                 |
| ---------------------------------------------------- | ----------------------------------------------------------------------- |
| [August 2022: NestJS][nest2022]                      | A TypeScript/Node server organized around Nest modules and controllers. |
| [September 2022: AdonisJS][adonis2022]               | A separate backend experiment, not a universal next version.            |
| [September 2022: MikroORM and PostgreSQL][mikro2022] | Database-backed application records; later work moved to Prisma.        |
| [December 17: Koa][koa2022]                          | A brief smaller-server experiment.                                      |
| [December 18: Express][express2022]                  | The beginning of the Express line retained in the later split backend.  |

By September 2023, the retained Node server used **Express, Prisma, Passport**, sessions
and **WebSockets**. Its Prisma schema selected **SQLite**, so the earlier PostgreSQL
work does not describe every later database. A separate **Python CLI** used **Click**,
requests, keyring, PyYAML and websockets, with **Jedi** and **mypy** for code analysis.
See the [server dependencies][node2023], [database schema][db2023] and
[CLI package][cli2023].

## Late 2023–2025: the local Python workbench

The [October 2023 consolidation][local2023] brought the frontend and Python runtime
into the local workbench. **FastAPI** handled HTTP and WebSocket endpoints;
**Uvicorn** served the application. Python handled configuration, generated programs
and local computation. The [package requirements][python2023] and
[server implementation][server2023] establish that boundary.

The React frontend retained **Vite, Radix, Tailwind, Zustand, dnd-kit and React Flow**.
**visx** supplied the earlier chart components. **CodeMirror 6** entered the code editor
in January 2024 and later spread to parameter expressions and text editing.
After an early 2023 experiment, **Chart.js** returned in December 2024 to replace
the visx chart surface. **xterm.js** supplied terminal presentation.
The project also preserved small forks of xterm.js and xyflow for changes needed by
its zoomable workspace; these are selected fork histories, not complete upstream archives.
See the [late-2023 frontend][frontlate2023], [CodeMirror change][codemirror2024],
[Chart.js change][chart2024] and [repository composition](timeline.md).

By 2025, **CodeMirror**, **Chart.js**, **react-markdown**, **remark/rehype** and **KaTeX**
helped place code, plots, prose and mathematics together. On the Python side,
**basedpyright** provided language analysis, **Ruff** formatting, **watchdog** file
watching, and **ptyprocess/pywinpty** local terminal processes. **Pydantic** described
structured data and **SQLAlchemy** managed the local SQLite database. These were
services of the historical application, not capabilities supplied by React itself.
See the [frontend manifest][front2025], [Python requirements][python2025] and
[database implementation][db2025].

## 2025–May 2026: hosted services, agents and Go

The separate **setta-saas** companion used **React, Vite and Clerk** for its web interface
and identity integration. Its Python service used **FastAPI, Uvicorn, SQLAlchemy,
PostgreSQL/psycopg2, httpx and JWT tooling**. Deployment work targeted **Fly.io Machines**.
This hosted application coexisted with the local workbench; it was not a new dependency
of every Setta project. See the [hosted frontend][saasfront],
[backend requirements][saasback] and [deployment change][saasdeploy].

The workbench's Python package added the **MCP** and **Anthropic** SDKs alongside its
existing runtime. In 2026, **Glide Data Grid** and **SheetJS (`xlsx`)** supported richer
spreadsheet surfaces, while CodeMirror and xterm.js continued to present source and
terminals. See the [Python requirements][python2025] and [May frontend][front2026].

The [Go migration began in March 2026][gostart]. By the May checkpoint, the Go server
used **chi** and **Huma** for its HTTP/API layer, WebSocket and PTY packages for live
connections and processes, and **Tree-sitter** packages for Python syntax handling.
It declared the **OpenAI, Anthropic, Google GenAI and MCP Go SDKs**. Moving the server
to Go did not move users' Python computations to Go: Python execution and plugin work
remained separate responsibilities. The [May Go module][go2026] records the exact packages.

## Summer 2026: the Setta 3 and Setta 4 experiments

Both experiments used **Go**, **React**, **Electron**, **electron-vite**, **Tailwind** and
**Zustand**, with JavaScript and TypeScript in their desktop sources. **SQLite**, through
`modernc.org/sqlite`, stored durable application records. Setta 3's workflow store is
one concrete example: [store implementation][setta3store].

**Setta 3** used **PixiJS** and **pixi-viewport** for its research graph. Its scrolling
workspace also used xterm.js, **react-virtuoso** and **highlight.js** for terminals and
long textual content. The [renderer][setta3graph], [desktop manifest][setta3front] and
[Go module][setta3go] show that combination.

**Setta 4** used its own **WebGL2 renderer and GLSL shaders** for the Director graph.
Its artifact interfaces used **Base UI, OpenUI and Recharts**. Those choices belong to
this experiment; they were not inherited wholesale by the later workspace package.
See the [graph renderer][setta4graph], [shaders][setta4shaders],
[artifact renderer][setta4artifacts], [desktop manifest][setta4front] and [Go module][setta4go].

## August–November 2026: the reusable browser library

The library came from the **Setta 2 workbench line**, independently of the Setta 3/4
experiments. Extraction first carried a forked canvas implementation; the
[August 30 cutover][xyflow2026] replaced the vendored runtime with upstream **xyflow 12**.

The current package uses **TypeScript**, a **React 19** host, **xyflow**, **dnd-kit**,
**Zustand**, selected **Radix UI** controls, **CodeMirror** and Markdown tooling.
**Vite** builds the package, and **Tailwind/PostCSS** compile its scoped stylesheet.
CodeMirror and React Icons are bundled from development dependencies, so a simple
runtime-dependency list alone would miss them. See the [package manifest][library].

The independent browser pipeline entry uses **Web Workers** to coordinate host-supplied
computations. It does not embed the historical application server or AI providers.
[Python and the example applications were removed in October][pyremoved];
[the unused Go backend was removed in November][goremoved]. The
[current API guides](../../packages/workspace/README.md) describe the resulting boundary.

## Engineering challenges

Several changes cut across the chronology:

- [Drag-and-drop inside a zoomed canvas](#drag-and-drop-inside-react-flow)
- [Typed frontend/backend contracts](#typed-contracts-across-python-typescript-and-go)
- [Settings as a Setta project](#setta-configures-itself)
- [Templates, generated classes, metadata and defaults](#from-template-variables-to-generated-state-and-metadata)
- [The custom Draw section](#a-custom-draw-section-inside-the-workspace)
- [External assistants and settings navigation](#external-assistants-and-discoverable-settings)
- [Backup and restoration](#backups-with-a-separate-recovery-path)
- [State-machine execution](#state-machines-turn-connections-into-execution)
- [Experimental workspace renderers](#experimental-workspace-renderers-webgpu-and-canvasflow)

### Coherent undo across several stores

**zundo** entered in April 2023 as temporal middleware for Zustand stores, generally
wrapped around Immer. A single user operation could change parameters, sections,
code information, UI types and project configuration. Independently rewinding those
stores would leave the project inconsistent. The implementation coordinated history
with a shared version: resume recording around the change, record related store
states, pause again, then undo or redo the stores belonging to that version.

zundo was removed in August 2025 as state ownership changed. The current package's
bounded structural history is a separate design, with local or host-delegated authority
and completed gestures as history entries. zundo is historical, not a current dependency.

Sources: [Introduction](https://github.com/riteofstring/setta/commit/6c713a75e8c3c6125ed230e550a452fd707eea50) · [Coordinated histories](https://github.com/riteofstring/setta/blob/2cf4f39dceaf2e9bf28c1f267c8b238fd404c102/frontend/src/thunks/undo.ts) · [Removal](https://github.com/riteofstring/setta/commit/e0b9c1c4144965697f497d0cf09161385cc45afa) · [Current structural history](https://github.com/riteofstring/setta/blob/543735f1b833b0110377f9b1b48260932b7f2abb/packages/workspace/src/history/workspaceHistory.ts).

### Pack and resize in the right coordinate system

**potpack** entered in February 2023. Setta collected measured React Flow rectangles,
added a 50-pixel margin, packed them and applied the resulting positions relative to
the canvas's existing minimum coordinates. Rectangle packing arranged panel sizes;
it did not interpret dependency edges or determine an execution order.

In December 2025, **rectangle-packer**, imported as **rpack**, moved this work into
Python. Its adapter validated and rounded padded sizes, converted lower-left coordinates
to the canvas's top-left coordinates and retained the arrangement's offset. The current
library has its own planner, including locked sections as fixed obstacles.

**re-resizable** supplied resizing for side panes and sections. Canvas zoom made that
more than an ordinary browser resize: the current wrapper captures React Flow's zoom
at gesture start and passes it as `scale`. The xterm.js fork addressed the same mismatch
in terminal mouse coordinates in January 2024. Correctly scaled pixels alone do not
make pointer input use the right coordinate system.

Sources: [potpack adapter](https://github.com/riteofstring/setta/blob/2cf4f39dceaf2e9bf28c1f267c8b238fd404c102/frontend/src/components/UI/Section/ResponsiveControls.jsx) · [Python packing](https://github.com/riteofstring/setta/blob/e9c126b05e56b0dd6bfbf64a3e96414301521000/backend/setta/types/helpers_lvl2.py) · [Current planner](https://github.com/riteofstring/setta/blob/543735f1b833b0110377f9b1b48260932b7f2abb/packages/workspace/src/auto-layout/planner.ts) · [Scale-aware resize](https://github.com/riteofstring/setta/blob/543735f1b833b0110377f9b1b48260932b7f2abb/packages/workspace/src/section/resize/ResizableWithScale.tsx) · [Terminal coordinate correction](https://github.com/riteofstring/setta/commit/6881c2789c56cbfa263e95fff736dc2c098693d8).

### Drag-and-drop inside React Flow

Setta used a fork and adapters around **dnd-kit**, with substantial logic for the
workspace's own nesting rules. A gesture might reorder a parameter, move it into a
group, or detach it onto the canvas. Screen-space movement had to be divided by React
Flow's zoom; collision thresholds also had to respect scale. The target under the
pointer was not necessarily the parent or child that should receive the drop.

Placeholders made collision handling harder by moving the geometry being measured.
**Hysteresis** retained the earlier boundary-crossing decision instead of switching
targets immediately when a placeholder changed the layout. January 2026 code applied
that state to the resolved drop target. An August fix retained a rectangle and crossing
state for each target: briefly encountering a parent could no longer discard the
child's earlier threshold and make it jump when selected again.

Sources: [Resolved-target collision handling](https://github.com/riteofstring/setta/commit/6e990541cf9c8d4c505c381e71bfb1c0b68d7feb) · [Per-target hysteresis and regression example](https://github.com/riteofstring/setta/commit/3b18778247b6196f6fea3e81b9da3acb415d4b50) · [Zoom adapter](https://github.com/riteofstring/setta/blob/543735f1b833b0110377f9b1b48260932b7f2abb/packages/workspace/src/dnd/adapter/zoom.ts).

### Typed contracts across Python, TypeScript and Go

TypeScript adoption began in the spatial frontend, but a second migration made the
application's shared data typed. In May 2025, Python **Pydantic** models began defining
project state and settings. Generators translated those definitions into frontend
**Zod** schemas, TypeScript types and creation functions, replacing separately maintained
default objects. Enums, unions, discriminator fields, optional inputs and defaults all
had to survive that translation. Implementation layers and user defaults added generated
Python helper types and factories as well.

Endpoint generation inspected **FastAPI** routes, Python signatures and return annotations
to emit typed frontend calls. Server-injected dependencies were excluded from client
arguments. Later wrappers used Zod's input types, so fields filled by schema defaults
did not become mandatory caller arguments. Listener clients were generated too. This
was application-contract generation, separate from the Python programs users created
on the canvas.

The 2026 Go migration changed the source of those contracts again. Go-owned types and
metadata fed a shared schema, semantic sidecar and **OpenAPI** projections; TypeScript
bindings and Python models were derived downstream. Defaults and discriminated unions
needed semantic information that a plain field-name translation would lose. Some
surfaces still used explicit Go-owned inventories; this was not universal automatic
discovery. Setta 3 later used its own HTTP endpoint registry and contract generator.

Sources: [Typed project state](https://github.com/riteofstring/setta/commit/ec0431458aa5d39fe0afc7ba2b1e1b5dd662ced8) · [Pydantic to Zod](https://github.com/riteofstring/setta/commit/c0d7f17dfd481285b263f0dde6fbbaac9838b702) · [Generated factories replace defaults](https://github.com/riteofstring/setta/commit/23af84a4dac60097313ec30ca41f9b08ef0771db) · [Endpoint generator](https://github.com/riteofstring/setta/blob/e9c126b05e56b0dd6bfbf64a3e96414301521000/frontend/generation/convert_endpoints.py) · [Schema and factory generator](https://github.com/riteofstring/setta/blob/e9c126b05e56b0dd6bfbf64a3e96414301521000/frontend/generation/convert_pydantic_to_js.py) · [Go generation architecture](https://github.com/riteofstring/setta/blob/eea7fb38c8fdb452766d06b08610248e2962c4fc/docs/reference/generation-contracts.md) · [Setta 3 registry](https://github.com/riteofstring/setta/commit/cd6a12b81bcb49d8d5336e0a9c54e9c2d8c098f2).

### Setta configures itself

September 2024 represented settings as a Setta project whose JSON section pointed at
`setta-settings.json`. The same interface used to configure a user's program could
edit the application's own configuration. October separated its save path from ordinary
projects: save the JSON source and reload settings, rather than store another project
in the database. Reusing the editor did not make the two persistence destinations
interchangeable.

Sources: [Settings project](https://github.com/riteofstring/setta/commit/2a87c216017cfc5d65ef1369355fda7ce43f3fbe) · [Save and reload settings](https://github.com/riteofstring/setta/commit/819e8fb57437af273edfdfc280882c25176937ba).

### From template variables to generated state and metadata

Python generation evolved from emitted scripts to template substitution, then a
generated class in 2025 and a Go renderer by May 2026. The January 2021 implementation
wrapped generated configuration in a runnable Python function and wrote it to a file.

**Templates (2024 to April 2025).** By March 2024, generated Python could be inserted
into authored code through a placeholder. The later syntax used
`$SETTA_GENERATED_PYTHON`; the generated code replaced it, indented to the variable's
column. Section references substituted values too: `$X$version` became
`"Section@Variant"`, `$X$file_path` the path of that section's file, and
`$X$import_path` its module path, which also recorded a dependency between blocks.
Bash blocks handled only the non-generated variables. Code blocks were sorted
topologically, and a circular reference raised `Circular reference detected`. When an
imports placeholder was absent and inference was enabled, missing imports were added
from dotted names, so `torch.nn.X` produced `import torch.nn`.

This generator already retained links back to controls. It tracked generated
variable positions and kept section and parameter IDs in its code metadata. By
July 2024, language-server diagnostics for argument types could be mapped back to
parameters; the later template implementation also handled missing arguments. The
2025 class rewrite changed the generated structure, not the existence of these links.

Sources: [Early executable scripts](https://github.com/riteofstring/setta/commit/e8df01c42cf6098d7b2675def33e7a1364766626) · [March 2024 template insertion](https://github.com/riteofstring/setta/commit/81c9ea687bc199acd8cba551d55da50e1e23c301).

**The class generator (2025).** May 2025 replaced substitution with a generated class,
initially **S** (renamed **SettaState** in December 2025), written to an importable
`setta_gen.py`: the authored prefix, then the class, then the authored suffix. The
default suffix, `s = S()` and later `state = SettaState()`, created the instance; it
was not part of the generated body. The editor showed prefix and suffix around a
read-only generated body. Imports were no longer inferred; authored code supplied
them in the prefix.

**Metadata (January 2026).** Optional **meta-generated code** in `setta_gen_meta.py`
defined frozen project and section records (identity, path, type, parent and selected
variant ID and name). A block after the suffix attached them as `state.__state__`, with
lookup by path or ID: the value module answered “what is configured?”, the metadata
module “which project, section and variant produced it?” This metadata is separate from
the Meta Control widget type.

**Representation policy (January to May 2026).** Values arrive as the text typed into a
control, so generation needs to know what that text means. A policy in Custom Runs
selected eligible section and control types, per-section overrides, and a
representation: parameters as an expression, a quoted string or parsed JSON (falling
back to a string); Draw, Image and Chat sections and dropzone parameters as a file path
or a file read. A missing backing file fell back to an expression such as `None`.
Unsupported type and representation pairs were rejected. These output policies are
distinct from a callable argument's default.

Sources: [Original illustrated template guide](https://setta.dev/old/docs/how_template_variables_work) · [Template substitution](https://github.com/riteofstring/setta/blob/58e54023472c5de600e99180f3ab3fc69bcacc2c/backend/setta/gen_code/create_runnable_scripts.py) · [Wrapper class](https://github.com/riteofstring/setta/commit/0c8758825ab766bd75227989915c5b889af38504) · [SettaState rename](https://github.com/riteofstring/setta/commit/64756421ad4da36921c9ef4bae6e0a9d87df55cb) · [Metadata section](https://github.com/riteofstring/setta/commit/a6339d695e28ffefb4e6c81e482a95e6cf6eabc2) · [Policy controls](https://github.com/riteofstring/setta/commit/fcb042edc5fabff913a8e2b1e03f6cd1044045a9) · [Later representation modes](https://github.com/riteofstring/setta/commit/3189679ae8439e45e9118bc83a237f45f0b518d2) · [Metadata renderer](https://github.com/riteofstring/setta/blob/eea7fb38c8fdb452766d06b08610248e2962c4fc/internal/codegen/python_meta_renderer.go) · [Policy validation](https://github.com/riteofstring/setta/blob/eea7fb38c8fdb452766d06b08610248e2962c4fc/internal/projectstate/python_codegen_policy.go) · [Generated values, metadata and policy contract](https://github.com/riteofstring/setta/blob/eea7fb38c8fdb452766d06b08610248e2962c4fc/docs/reference/codegen-section-policy-and-metadata.md).

### Generate Python with identities and scope

The early `ClassInfo` model described arguments, defaults, annotations and control
types without constructing the represented object. By June 22, 2024, callable
sections requested language-server signature help to populate their parameters.
Working basedpyright integration followed in July 2024. These capabilities predated
the 2025 class generator.

Sources: [Language-server parameter requests](https://github.com/riteofstring/setta/commit/9622a37e95d7ea283cc1fda8fbb484f0120f0b41) · [Working basedpyright integration](https://github.com/riteofstring/setta/commit/7fa3179419) · [July 2024 diagnostics](https://github.com/riteofstring/setta/blob/77cb88eca9/backend/runcoder/lsp/reader.py) · [Template-era variable positions](https://github.com/riteofstring/setta/blob/58e54023472c5de600e99180f3ab3fc69bcacc2c/backend/setta/gen_code/python/generate_code.py) · [Template-era diagnostic mapping](https://github.com/riteofstring/setta/blob/58e54023472c5de600e99180f3ab3fc69bcacc2c/backend/setta/lsp/reader_fns/diagnostics.py).

**One node per value.** The 2025 generator keyed every section and parameter by its
section and parameter IDs. Each became its own attribute named by its path, so the `x`
parameter of `result` became `s.result__x`, list items `parent__0`, and collisions got a
numeric suffix. A callable was written as a call whose keyword arguments referred to
those attributes. Empty and unnamed parameters were left out. Starting from each named
top-level node, a depth-first walk wrote dependencies before the node, so the file read
in dependency order regardless of canvas order.

**References in expressions.** A value could be any Python expression. A visitor built
on the standard-library **ast** module scanned parameter values for `s.<name>`, one
level deep, while `s` was not bound locally (function arguments, loop targets,
comprehensions and assignments). It did not handle lambdas or generator expressions.
Matches became dependencies, and their stored positions let a section rename rewrite
each reference in place. In 2026 the Go generator used tree-sitter with a full scope
stack, including lambdas and assignment expressions, and looked for `state.<name>`.

**Offsets back to controls.** While writing the class, the generator recorded where each
value started in the file, which section and parameter it came from, and a lookup from
each attribute name to its node. The language server's type checker reported problems
by file position: `reportArgumentType` was matched by the attribute it named, and
`reportCallIssue` by the call's value offset, which identified missing or
positional-only arguments. The message was shown on the control. The same offsets
positioned completion and signature help inside a control. This was a table of value
offsets for diagnostics and completion, not a general source map.

**Cycles.** Nothing prevented a cycle on the canvas. The 2025 generator detected cycles
along the current path and printed them, but still wrote every line, so the class could
read an attribute before assigning it. The 2026 Go renderer skipped a node already on
the active path without reporting it. The library's browser executor, which rejects
cycles, is a separate later implementation.

Sources: [Early metadata](https://github.com/riteofstring/setta/blob/6ab75eb9bca555c3db6b04e7cfa232af9efadab4/ABCDE/src/abcde/registration/class_info.py) · [Dependency traversal](https://github.com/riteofstring/setta/blob/b1df92a823e70f6a3fdef91b052609123e021473/backend/setta/code_gen/dependency_graph.py) · [Class generation and offsets](https://github.com/riteofstring/setta/blob/b1df92a823e70f6a3fdef91b052609123e021473/backend/setta/code_gen/python/generate_code.py) · [AST analysis](https://github.com/riteofstring/setta/blob/b1df92a823e70f6a3fdef91b052609123e021473/backend/setta/code_gen/python/ast_utils.py) · [Diagnostics mapping](https://github.com/riteofstring/setta/blob/b1df92a823e70f6a3fdef91b052609123e021473/backend/setta/project_state/lsp_response_handlers/diagnostics.py) · [Go renderer](https://github.com/riteofstring/setta/blob/eea7fb38c8fdb452766d06b08610248e2962c4fc/internal/codegen/python_code_renderer.go) · [Tree-sitter references](https://github.com/riteofstring/setta/blob/eea7fb38c8fdb452766d06b08610248e2962c4fc/internal/codegen/python_expression_refs.go).

### Give resources, callbacks and files different lifetimes

SettaListener used **asyncio** and **websockets** to map relevant changes to callbacks,
with debounce/throttle scheduling and leading/trailing-edge behavior. It accounted
for callbacks already running and pending work superseded by newer input.

Hot reload separated resource construction from a named callback-builder function.
**watchfiles** observed edits, callback rebuilding ran under a lock, the WebSocket
session survived, and the latest project snapshot was replayed. A failed rebuild
restored the previous callbacks. Each reload re-ran the builder's module,
so a model created at that module's top level was loaded again; a model survived an
edit only when it lived in another module or a cache that the reload did not re-run.

Watch Code had a different purpose: discover definitions and synchronize their visual
representations. It did not itself establish that a running callback had been reloaded.

Sources: [Listener scheduling](https://github.com/riteofstring/setta/blob/b1df92a823e70f6a3fdef91b052609123e021473/backend/setta/api/listener.py) · [Hot-reload implementation](https://github.com/riteofstring/setta/blob/eea7fb38c8fdb452766d06b08610248e2962c4fc/backend/setta/api/hot_reload.py) · [Resource contract](https://github.com/riteofstring/setta/blob/eea7fb38c8fdb452766d06b08610248e2962c4fc/docs/reference/setta-listener-hot-reload.md) · [Callable discovery](https://github.com/riteofstring/setta/blob/eea7fb38c8fdb452766d06b08610248e2962c4fc/internal/watchcode/python_callables.go).

### A custom Draw section inside the workspace

The 2024–2025 Draw section used a custom **Canvas 2D** implementation. Each layer had
a canvas, with separate draft and temporary surfaces for strokes and image artifacts.
Stored paths, layer order, visibility, opacity and artifact transforms could be rendered
again; the drawing was not just one flattened bitmap. Draw mode handled strokes and
erasure, while edit mode selected, moved and resized artifacts.

Pointer coordinates needed to agree with both workspace zoom and an artifact's own
translation and scale. Inverse transforms supported that local editing. Compositing
produced the combined drawing and individual layer images as PNG/base64 data for live
Python inputs, with throttling and a transfer queue. This custom section predates the
separate Realtime application's **Fabric.js** editor and the later library's smaller
drawing primitives.

Sources: [Draw surface](https://github.com/riteofstring/setta/blob/b1df92a823e70f6a3fdef91b052609123e021473/frontend/src/components/Section/Layouts/DrawArea/DrawArea.tsx) · [Coordinate and layer rendering](https://github.com/riteofstring/setta/blob/b1df92a823e70f6a3fdef91b052609123e021473/frontend/src/components/Section/Layouts/DrawArea/canvasUtils.ts) · [Input handling](https://github.com/riteofstring/setta/blob/b1df92a823e70f6a3fdef91b052609123e021473/frontend/src/components/Section/Layouts/DrawArea/useDrawModeMouseHandlers.ts) · [Image export](https://github.com/riteofstring/setta/blob/b1df92a823e70f6a3fdef91b052609123e021473/frontend/src/components/Section/Layouts/DrawArea/base64Conversion.ts).

### A browser editor needs services behind it

CodeMirror and xterm.js presented editors and terminals; they did not implement the
whole programming environment. The Python service managed a language-server process
and synchronized files through **watchdog**. **basedpyright**, **lsprotocol**, **Ruff**,
**docstring_parser** and **docstring-to-markdown** supplied distinct analysis,
formatting and documentation responsibilities.

The terminal backend spawned an operating-system PTY, selected a shell, retained bounded
output history and fanned output to WebSocket clients. **ptyprocess** served Unix,
**pywinpty** served Windows and **psutil** supplied process information. Moving server
responsibilities to Go later retained Python as a user-computation and plugin environment.

Sources: [Language-server management](https://github.com/riteofstring/setta/blob/b1df92a823e70f6a3fdef91b052609123e021473/backend/setta/lsp/managers.py) · [Terminal backend](https://github.com/riteofstring/setta/blob/b1df92a823e70f6a3fdef91b052609123e021473/backend/setta/terminals/terminals.py) · [Python packages](https://github.com/riteofstring/setta/blob/b1df92a823e70f6a3fdef91b052609123e021473/setup.cfg) · [Go packages](https://github.com/riteofstring/setta/blob/eea7fb38c8fdb452766d06b08610248e2962c4fc/go.mod) · [Later Python boundary](https://github.com/riteofstring/setta/blob/eea7fb38c8fdb452766d06b08610248e2962c4fc/pyproject.toml).

### External assistants and discoverable settings

The December 2025 stdio **MCP** bridge relayed an external client's tool calls to the
running backend's SSE endpoint and retained project context between calls. The CLI
also exposed tool schemas through `setta tools` and JSON invocation through `setta api`.
The operation model could therefore serve assistants outside Setta's own chat.

February 2026's settings registry added typed IDs, schemas, mutability and UI location.
Tools could search, read, validate a write, or reveal a registered setting. The frontend
opened the relevant pane/tab, waited for its setting anchor, scrolled to it and applied
a temporary highlight. Initial coverage included Watch Code, App configuration and
parameter display names, with plugin extensions. This was targeted side-pane navigation,
distinct from Follow AI's movement between canvas sections.

Sources: [stdio bridge](https://github.com/riteofstring/setta/commit/a1a25f079792a6faa9d9b38e347eaaf6e3e054ea) · [CLI operations](https://github.com/riteofstring/setta/blob/eabd8f56e9273148d3cd771860dc290ca191255d/backend/setta/start.py) · [Settings registry and reveal pipeline](https://github.com/riteofstring/setta/commit/eabd8f56e9273148d3cd771860dc290ca191255d).

### Backups with a separate recovery path

September 2024 added periodic project database backups with configurable frequency and
retention. February 2026 enabled backups by default: every five minutes, retaining ten
under the default settings. The CLI could list them and restore by latest, index or path.
Before replacement, it stashed the existing project under a different filename prefix
that ordinary backup pruning did not remove. Restoration also checked for a running
workspace. Undo, autosave and recoverable database copies addressed different failures.

Sources: [Initial backups](https://github.com/riteofstring/setta/commit/f38c819e23b9b057b6f4e73ecfc5a1dea4528f09) · [Configurable retention](https://github.com/riteofstring/setta/commit/6db9895468eeccdba220ba4016160dde3f93dbfe) · [Default enablement and restore CLI](https://github.com/riteofstring/setta/commit/4924b708e09d380a305605bc8b4d01535e01b03f).

### Distinguish values, access and workflow control

Python edges described value dependencies; agent edges described readable or writable
context; workflow edges described dispatch after completion, failure or signals. AND/OR/XOR
gates, activation counts, limits and draft-versus-runnable validation belonged to the
workflow model. Similar-looking connections did not give the three systems identical semantics.

**bm25s** provided lexical search over MCP tool descriptions, while **Gonja** rendered
prompt templates in the Go workbench. Tool discovery, prompt rendering and provider SDKs
were separate pieces of the agent integration.

Sources: [Agent access](https://github.com/riteofstring/setta/blob/eea7fb38c8fdb452766d06b08610248e2962c4fc/docs/reference/agentic-edges.md) · [Workflow control](https://github.com/riteofstring/setta/blob/eea7fb38c8fdb452766d06b08610248e2962c4fc/docs/reference/state-machine-workflows.md) · [Tool search](https://github.com/riteofstring/setta/blob/e9c126b05e56b0dd6bfbf64a3e96414301521000/backend/setta/mcp/tools/tool_search.py) · [Prompt rendering](https://github.com/riteofstring/setta/blob/eea7fb38c8fdb452766d06b08610248e2962c4fc/internal/promptrender/render.go).

### State machines turn connections into execution

The March 2026 workbench introduced a control-flow graph with **Start, Gate, End and
Chat** sections. Machine groups identified workflows independently of their screen
positions. An incomplete graph could remain editable, but execution required a valid
start/end structure. Edges dispatched work after completion, failure or a structured
signal; target actions could reset a thread or send a resolved prompt.

AND/OR/XOR gates tracked progress, while activation conditions and runtime limits
bounded execution. Runs exposed status, signal events and failure information, with
start, stop and reset controls. A signal was reported from an active child run rather
than inferred from arbitrary chat text. The visual history's two-reviewer example
shows both responses completing before an AND gate proceeds. Setta 3's later workflow
editor and durable Go/SQLite engine were a separate implementation.

Sources: [Python workflow runner](https://github.com/riteofstring/setta/blob/1f435b942c7d2860b368f34d91cf6fe1cd7becea/backend/setta/agentic/state_machine_runner.py) · [Workflow contract](https://github.com/riteofstring/setta/blob/eea7fb38c8fdb452766d06b08610248e2962c4fc/docs/reference/state-machine-workflows.md) · [Visual example](https://setta.dev/features/#line-ai).

### Experimental workspace renderers: WebGPU and CanvasFlow

Spring 2026 explored replacing the workspace's rendering path while retaining HTML
content and editing. **WebGPU/GPUFlow** began with a device and canvas surface using
experimental Chromium HTML-in-canvas APIs. Later architecture combined cached HTML
textures, retained parameter-page textures and GPU-drawn visuals with browser-owned
editors and DOM control islands. Camera changes could reuse textures; hit targets,
clipping and overlays had to match the same presented content frame. Keeping interaction
and pixels coherent was as important as submitting fewer paints.

**CanvasFlow** was a separate WebGL/HTML-texture approach. It uploaded changed visible
HTML nodes, reused textures during pan/zoom, evicted cached textures against a memory
budget and drew edges on canvas. Capability checks selected WebGL texture nodes where
supported, with a Canvas 2D path otherwise. A recorded check observed unchanged upload
counts during viewport movement, but the accompanying report still listed incomplete
box selection and a pointer-created-edge problem involving obscured handles.

These were implemented experiments with browser-specific requirements and interaction
gaps. They do not establish a general performance win or describe the current library's
upstream xyflow renderer. They are also distinct from Setta 4's later WebGL2 Director graph.

Sources: [WebGPU foundation](https://github.com/riteofstring/setta/commit/07b1e718a14a216e3cabd071ffa249bc3a073fff) · [Later GPUFlow architecture](https://github.com/riteofstring/setta/blob/964a673e38711afdece6e1a1ae05b241f31847d2/docs/reference/html-in-canvas-architecture.md) · [CanvasFlow implementation](https://github.com/riteofstring/setta/commit/70fedb48b442c91a6dc0d3100ca339522dc2fde7) · [CanvasFlow measurements and remaining gaps](https://github.com/riteofstring/setta/blob/70fedb48b442c91a6dc0d3100ca339522dc2fde7/perf/reports/frontend/2026-04-28_canvasflow-webgl-default-promotion.md).

### Retain evidence without confusing it with execution

Setta 3's Go/SQLite workflow store persisted definition versions, execution transitions
and events, with explicit persistence and corruption errors. Setta 4's separate graph
represented runtime facts, declarations and model-attributed interpretations. The
retrospective's authored graphs, validated drafts and built-in replay interfaces do not
establish successful live orchestration. The library was extracted from the Setta 2 line.

Sources: [Workflow persistence](https://github.com/riteofstring/setta/blob/6258039962ac90a9e5fd44c141c50ce48843b209/internal/orchestrator/store.go) · [Director renderer](https://github.com/riteofstring/setta/blob/bd5cd3d0898d5ced1961532034e3b9284fa3146b/desktop/src/renderer/src/features/director-graph/render/director-graph-renderer.ts) · [Artifact interface](https://github.com/riteofstring/setta/blob/bd5cd3d0898d5ced1961532034e3b9284fa3146b/desktop/src/renderer/src/features/artifacts/SettaArtifactRenderer.tsx).

### Keep stale work from overwriting the latest input

Realtime's application-owned Go scheduler coordinated Python workers, bounded concurrency,
latest-input work and lineage-matched joins. The later generic browser client was a
separate implementation: one active request, only the latest pending input, monotonic
revisions and retention of the last successful output. Obsolete progress and results
could not overwrite newer input; cancellation and timeout terminated the worker.

The browser executor validates dependencies, rejects cycles and memoizes stage promises
so a shared stage runs once per request. Independent asynchronous branches can progress
concurrently, but a single Web Worker is not a CPU thread pool. The host supplies the
computation rather than inheriting the historical application runtimes.

Sources: [Realtime scheduler](https://github.com/riteofstring/setta/blob/74837d35da5cb21bdff2ebc1ebaab0cbb77d5ceb/apps/realtime/backend/internal/scheduler/scheduler.go) · [Browser lifecycle](https://github.com/riteofstring/setta/blob/543735f1b833b0110377f9b1b48260932b7f2abb/packages/workspace/src/browser/client.ts) · [Graph executor](https://github.com/riteofstring/setta/blob/543735f1b833b0110377f9b1b48260932b7f2abb/packages/workspace/src/browser/execute.ts).

## Library index by role

These are notable direct dependencies and observed language facilities, not a list of
every transitive package. A historical dependency is not necessarily in the current package.

| Role                             | Libraries and facilities                                                                                                                  | Use and period                                                                                                                                     | Sources                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Early navigation                 | react-map-interaction, react-sizeme, Framer Motion                                                                                        | 2021 measured pan/zoom, custom scrollbars and Overview-aware positioning before React Flow.                                                        | [Implementation](#panning-before-react-flow)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Shared typed contracts           | Pydantic, Zod, TypeScript, FastAPI, OpenAPI, Go                                                                                           | 2025–2026 schemas, defaults, endpoint clients and cross-language generation.                                                                       | [Implementations](#typed-contracts-across-python-typescript-and-go)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Custom Draw section              | Canvas 2D, PNG/base64, React                                                                                                              | 2024–2025 layered drawing and live Python image input; separate from Realtime’s Fabric.js editor.                                                  | [Implementation](#a-custom-draw-section-inside-the-workspace)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Experimental workspace renderers | WebGPU, WGSL, CanvasFlow, WebGL, HTML-in-canvas                                                                                           | Spring 2026 texture caches, GPU visuals and DOM editing, with browser-specific requirements.                                                       | [Implementations and limits](#experimental-workspace-renderers-webgpu-and-canvasflow)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Languages and browser facilities | Python, JavaScript, JSX, TypeScript, Go, GLSL, WebGL2, Web Workers, Web Audio                                                             | Python metadata and user programs; browser UI; Go services; Setta 4 shaders; current worker and audio consumers.                                   | [1](https://github.com/riteofstring/setta/blob/6ab75eb9bca555c3db6b04e7cfa232af9efadab4/ABCDE/src/abcde/registration/class_info.py), [2](https://github.com/riteofstring/setta/blob/eea7fb38c8fdb452766d06b08610248e2962c4fc/go.mod), [3](https://github.com/riteofstring/setta/blob/bd5cd3d0898d5ced1961532034e3b9284fa3146b/desktop/src/renderer/src/features/director-graph/render/graph-shaders.ts), [4](https://github.com/riteofstring/setta/blob/543735f1b833b0110377f9b1b48260932b7f2abb/packages/workspace/src/browser/client.ts)                                                                                                                                                                                |
| Early interface                  | React, Create React App / react-scripts, Chakra UI, Emotion, Easy Peasy, Framer Motion                                                    | 2020–2022 React forms, presentation and application state.                                                                                         | [1](https://github.com/riteofstring/setta/blob/c436b2cc7939d2c69feafa1419ae95cfa33c2c57/abcde-frontend/package.json), [2](https://github.com/riteofstring/setta/blob/8217da51fdfe52f8983122c9b8aa091adcbf2243/abcde-frontend/package.json)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Early form helpers               | Formik, Yup, chakra-ui-autocomplete, react-measure                                                                                        | Declared by the 2022 frontend for its form and measurement toolkit; not a current-package inventory.                                               | [1](https://github.com/riteofstring/setta/blob/8217da51fdfe52f8983122c9b8aa091adcbf2243/abcde-frontend/package.json)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| State and history                | Zustand, Immer, zundo, use-sync-external-store                                                                                            | Zustand/Immer stores; coordinated temporal histories from 2023; zundo removed August 2025; host-scoped stores and custom structural history today. | [1](https://github.com/riteofstring/setta/blob/2cf4f39dceaf2e9bf28c1f267c8b238fd404c102/frontend/src/thunks/undo.ts), [2](https://github.com/riteofstring/setta/commit/e0b9c1c4144965697f497d0cf09161385cc45afa), [3](https://github.com/riteofstring/setta/blob/543735f1b833b0110377f9b1b48260932b7f2abb/packages/workspace/package.json)                                                                                                                                                                                                                                                                                                                                                                                |
| Panel layout                     | potpack, rectangle-packer / rpack, re-resizable                                                                                           | Rectangle packing in 2023; backend packing in December 2025; scale-aware resizing across generations.                                              | [1](https://github.com/riteofstring/setta/blob/2cf4f39dceaf2e9bf28c1f267c8b238fd404c102/frontend/src/components/UI/Section/ResponsiveControls.jsx), [2](https://github.com/riteofstring/setta/blob/e9c126b05e56b0dd6bfbf64a3e96414301521000/backend/setta/types/helpers_lvl2.py), [3](https://github.com/riteofstring/setta/blob/543735f1b833b0110377f9b1b48260932b7f2abb/packages/workspace/src/section/resize/ResizableWithScale.tsx)                                                                                                                                                                                                                                                                                   |
| Canvas and drag                  | React Flow, react-flow-renderer, reactflow, xyflow, dnd-kit, d3-zoom, d3-drag, d3-selection, d3-interpolate                               | Canvas generations, nested drag interactions and zoom/pointer math. Earlier React Flow package names refer to different revisions.                 | [1](https://github.com/riteofstring/setta/blob/8217da51fdfe52f8983122c9b8aa091adcbf2243/abcde-frontend/package.json), [2](https://github.com/riteofstring/setta/blob/b1df92a823e70f6a3fdef91b052609123e021473/frontend/package.json), [3](https://github.com/riteofstring/setta/blob/543735f1b833b0110377f9b1b48260932b7f2abb/packages/workspace/package.json)                                                                                                                                                                                                                                                                                                                                                            |
| Selection and search             | Downshift, match-sorter, Lodash                                                                                                           | Combobox state, ranked choices/search and data utilities across the workspace.                                                                     | [1](https://github.com/riteofstring/setta/blob/1bf50d179e82b2437da3d0432d8a91f883561fc5/abcde-frontend/package.json), [2](https://github.com/riteofstring/setta/blob/b1df92a823e70f6a3fdef91b052609123e021473/frontend/package.json), [3](https://github.com/riteofstring/setta/blob/543735f1b833b0110377f9b1b48260932b7f2abb/packages/workspace/package.json)                                                                                                                                                                                                                                                                                                                                                            |
| Components and styles            | Radix UI, Tailwind CSS, PostCSS, Base UI, react-icons                                                                                     | Later workbench and library controls/styles; Base UI belongs to Setta 4.                                                                           | [1](https://github.com/riteofstring/setta/blob/1bf50d179e82b2437da3d0432d8a91f883561fc5/abcde-frontend/package.json), [2](https://github.com/riteofstring/setta/blob/bd5cd3d0898d5ced1961532034e3b9284fa3146b/desktop/package.json), [3](https://github.com/riteofstring/setta/blob/543735f1b833b0110377f9b1b48260932b7f2abb/packages/workspace/package.json)                                                                                                                                                                                                                                                                                                                                                             |
| Code editor                      | Monaco Editor, CodeMirror 6, Lezer, @uiw/react-codemirror                                                                                 | Early developer editor, then source/expression editors and frontend syntax infrastructure.                                                         | [1](https://github.com/riteofstring/setta/blob/c436b2cc7939d2c69feafa1419ae95cfa33c2c57/abcde-frontend/package.json), [2](https://github.com/riteofstring/setta/blob/b1df92a823e70f6a3fdef91b052609123e021473/frontend/package.json)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Python understanding             | inspect, ast, Jedi, mypy, basedpyright, lsprotocol, Tree-sitter                                                                           | Metadata, scoped expression analysis, CLI/language-server analysis and later Go-side Python discovery.                                             | [1](https://github.com/riteofstring/setta/blob/6ab75eb9bca555c3db6b04e7cfa232af9efadab4/ABCDE/src/abcde/registration/class_info.py), [2](https://github.com/riteofstring/setta/blob/b1df92a823e70f6a3fdef91b052609123e021473/backend/setta/code_gen/python/ast_utils.py), [3](https://github.com/riteofstring/setta/blob/f8ac2b31ba2cd0496006479f1e73a3036a2a68f3/abcde-cli/setup.py), [4](https://github.com/riteofstring/setta/blob/b1df92a823e70f6a3fdef91b052609123e021473/setup.cfg), [5](https://github.com/riteofstring/setta/blob/eea7fb38c8fdb452766d06b08610248e2962c4fc/internal/watchcode/python_callables.go)                                                                                                |
| Formatting and help              | Ruff, docstring_parser, docstring-to-markdown                                                                                             | Backend formatting and conversion of Python documentation into editor help.                                                                        | [1](https://github.com/riteofstring/setta/blob/b1df92a823e70f6a3fdef91b052609123e021473/setup.cfg)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Prose and mathematics            | react-markdown, remark-gfm, remark-math, rehype-katex, KaTeX, @uiw/react-md-editor                                                        | Markdown editing/rendering and 2025 math presentation; not all of these remained in the extracted package.                                         | [1](https://github.com/riteofstring/setta/blob/2cf4f39dceaf2e9bf28c1f267c8b238fd404c102/frontend/package.json), [2](https://github.com/riteofstring/setta/blob/b1df92a823e70f6a3fdef91b052609123e021473/frontend/package.json), [3](https://github.com/riteofstring/setta/blob/543735f1b833b0110377f9b1b48260932b7f2abb/packages/workspace/package.json)                                                                                                                                                                                                                                                                                                                                                                  |
| Charts                           | visx, d3-scale-chromatic, Chart.js, Recharts                                                                                              | Earlier workbench charts, later Chart.js, and Setta 4 artifact plots.                                                                              | [1](https://github.com/riteofstring/setta/blob/2cf4f39dceaf2e9bf28c1f267c8b238fd404c102/frontend/package.json), [2](https://github.com/riteofstring/setta/blob/b1df92a823e70f6a3fdef91b052609123e021473/frontend/package.json), [3](https://github.com/riteofstring/setta/blob/bd5cd3d0898d5ced1961532034e3b9284fa3146b/desktop/package.json)                                                                                                                                                                                                                                                                                                                                                                             |
| Tables and spreadsheets          | Glide Data Grid, SheetJS / xlsx, Apache ECharts, TanStack Table, TanStack Virtual                                                         | 2026 spreadsheet surfaces and Experiment Lens’s analysis views.                                                                                    | [1](https://github.com/riteofstring/setta/blob/eea7fb38c8fdb452766d06b08610248e2962c4fc/frontend/package.json), [2](https://github.com/riteofstring/setta/blob/74837d35da5cb21bdff2ebc1ebaab0cbb77d5ceb/apps/experiment-lens/package.json)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Long content                     | react-window, react-virtuoso, highlight.js                                                                                                | Workbench virtualization and Setta 3’s long textual/scrolling content.                                                                             | [1](https://github.com/riteofstring/setta/blob/eea7fb38c8fdb452766d06b08610248e2962c4fc/frontend/package.json), [2](https://github.com/riteofstring/setta/blob/6258039962ac90a9e5fd44c141c50ce48843b209/desktop/package.json)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Files, drawing and review        | react-dropzone, Fabric.js, Ajv, @pierre/diffs                                                                                             | File input, Realtime drawing, app contract validation and Review diff presentation.                                                                | [1](https://github.com/riteofstring/setta/blob/8217da51fdfe52f8983122c9b8aa091adcbf2243/abcde-frontend/package.json), [2](https://github.com/riteofstring/setta/blob/74837d35da5cb21bdff2ebc1ebaab0cbb77d5ceb/apps/realtime/package.json), [3](https://github.com/riteofstring/setta/blob/74837d35da5cb21bdff2ebc1ebaab0cbb77d5ceb/apps/review/package.json)                                                                                                                                                                                                                                                                                                                                                              |
| Desktop and terminals            | Electron, electron-builder, node-pty, xterm.js / @xterm/xterm, ptyprocess, pywinpty, psutil                                               | Local desktop bridge, terminal display and actual process management.                                                                              | [1](https://github.com/riteofstring/setta/blob/5861d9ddb3316f85d0df71b5bb385131f1daf169/abcde-electron/package.json), [2](https://github.com/riteofstring/setta/blob/b1df92a823e70f6a3fdef91b052609123e021473/backend/setta/terminals/terminals.py), [3](https://github.com/riteofstring/setta/blob/b1df92a823e70f6a3fdef91b052609123e021473/setup.cfg), [4](https://github.com/riteofstring/setta/blob/6258039962ac90a9e5fd44c141c50ce48843b209/desktop/package.json)                                                                                                                                                                                                                                                    |
| Django backend                   | Django, Django REST Framework, Knox, Graphene-Django, SQLite                                                                              | Early Python service and authentication; a distinct 2021 GraphQL experiment.                                                                       | [1](https://github.com/riteofstring/setta/blob/e8df01c42cf6098d7b2675def33e7a1364766626/ABCDE/backend/abcde/settings.py), [2](https://github.com/riteofstring/setta/commit/25ff8eb296ba873a14f023fb3ae6785567dd1e12)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Node backends                    | NestJS, AdonisJS, MikroORM, PostgreSQL, Koa, Express, Prisma, Passport                                                                    | 2022–2023 service/database/authentication experiments and the retained split backend.                                                              | [1](https://github.com/riteofstring/setta/blob/038030aa2e48041dde30687f534a657661b2f085/abcde-backend/package.json), [2](https://github.com/riteofstring/setta/blob/8d4216b67abede8d0336f8e995da725e60c16d66/abcde-backend/package.json), [3](https://github.com/riteofstring/setta/commit/0c6897e606b807f4ce1f939ffa9d01aa856e6495), [4](https://github.com/riteofstring/setta/blob/566b0d60a9130e66b559ae7840ee3da78b5b09cf/abcde-backend/package.json), [5](https://github.com/riteofstring/setta/blob/b8740e0cf2bf1c35b43282f3e783f87bdb0cf5c7/abcde-backend/package.json), [6](https://github.com/riteofstring/setta/blob/b8740e0cf2bf1c35b43282f3e783f87bdb0cf5c7/abcde-backend/prisma/schema.prisma)               |
| Local Python services            | FastAPI, Uvicorn, Pydantic, SQLAlchemy, SQLite, Click                                                                                     | HTTP and WebSocket service, structured models, persistence and earlier CLI.                                                                        | [1](https://github.com/riteofstring/setta/blob/b1df92a823e70f6a3fdef91b052609123e021473/setup.cfg), [2](https://github.com/riteofstring/setta/blob/b1df92a823e70f6a3fdef91b052609123e021473/backend/setta/database/db_objs.py), [3](https://github.com/riteofstring/setta/blob/f8ac2b31ba2cd0496006479f1e73a3036a2a68f3/abcde-cli/setup.py)                                                                                                                                                                                                                                                                                                                                                                               |
| Transport and serialization      | Axios, requests, websockets, PyYAML, yaml, Zod                                                                                            | Browser/server calls, live connections, configuration files and structured frontend inputs.                                                        | [1](https://github.com/riteofstring/setta/blob/8217da51fdfe52f8983122c9b8aa091adcbf2243/abcde-frontend/package.json), [2](https://github.com/riteofstring/setta/blob/b1df92a823e70f6a3fdef91b052609123e021473/frontend/package.json), [3](https://github.com/riteofstring/setta/blob/f8ac2b31ba2cd0496006479f1e73a3036a2a68f3/abcde-cli/setup.py), [4](https://github.com/riteofstring/setta/blob/b1df92a823e70f6a3fdef91b052609123e021473/setup.cfg)                                                                                                                                                                                                                                                                     |
| File and callback lifetime       | watchdog, watchfiles, asyncio, importlib                                                                                                  | File/LSP watching, live scheduling and callback reload without reconstructing long-lived resources.                                                | [1](https://github.com/riteofstring/setta/blob/b1df92a823e70f6a3fdef91b052609123e021473/backend/setta/lsp/managers.py), [2](https://github.com/riteofstring/setta/blob/b1df92a823e70f6a3fdef91b052609123e021473/backend/setta/api/listener.py), [3](https://github.com/riteofstring/setta/blob/eea7fb38c8fdb452766d06b08610248e2962c4fc/backend/setta/api/hot_reload.py)                                                                                                                                                                                                                                                                                                                                                  |
| Go service toolkit               | chi, Huma, coder/websocket, go-pty, creack/pty, modernc.org/sqlite                                                                        | HTTP/API, live connections, process terminals and durable records in the Go generations.                                                           | [1](https://github.com/riteofstring/setta/blob/eea7fb38c8fdb452766d06b08610248e2962c4fc/go.mod), [2](https://github.com/riteofstring/setta/blob/6258039962ac90a9e5fd44c141c50ce48843b209/go.mod)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Agent integrations               | MCP Python SDK, MCP Go SDK, Anthropic SDK, OpenAI SDK, Google GenAI SDK, claude-agent-sdk                                                 | Tool protocol, model transports and Python agent sidecars. These are application integrations, not final-library requirements.                     | [1](https://github.com/riteofstring/setta/blob/b1df92a823e70f6a3fdef91b052609123e021473/setup.cfg), [2](https://github.com/riteofstring/setta/blob/eea7fb38c8fdb452766d06b08610248e2962c4fc/go.mod), [3](https://github.com/riteofstring/setta/blob/eea7fb38c8fdb452766d06b08610248e2962c4fc/pyproject.toml)                                                                                                                                                                                                                                                                                                                                                                                                              |
| Templates and tool retrieval     | Gonja, bm25s                                                                                                                              | Go prompt templates and lexical search over MCP tool descriptions.                                                                                 | [1](https://github.com/riteofstring/setta/blob/eea7fb38c8fdb452766d06b08610248e2962c4fc/internal/promptrender/render.go), [2](https://github.com/riteofstring/setta/blob/e9c126b05e56b0dd6bfbf64a3e96414301521000/backend/setta/mcp/tools/tool_search.py)                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Hosted companion                 | Clerk, psycopg2, PostgreSQL, httpx, JWT tooling, Fly.io Machines                                                                          | Identity, storage, service calls and deployments in the separate setta-saas application.                                                           | [1](https://github.com/riteofstring/setta/blob/679012671252e83ebe0902de6347317655f1621b/setta-saas/frontend/package.json), [2](https://github.com/riteofstring/setta/blob/679012671252e83ebe0902de6347317655f1621b/setta-saas/backend/requirements.txt), [3](https://github.com/riteofstring/setta/commit/714290e028dcef6d83d5ac6649b8223b107e7b33)                                                                                                                                                                                                                                                                                                                                                                       |
| Learning examples                | PyTorch, torchvision, PyTorch Metric Learning, record-keeper, TensorBoard, Transformers, Datasets, Evaluate, scikit-learn, TRL, SapientML | Training, evaluation and AutoML supplied by example applications.                                                                                  | [1](https://github.com/riteofstring/setta/blob/6ab75eb9bca555c3db6b04e7cfa232af9efadab4/ABCDE/conda_env.yaml), [2](https://github.com/riteofstring/setta/blob/38f81658cacd57f86ca293eecb5ccdf6e8b03f29/setta-examples/pytorch_metric_learning_trainer/requirements.txt), [3](https://github.com/riteofstring/setta/blob/38f81658cacd57f86ca293eecb5ccdf6e8b03f29/setta-examples/transformers_trainer/requirements.txt), [4](https://github.com/riteofstring/setta/blob/38f81658cacd57f86ca293eecb5ccdf6e8b03f29/setta-examples/trl_language_model_finetuning/requirements.txt), [5](https://github.com/riteofstring/setta/blob/38f81658cacd57f86ca293eecb5ccdf6e8b03f29/setta-examples/sapientml_automl/requirements.txt) |
| Generation and chat examples     | StreamDiffusion, Diffusers, Transformers, Groq SDK                                                                                        | Drawing-to-image, FLUX inpainting and a Python chat application.                                                                                   | [1](https://github.com/riteofstring/setta/blob/38f81658cacd57f86ca293eecb5ccdf6e8b03f29/setta-examples/stream_diffusion_img_to_img/README.md), [2](https://github.com/riteofstring/setta/blob/38f81658cacd57f86ca293eecb5ccdf6e8b03f29/setta-examples/bfl_flux_fill/requirements.txt), [3](https://github.com/riteofstring/setta/blob/38f81658cacd57f86ca293eecb5ccdf6e8b03f29/setta-examples/groq_api_chat/requirements.txt)                                                                                                                                                                                                                                                                                             |
| Alternative graph renderers      | PixiJS, pixi-viewport, WebGL2, GLSL, OpenUI                                                                                               | Setta 3’s research graph and Setta 4’s separate Director/artifact experiment.                                                                      | [1](https://github.com/riteofstring/setta/blob/6258039962ac90a9e5fd44c141c50ce48843b209/desktop/src/renderer/src/features/workspace-graph/pixi-renderer-application.js), [2](https://github.com/riteofstring/setta/blob/bd5cd3d0898d5ced1961532034e3b9284fa3146b/desktop/src/renderer/src/features/director-graph/render/director-graph-renderer.ts), [3](https://github.com/riteofstring/setta/blob/bd5cd3d0898d5ced1961532034e3b9284fa3146b/desktop/src/renderer/src/features/director-graph/render/graph-shaders.ts), [4](https://github.com/riteofstring/setta/blob/bd5cd3d0898d5ced1961532034e3b9284fa3146b/desktop/src/renderer/src/features/artifacts/SettaArtifactRenderer.tsx)                                   |
| Build and companion sites        | Vite, TypeScript, electron-vite, Astro, Docusaurus, Three.js, Web Audio                                                                   | Browser and desktop builds, preserved website/docs, and the current audio demonstration.                                                           | [1](https://github.com/riteofstring/setta/commit/ceb0a25a7696373ca8e5ddb605b687d40538d8a1), [2](https://github.com/riteofstring/setta/blob/6258039962ac90a9e5fd44c141c50ce48843b209/desktop/package.json), [3](https://github.com/riteofstring/setta/blob/543735f1b833b0110377f9b1b48260932b7f2abb/packages/workspace/package.json)                                                                                                                                                                                                                                                                                                                                                                                       |

## Libraries inside the example applications

Many recognizable results came from libraries used by a particular application, rather
than from Setta's workspace package. The [original gallery](examples.md) and
[focused demonstrations](feature-demos.md) show the interfaces built around them.

| Application                             | Libraries and their role                                                                                        |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| [Stream Diffusion][stream]              | StreamDiffusion supplied the drawing-to-image computation.                                                      |
| [FLUX inpainting][flux]                 | Hugging Face Diffusers and Transformers supplied the model pipeline.                                            |
| [Language-model finetuning][trl]        | TRL and Datasets supplied training and dataset tools.                                                           |
| [Sequence classification][transformers] | Transformers, Datasets, Evaluate and scikit-learn supplied training and evaluation.                             |
| [SapientML AutoML][sapient]             | SapientML supplied the automatic machine-learning workflow.                                                     |
| [Groq chat][groq]                       | The Groq SDK supplied the model API used by the Python chat example.                                            |
| [Metric learning][metric]               | PyTorch Metric Learning, torchvision, record-keeper and TensorBoard supplied training and records.              |
| [Python Canvas][canvasapp]              | basedpyright and xterm.js supported authoring and execution around the shared workspace.                        |
| [Realtime][realtime]                    | Fabric.js supplied the drawing editor; Ajv validated structured inputs. Python handlers owned the computations. |
| [Experiment Lens][lens]                 | Apache ECharts supplied plots; TanStack Table and Virtual supplied tabular presentation; Ajv validated inputs.  |
| [Review][review]                        | `@pierre/diffs` supplied diff presentation and Ajv validated the review documents.                              |

The later applications also shared [Go backend support][localbackend]. Their server,
Python, plotting and drawing dependencies did not all become dependencies of the final
browser package.

## The websites and documentation

The companion website has its own stack and repository. The preserved Python-era site
uses **Astro**, and its documentation uses **Docusaurus**. Today's interactive audio demo
uses **React, Vite, Three.js and Web Audio**, with Setta providing workspace interactions.
Its sound engine and 3D scenery belong to that application. The retrospective itself is
a static Vite page; it does not execute the historical applications in the visitor's browser.
See the [website source](https://github.com/riteofstring/setta-site), its
[archive guide](https://github.com/riteofstring/setta-site/blob/main/docs/design/site.md#python-era-archive)
and the [audio-demo boundary](../examples/instrument.md).

[History guide](README.md) · [Chronological feature history](feature-history.md) · [Tags and checkpoints](tags.md)

[python2020]: https://github.com/riteofstring/setta/blob/6ab75eb9bca555c3db6b04e7cfa232af9efadab4/ABCDE/src/abcde/registration/class_info.py
[conda2020]: https://github.com/riteofstring/setta/blob/6ab75eb9bca555c3db6b04e7cfa232af9efadab4/ABCDE/conda_env.yaml
[front2020]: https://github.com/riteofstring/setta/blob/c436b2cc7939d2c69feafa1419ae95cfa33c2c57/abcde-frontend/package.json
[django2021]: https://github.com/riteofstring/setta/blob/e8df01c42cf6098d7b2675def33e7a1364766626/ABCDE/backend/abcde/settings.py
[electron2021]: https://github.com/riteofstring/setta/blob/e8df01c42cf6098d7b2675def33e7a1364766626/abcde-frontend/public/electron.js
[desktop2021]: https://github.com/riteofstring/setta/blob/5861d9ddb3316f85d0df71b5bb385131f1daf169/abcde-electron/package.json
[graphql2021]: https://github.com/riteofstring/setta/commit/25ff8eb296ba873a14f023fb3ae6785567dd1e12
[flow2022]: https://github.com/riteofstring/setta/blob/8217da51fdfe52f8983122c9b8aa091adcbf2243/abcde-frontend/package.json
[vite2022]: https://github.com/riteofstring/setta/commit/ceb0a25a7696373ca8e5ddb605b687d40538d8a1
[radix2022]: https://github.com/riteofstring/setta/commit/50b6998345aac0608fc73786a63e06806666fd20
[zustand2022]: https://github.com/riteofstring/setta/commit/13593b0ec4357f7660725e26c7c894d15f9404b7
[front2023]: https://github.com/riteofstring/setta/blob/1bf50d179e82b2437da3d0432d8a91f883561fc5/abcde-frontend/package.json
[nest2022]: https://github.com/riteofstring/setta/blob/038030aa2e48041dde30687f534a657661b2f085/abcde-backend/package.json
[adonis2022]: https://github.com/riteofstring/setta/blob/8d4216b67abede8d0336f8e995da725e60c16d66/abcde-backend/package.json
[mikro2022]: https://github.com/riteofstring/setta/commit/0c6897e606b807f4ce1f939ffa9d01aa856e6495
[koa2022]: https://github.com/riteofstring/setta/blob/566b0d60a9130e66b559ae7840ee3da78b5b09cf/abcde-backend/package.json
[express2022]: https://github.com/riteofstring/setta/commit/0cb3d36c6a48fea894464d946a0f3665246de9be
[node2023]: https://github.com/riteofstring/setta/blob/b8740e0cf2bf1c35b43282f3e783f87bdb0cf5c7/abcde-backend/package.json
[db2023]: https://github.com/riteofstring/setta/blob/b8740e0cf2bf1c35b43282f3e783f87bdb0cf5c7/abcde-backend/prisma/schema.prisma
[cli2023]: https://github.com/riteofstring/setta/blob/f8ac2b31ba2cd0496006479f1e73a3036a2a68f3/abcde-cli/setup.py
[local2023]: https://github.com/riteofstring/setta/commit/6c6ee5b1cb21ee8d09cb67fb4fe0231aa244deda
[python2023]: https://github.com/riteofstring/setta/blob/2cf4f39dceaf2e9bf28c1f267c8b238fd404c102/setup.cfg
[server2023]: https://github.com/riteofstring/setta/blob/2cf4f39dceaf2e9bf28c1f267c8b238fd404c102/python/runcoder/backend/server.py
[frontlate2023]: https://github.com/riteofstring/setta/blob/2cf4f39dceaf2e9bf28c1f267c8b238fd404c102/frontend/package.json
[codemirror2024]: https://github.com/riteofstring/setta/commit/36a00a007ce85fdabafab01b0865bb80b30ab709
[chart2024]: https://github.com/riteofstring/setta/commit/9f8c262c5081707622df7eec477a9d93d6f248b5
[front2025]: https://github.com/riteofstring/setta/blob/b1df92a823e70f6a3fdef91b052609123e021473/frontend/package.json
[python2025]: https://github.com/riteofstring/setta/blob/b1df92a823e70f6a3fdef91b052609123e021473/setup.cfg
[db2025]: https://github.com/riteofstring/setta/blob/b1df92a823e70f6a3fdef91b052609123e021473/backend/setta/database/db_objs.py
[saasfront]: https://github.com/riteofstring/setta/blob/679012671252e83ebe0902de6347317655f1621b/setta-saas/frontend/package.json
[saasback]: https://github.com/riteofstring/setta/blob/679012671252e83ebe0902de6347317655f1621b/setta-saas/backend/requirements.txt
[saasdeploy]: https://github.com/riteofstring/setta/commit/714290e028dcef6d83d5ac6649b8223b107e7b33
[front2026]: https://github.com/riteofstring/setta/blob/eea7fb38c8fdb452766d06b08610248e2962c4fc/frontend/package.json
[gostart]: https://github.com/riteofstring/setta/commit/1db3317abf1d6fdcb288f67649c0f2744ea01018
[go2026]: https://github.com/riteofstring/setta/blob/eea7fb38c8fdb452766d06b08610248e2962c4fc/go.mod
[setta3front]: https://github.com/riteofstring/setta/blob/6258039962ac90a9e5fd44c141c50ce48843b209/desktop/package.json
[setta3go]: https://github.com/riteofstring/setta/blob/6258039962ac90a9e5fd44c141c50ce48843b209/go.mod
[setta3graph]: https://github.com/riteofstring/setta/blob/6258039962ac90a9e5fd44c141c50ce48843b209/desktop/src/renderer/src/features/workspace-graph/pixi-renderer-application.js
[setta3store]: https://github.com/riteofstring/setta/blob/6258039962ac90a9e5fd44c141c50ce48843b209/internal/orchestrator/store.go
[setta4front]: https://github.com/riteofstring/setta/blob/bd5cd3d0898d5ced1961532034e3b9284fa3146b/desktop/package.json
[setta4go]: https://github.com/riteofstring/setta/blob/bd5cd3d0898d5ced1961532034e3b9284fa3146b/go.mod
[setta4graph]: https://github.com/riteofstring/setta/blob/bd5cd3d0898d5ced1961532034e3b9284fa3146b/desktop/src/renderer/src/features/director-graph/render/director-graph-renderer.ts
[setta4shaders]: https://github.com/riteofstring/setta/blob/bd5cd3d0898d5ced1961532034e3b9284fa3146b/desktop/src/renderer/src/features/director-graph/render/graph-shaders.ts
[setta4artifacts]: https://github.com/riteofstring/setta/blob/bd5cd3d0898d5ced1961532034e3b9284fa3146b/desktop/src/renderer/src/features/artifacts/SettaArtifactRenderer.tsx
[xyflow2026]: https://github.com/riteofstring/setta/commit/859ab84ded514c4bb0f6be9babff8a2bafa1bc8e
[library]: https://github.com/riteofstring/setta/blob/543735f1b833b0110377f9b1b48260932b7f2abb/packages/workspace/package.json
[pyremoved]: https://github.com/riteofstring/setta/commit/4919cb096ebbcd861619e54bd0330b09b47088ff
[goremoved]: https://github.com/riteofstring/setta/commit/2866560207b0c2926136748fce42322f3a43aebf
[stream]: https://github.com/riteofstring/setta/blob/38f81658cacd57f86ca293eecb5ccdf6e8b03f29/setta-examples/stream_diffusion_img_to_img/README.md
[flux]: https://github.com/riteofstring/setta/blob/38f81658cacd57f86ca293eecb5ccdf6e8b03f29/setta-examples/bfl_flux_fill/requirements.txt
[trl]: https://github.com/riteofstring/setta/blob/38f81658cacd57f86ca293eecb5ccdf6e8b03f29/setta-examples/trl_language_model_finetuning/requirements.txt
[transformers]: https://github.com/riteofstring/setta/blob/38f81658cacd57f86ca293eecb5ccdf6e8b03f29/setta-examples/transformers_trainer/requirements.txt
[metric]: https://github.com/riteofstring/setta/blob/38f81658cacd57f86ca293eecb5ccdf6e8b03f29/setta-examples/pytorch_metric_learning_trainer/requirements.txt
[canvasapp]: https://github.com/riteofstring/setta/blob/74837d35da5cb21bdff2ebc1ebaab0cbb77d5ceb/apps/python-canvas/package.json
[realtime]: https://github.com/riteofstring/setta/blob/74837d35da5cb21bdff2ebc1ebaab0cbb77d5ceb/apps/realtime/package.json
[lens]: https://github.com/riteofstring/setta/blob/74837d35da5cb21bdff2ebc1ebaab0cbb77d5ceb/apps/experiment-lens/package.json
[review]: https://github.com/riteofstring/setta/blob/74837d35da5cb21bdff2ebc1ebaab0cbb77d5ceb/apps/review/package.json
[localbackend]: https://github.com/riteofstring/setta/blob/74837d35da5cb21bdff2ebc1ebaab0cbb77d5ceb/apps/realtime/backend/go.mod
[sapient]: https://github.com/riteofstring/setta/blob/38f81658cacd57f86ca293eecb5ccdf6e8b03f29/setta-examples/sapientml_automl/requirements.txt
[groq]: https://github.com/riteofstring/setta/blob/38f81658cacd57f86ca293eecb5ccdf6e8b03f29/setta-examples/groq_api_chat/requirements.txt
