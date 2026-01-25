# Codegen Section Policy and Generated Metadata

This document explains how code generation decides which sections to emit and how the optional metadata output is produced and wired into generated Python.

## Section policy model

Section policy lives on the Python codegen target as `ProjectCodegenPythonTarget.sectionPolicy` (`backend/setta/types/project_config.py`). When no Python target is present, `get_section_codegen_policy` falls back to the default policy.

The policy has four levers:
- `allowlist`: section types that are eligible for codegen. `None` means "no allowlist" (everything is eligible). Defaults to Callable, Dict, ListRoot, Group, GlobalVariables, TextBlock, Draw, and MetaControl (Image and Chat are excluded by default).
- `exclude`: section ids that are always excluded.
- `typePolicies`: per-section-type defaults (mode + representation).
- `sectionOverrides`: per-section-id overrides (mode + representation).

## Code obj value policy model

Code obj value policy lives on the Python codegen target as `ProjectCodegenPythonTarget.codeObjValuePolicy` (`backend/setta/types/project_config.py`). It controls how code object (param) values are formatted in generated Python and in MetaControl section outputs.

The policy has two levers:
- `typePolicies`: per-code-obj-type defaults (representation only).
- `codeObjOverrides`: per-code-obj-id overrides (representation only).

Supported representations:
- `literal` (default): use the existing type-specific formatting (current behavior).
- `json`: parse the stored value as JSON and emit the resulting Python literal.
- `raw`: always emit the stored string via `repr(...)`.
Some code obj types only support `literal` (ButtonParam, NestedParam, and CodeCallable); other representations raise `ValueError`.

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
- Start with `typePolicies[code_obj_type]` (defaulting to `literal`).
- Apply `codeObjOverrides[code_obj_id]` if present.
- Validate representation support for the code obj type; unsupported combinations raise a `ValueError`.

## How policy affects codegen

The dependency graph uses the resolved policy when exporting nodes (`backend/setta/code_gen/dependency_graph.py`):
- Each `SectionNode` and `ParamNode` carries `include_in_codegen`.
- The Python generator and value codec skip nodes that are excluded, so excluded sections and their params never produce assignments or arguments (`backend/setta/code_gen/python/code_generator.py`, `backend/setta/code_gen/value_codec.py`).
- Only section types registered in `DependencyGraph.section_exporters` are considered for codegen at all (Callable, Dict, ListRoot, Group, GlobalVariables, TextBlock, Draw, Image, MetaControl, Chat).

Code obj value policies are resolved during dependency graph export:
- Each `ParamNode` stores `value_representation`, resolved from `codeObjValuePolicy`.
- MetaControl sections store the control code obj id + representation so the same formatting rules apply to control values.

The Python value codec formats params based on representation (`backend/setta/code_gen/value_codec.py`):
- `literal` uses the existing per-type formatting (dropzone parsing, switch bools, nested dicts, etc).
- `json` attempts `json.loads` on the stored string and emits the resulting Python literal; invalid JSON falls back to `repr(literal_value)`.
- `raw` always emits `repr(literal_value)`.

Representation determines how section payloads are encoded:
- `json` is the only supported representation for most non-Chat/Draw section types; their values are emitted from the dependency graph as literals.
 - Image sections only support `file`. The graph stores a `FileReadDependencyValue` pointing at `imagePath` and the packaged runtime reads it from disk; empty image paths render `None`.
- Chat sections support `json` or `file`. When `file` is selected and `chatId` is present, the graph stores a `FileReadDependencyValue` pointing at `setta_files/chats/<chatId>.json` and the packaged runtime reads it (`backend/setta/code_gen/dependency_graph.py`, `backend/setta/code_gen/python/value_helpers.py`).
- Draw sections only support `file`. Any other representation raises a `ValueError`. When `renderedImagePath` is set, the graph stores a `FileReadDependencyValue` and the packaged runtime reads it from disk; if no snapshot exists, codegen emits `None`.

## Generated Python output

When the Python target is enabled, the backend writes `setta_gen.py` to
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
(`backend/setta/types/helpers_lvl2.py`, `backend/setta/project_state/project_code.py`).

## Generated metadata

Python metadata output is controlled by `ProjectCodegenPythonTarget.generateMetadata` (`backend/setta/types/project_config.py`).

When enabled:
- `build_python_meta_code` renders `setta_gen_meta.py` using the project state and the dependency graph (`backend/setta/code_gen/python/meta_generator.py`).
- The file is written next to `setta_gen.py` at `setta_files/code/sections/<project_slug>/setta_gen_meta.py` (`backend/setta/project_state/project_code.py`, `backend/setta/utils/utils.py`).
- The metadata is also written into snapshot run folders (`backend/setta/project_state/code.py`).

The generated module defines:
- `ProjectMetadata`: id, name, activeViewModeId, entryCodeBlockId, activeIds, showParamDisplayNames, previewImgColor.
- `SectionMetadata`: id, name, type, fullPathName, isTopLevel, parentSectionId, variantId, variantName.
- `SettaGenMetadata`: `project`, `sections` (by full path), and `sections_by_id`.

Metadata entries are derived from dependency graph section nodes, so they cover the section types the graph exports even if `include_in_codegen` is false.

## GenPythonMetadata section

When metadata is enabled, a singleton `GenPythonMetadata` section is created and kept in sync:
- It is created or deleted alongside the Python codegen target in `set_project_config_codegen_targets` (`backend/setta/project_state/base_project_manager.py`).
- Its `codeFileBinding` is `write_only` and points to `setta_gen_meta.py` (`backend/setta/types/project_state.py`).
- `maybe_update_gen_python_metadata_section` mirrors the latest metadata code into the section (`backend/setta/types/helpers_lvl2.py`).

## Metadata injection into generated code

When `setta_gen_meta.py` exists, the Python generator appends a metadata assignment block (`backend/setta/code_gen/python/code_generator.py`):
- In packaged runtime, it adds `from . import setta_gen_meta` and sets `state.__state__ = setta_gen_meta.meta`.
- In other modes it `exec`s the metadata code into a namespace and assigns `state.__state__` from the resulting `meta` object.

This makes metadata available at runtime via `from .setta_gen import state` and `state.__state__`.
