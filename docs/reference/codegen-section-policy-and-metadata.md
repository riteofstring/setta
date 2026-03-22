# Codegen Section Policy and Generated Metadata

This document explains how code generation decides which sections to emit and how the optional metadata output is produced and wired into generated Python.

## Section policy model

Section policy lives on the Python codegen target as `ProjectCodegenPythonTarget.sectionPolicy` (`backend/setta/types/project_config.py`). When no Python target is present, `get_section_codegen_policy` falls back to the default policy.

The policy has five levers:
- `allowlist`: section types that are eligible for codegen. `None` means "no allowlist" (everything is eligible). Defaults to Callable, Dict, ListRoot, Group, GlobalVariables, TextBlock, Draw, MetaControl, TaskBoard, and Spreadsheet (Image and Chat are excluded by default).
- `metaControlAllowlist`: optional allowlist of control code obj types; MetaControl sections whose control type is not listed are excluded even if the section type is otherwise allowed. Defaults include DateParam and TimeParam in addition to the previous control types.
- `exclude`: section ids that are always excluded.
- `typePolicies`: per-section-type defaults (mode + representation).
- `sectionOverrides`: per-section-id overrides (mode + representation).

## Section value representation (policy)

Section representation is the "value policy" for sections: it decides how a section's value is encoded in the dependency graph and emitted in generated Python. Representation comes from `typePolicies` + `sectionOverrides` and is validated by `resolve_section_codegen_policy`.

Supported representations by section type:
- Callable, Dict, ListRoot, Group, GlobalVariables, TextBlock, MetaControl, TaskBoard, Spreadsheet: `expression` only. (MetaControl formatting is driven by code obj value policy.)
- Chat: `expression`, `file_path`, `file_read`.
- Draw, Image: `file_path`, `file_read`.
- Chart: `expression`, `file_path` (policy supports it, but Chart sections are not exported by the dependency graph yet).

Defaults (`default_section_representation`):
- Chat, Draw, Image: `file_read`.
- Everything else: `expression`.

File-based representations fall back when backing data is missing:
- Chat with `file_path`/`file_read` and no `chatId` downgrades to `expression` with the in-memory `ChatSectionState` literal.
- Draw/Image with `file_path`/`file_read` and no `renderedImagePath`/`imagePath` downgrades to `expression` with the literal `"None"`.

## Code obj value policy model

Code obj value policy lives on the Python codegen target as `ProjectCodegenPythonTarget.codeObjValuePolicy` (`backend/setta/types/project_config.py`). It controls how code object (param) values are formatted in generated Python and in MetaControl section outputs.

The policy has two levers:
- `typePolicies`: per-code-obj-type defaults (representation only).
- `codeObjOverrides`: per-code-obj-id overrides (representation only).

Supported representations:
- `expression` (default): use the existing type-specific formatting (current behavior).
- `json_parsed`: parse the stored value as JSON and emit the resulting Python literal; invalid JSON falls back to `repr(literal_value)`.
- `string`: always emit the stored string via `repr(literal_value)`.
- `file_path`: for DropzoneParam only, emit a list of attachment file paths (plus dropped text entries); if the stored value is not a dropzone payload, fall back to `repr(literal_value)`.
- `file_read`: for DropzoneParam only, emit a list where file attachments are read via `read_file_value(...)` (text entries stay as strings).
Some code obj types only support specific representations; unsupported combinations raise `ValueError`.
Current limits:
- Expression only: `ButtonParam`, `NestedParam`, `CodeCallable`.
- String only: `TextParam`, `DateParam`, `TimeParam`, `TextAreaParam`, `PasswordParam`, `ColorPickerParam`.
- Expression + string: `CodeParam`, `RotaryParam`, `SwitchParam`, `DropdownParam`.
- Expression + json_parsed + string: `SliderParam`.
- File path/read only: `DropzoneParam`.

PasswordParam secrets:
- PasswordParam values are stored in the runtime secret store
  (`setta_files/runtime/secrets/passwords.json` or `SETTA_RUNTIME_ROOT`), not in
  project state.
- The dependency graph treats a PasswordParam as present only when a secret
  exists, so missing secrets omit the param from generated output.
- The Python value codec emits `read_password_value("<impl_id>")` so generated
  code fetches the secret at runtime.

## Policy resolution order

`resolve_section_codegen_policy` (`backend/setta/types/project_config.py`) computes a `ResolvedSectionCodegenPolicy` in this order:
- Start with `allowlist`: include if `allowlist is None` or the section type is listed.
- Apply the `typePolicies[section_type].mode` using `include`, `exclude`, or `inherit`.
- Apply `exclude`: if the section id is listed, force exclusion.
- Apply `sectionOverrides[section_id]`: the override mode can flip inclusion, and the override representation wins.
- Validate representation support for the section type; unsupported combinations raise a `ValueError`.

The result is `include_in_codegen` plus the chosen `representation`.

## Code obj value policy resolution order

`resolve_code_obj_value_policy` (`backend/setta/types/project_config.py`) computes a `ResolvedCodeObjValuePolicy` in this order:
- Start with `typePolicies[code_obj_type]` (defaulting to `expression`).
- Apply `codeObjOverrides[code_obj_id]` if present.
- Validate representation support for the code obj type; unsupported combinations raise a `ValueError`.

## How policy affects codegen

The dependency graph uses the resolved policy when exporting nodes (`internal/codegen/python_dependency_graph.go` for codegen and `backend/setta/api/listener.py` for retained listener-side fallback metadata work):
- Each `SectionNode` and `ParamNode` carries `include_in_codegen`.
- The Go-owned Python renderer and value codec skip nodes that are excluded, so excluded sections and their params never produce assignments or arguments (`internal/codegen/python_code_renderer.go`, `internal/codegen/python_value_codec.go`).
- Only section types registered in `DependencyGraph.section_exporters` are considered for codegen at all (Callable, Dict, ListRoot, Group, GlobalVariables, TextBlock, Draw, Image, MetaControl, Chat, TaskBoard, Spreadsheet).
- MetaControl sections are filtered by `metaControlAllowlist` (control code obj types not listed are excluded).

Code obj value policies are resolved during dependency graph export:
- Each `ParamNode` stores `value_representation`, resolved from `codeObjValuePolicy`.
- MetaControl sections store the control code obj id + representation so the same formatting rules apply to control values.

The Python value codec formats params based on representation (`internal/codegen/python_value_codec.go`):
- `expression` uses the existing per-type formatting (switch bools, nested dicts, etc).
- `json_parsed` attempts `json.loads` on the stored string and emits the resulting Python literal; invalid JSON falls back to `repr(literal_value)`.
- `string` always emits `repr(literal_value)`.
- `file_path` (DropzoneParam) emits a list of attachment file paths plus dropped text entries.
- `file_read` (DropzoneParam) emits a list where file attachments are read via `read_file_value(...)` (text entries stay as strings).

Representation determines how section payloads are encoded:
- `expression` is the only supported representation for most non-Chat/Draw/Image section types; their values are emitted from the dependency graph as literals.
- Prompt sections are exported as literal prompt text. When a Prompt section is
  linked to a saved prompt template (`promptTemplateId`) and the dependency
  graph has DB access, it resolves the current saved template text instead of
  trusting the cached section snapshot. Missing linked templates therefore
  raise loudly instead of silently exporting stale prompt content.
- Image sections support `file_path` and `file_read`. The graph stores either a literal path or a `FileReadDependencyValue` pointing at `imagePath`; if the path is missing, the graph downgrades to `expression` with the literal `"None"`.
- Draw sections support `file_path` and `file_read`. File modes read `renderedImagePath`; missing paths downgrade to `expression` with the literal `"None"`.
- Chat sections support `expression`, `file_path`, and `file_read`. `expression` emits a Python dict literal from the chat state; file modes point at `setta_files/chats/<chatId>.json` when `chatId` is present, otherwise they downgrade to `expression` with the in-memory state (`internal/codegen/python_dependency_graph.go`, `backend/setta/code_gen/python/value_helpers.py`).
- Listener-side chat dependency updates from `route_set_chat_section_state` follow the same representation rules through the Go listener route plus the retained Python listener cache/update path (`internal/wsapi/routes.go`, `backend/setta/api/listener.py`).

## Generated Python output

When the Python target is enabled, the Go-owned materializer writes `setta_gen.py` to
`setta_files/code/sections/<project_slug>/setta_gen.py`. The generator builds
this file as:

```
<genCodePrefix>

<generated body>

<genCodeSuffix>
```

Two blank lines separate each block (`GEN_CODE_SEPARATOR_NEWLINES = 2`).

The generated body is a `SettaState` wrapper class with assignments in
`__init__`:
- Each included section/param becomes `state.<path> = <value>`.
- Names are sanitized and combined using `__` between parent and child nodes.
- If no nodes are emitted, the class body is a single `pass`.
- Helper imports (for example, `value_helpers` or metadata imports) are prepended
  to the generated body when needed.

The `GenPythonCode` singleton section mirrors only the generated body (not the
prefix/suffix). The UI reconstructs the full file by stitching
`genCodePrefix + body + genCodeSuffix`, while keeping the body read-only
(`internal/codegen/python_materializer.go`, `internal/projectstate/python_codegen.go`).

## Generated metadata

Python metadata output is controlled by `ProjectCodegenPythonTarget.generateMetadata` (`backend/setta/types/project_config.py`).

When enabled:
- `internal/codegen.PythonMetadataRenderer` renders `setta_gen_meta.py` using the project export and dependency graph (`internal/codegen/python_meta_renderer.go`).
- The file is written next to `setta_gen.py` at `setta_files/code/sections/<project_slug>/setta_gen_meta.py` (`internal/codegen/python_materializer.go`, `internal/projectstate/python_codegen.go`).
- The metadata binding and on-disk path are derived from the project's reconciled generated bindings (`internal/projectstate/python_codegen.go`, `internal/lsp/project_synchronizer.go`).

The generated module defines:
- `ProjectMetadata`: id, name, activeViewModeId, entryCodeBlockId, activeIds, showParamDisplayNames, previewImgColor.
- `SectionMetadata`: id, name, type, fullPathName, isTopLevel, parentSectionId, variantId, variantName.
- `SettaGenMetadata`: `project`, `sections` (by full path), and `sections_by_id`.

Metadata entries are derived from dependency graph section nodes, so they cover the section types the graph exports even if `include_in_codegen` is false.

## GenPythonMetadata section

When metadata is enabled, a singleton `GenPythonMetadata` section is created and kept in sync:
- `internal/codegen.PythonMaterializer.ReconcileProjectPythonGeneratedSections` creates or deletes it alongside the Python codegen target (`internal/codegen/python_materializer.go`).
- Its `codeFileBinding` is `write_only` and points to `setta_gen_meta.py` (`internal/projectstate/python_codegen.go`).
- The same materializer keeps the section payload synchronized with the latest rendered metadata code (`internal/codegen/python_materializer.go`).

## Metadata injection into generated code

When `setta_gen_meta.py` exists, the Go-owned Python renderer appends a metadata assignment block (`internal/codegen/python_code_renderer.go`):
- In packaged runtime, it adds `from . import setta_gen_meta` and sets `state.__state__ = setta_gen_meta.meta`.
- In other modes it `exec`s the metadata code into a namespace and assigns `state.__state__` from the resulting `meta` object.

This makes metadata available at runtime via `from .setta_gen import state` and `state.__state__`.
