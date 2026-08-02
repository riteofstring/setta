# App Mode Remaining Work Plan

## Context (As Of 2026-02-07)

App mode v1 (json-render AppSpec + theme tokens + deployments/sessions + policy gating + IDE preview/config UX) is implemented.

This document tracks remaining App mode work that is not yet implemented.

## Goals

- Add external design-tool pipelines (Pencil.dev, Figma) that compile into the Setta App contract.
- Add safe, explicit extensibility points (additional catalogs and/or custom component bundles).
- Expand App mode outputs/data bindings beyond TextBlock + Image artifacts.
- Provide an export escape hatch to a standalone React project (optional, clearly unsupported by default).
- Improve IDE UX for editing `AppDefinition` fields beyond the raw JSON editors.
- Finish tokenization/polish for any remaining app-mode UI that uses hard-coded styling.

## Non-Goals

- Removing catalog-driven guardrails or allowing arbitrary JS execution from AppSpec.
- Turning Setta into a full WYSIWYG design editor (external tools should cover that).

## Workstreams

### 1) External Design Tool Integrations (Pencil.dev)

Deliverable: a compiler/importer that produces the Setta App contract:
- `appSpec.json` (JSON-render UITree)
- `theme.json` (theme tokens + `theme.vars`)
- `assets/` (fonts/images/css, preferably bundled)

Tasks:
- Add an import path that reads a Pencil design source (`.pen` or Pencil MCP-exported JSON) and compiles it into AppSpec + Theme + Assets.
- Define a deterministic mapping from Pencil layout primitives into the App catalog primitives (`Stack`, `Grid`, `Box`, `Container`, `Spacer`).
- Define a deterministic mapping from Pencil text styles into theme typography tokens and App components (`Heading`, `Text`).
- Define how interactive controls map to Setta params (`ParamInput`) and actions (`ActionButton`).
- Add a traceability metadata block (design source ids + revision hash) so imports can be repeated safely and diffed.
- Asset handling:
  - Prefer bundling assets into the app deployment (fonts/images/css copied into deployment root).
  - If remote assets are allowed, ensure they are policy-gated and validated (warnings/errors are explicit).

Open questions:
- Do we treat the design source file as the source of truth (re-import overwrites AppSpec/theme), or do we support a merge strategy?

### 2) External Design Tool Integrations (Figma)

Deliverable: a CLI importer (or service) that compiles a Figma file/node selection into the Setta App contract.

Tasks:
- Add a minimal importer that can:
  - fetch node layout data
  - fetch images (rasterize or export as assets)
  - map variables/tokens when available into theme tokens
- Add mapping rules similar to Pencil for layout primitives and text styles.
- Add traceability metadata (file key, node ids, export settings, token/variable mapping summary).

Open questions:
- Do we require Variables API support, or operate in a “no variables” mode and infer tokens from styles?

### 3) Catalog Extensibility (Multiple Catalogs / Custom Component Bundles)

Today, validation is built around the default catalog (`setta.app.default`).

Deliverable: an explicit mechanism to support additional catalogs safely.

Tasks:
- Decide a registration mechanism for catalogs:
  - backend: catalog registry (id -> schema)
  - frontend: component registry (type -> React component)
- Make validation/catalog selection work with non-default catalogs.
- Define a policy-gated “custom component bundle” story (if supported):
  - where bundles live (deployment artifact vs server install)
  - versioning and allowlisting
  - validation hooks
  - security boundaries (no arbitrary network/file access, no JS eval from spec)

Open questions:
- Is “custom components” a v2 goal, or do we want to keep a single catalog and only grow it?

### 4) Output & Data Binding v2 (Beyond TextBlock + Image)

Deliverable: richer output components and binding rules that remain deterministic.

Candidate additions:
- Structured data viewer (JSON viewer).
- Tables (DataTable) with column schema and row data sourced from section outputs/artifacts.
- Download surfaces:
  - named artifacts (single file)
  - multi-file bundles (zip)
- “Run status” output (progress / last-run timestamp / error summary) without exposing unsafe logs by default.
- Optional terminal/log surface if it can be constrained and policy-gated.

Tasks:
- Extend the catalog with the minimum set of output components.
- Define how each output binds:
  - binding type (section id, artifact id, or explicit dataBinding record)
  - serialization format constraints
- Add backend validation warnings/errors when bindings target unsupported section types.

### 5) Export Escape Hatch (Standalone React Project)

Deliverable: a one-way export that compiles a Setta App into a standalone React app.

Tasks:
- Define a generated project shape (Vite + React, pinned deps).
- Implement a codegen step that translates AppSpec + Theme + Assets into:
  - a static renderer (or reuse json-render with the catalog)
  - config for backend URLs/session
- Make the export clearly opt-in and policy-gated in docs (it is a “power user” escape hatch).

Open questions:
- Is the exported app intended to keep talking to Setta deployments, or become a fully standalone backendless artifact?

### 6) IDE UX: Editing `AppDefinition` Fields

Currently the IDE exposes JSON editors for AppSpec/theme/assets and uses project chat as the “generator” surface.

Deliverable: better structured editing for the non-spec parts of `AppDefinition`.

Tasks:
- Add optional UI affordances for:
  - routes (path/name/rootKey)
  - actions (named actions -> definitions)
  - dataBindings (named bindings and JSON pointer helpers)
- Add schema-aware helpers:
  - catalog introspection for allowed components/actions
  - validation that highlights element keys/types where possible

### 7) Tokenization / Design Polish

Deliverable: App mode UI is fully token-driven and predictable.

Tasks:
- Audit remaining app-mode widgets for hard-coded Tailwind colors and migrate to `--app-*` variables (prefer app-only wrappers to avoid IDE regressions).
- Ensure portal-based UI inherits theme vars and dark mode consistently (Radix menus, popovers, tooltips).
- Document the token surface and provide a few canonical theme examples.

## Policy & Security Follow-Ups

Tasks:
- Re-evaluate asset policy granularity:
  - today `allowExternalLinks` gates `<link href="https://...">` injection
  - consider separate flags if needed (remote stylesheets/fonts vs remote images vs arbitrary links)
- Strengthen validation messaging around blocked remote assets and unsupported bindings.

## Testing Plan

Tasks:
- Add Playwright coverage for:
  - any new catalog components (outputs, tables, viewers)
  - policy gates for remote assets/downloads/external links
  - importer-driven apps (golden import fixtures)
- Add backend pytest coverage for:
  - importer compilation determinism (same input -> same output)
  - catalog registry behavior (if implemented)
  - export pipeline correctness (if implemented)

## Suggested Sequencing

1. Pencil importer/compiler (local-first, fast iteration).
2. Figma importer/compiler (API auth + assets).
3. Output/data binding v2 components (tables/viewers/download bundles).
4. Catalog extensibility (if needed) or keep growing the default catalog.
5. IDE UX polish for routes/actions/dataBindings.
6. Standalone React export escape hatch (optional).
