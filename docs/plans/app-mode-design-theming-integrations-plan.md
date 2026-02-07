# App Mode Design, Theming, And External Integrations Plan

This document extends `docs/plans/ai-gen-standalone-app-plan.md` with a focused plan for:

- Sophisticated design + styling in App mode (beyond Gradio/Streamlit-level).
- Integrations with external design tools (Pencil.dev, Figma, and future tools).
- Keeping the spec/capabilities explicit and understandable by AI.

## Summary

We want App mode to support sophisticated, production-quality designs (responsive layout, animations, typography scales, and richer components) while keeping the runtime deterministic, safe, and AI-friendly.

The core strategy is to treat “design” as a compiled artifact that targets a stable, versioned runtime contract:

- A catalog-defined AppSpec (JSON-render UITree) for structure and behavior.
- A versioned Theme/Tokens schema for styling (resolved into CSS variables).
- Optional assets (fonts, images, CSS) as explicit, policy-gated deployment artifacts.

External design tools (Pencil/Figma/etc.) should compile/export into this contract rather than becoming part of the runtime.

Versioning here is for clarity and tooling, not legacy support: Setta can support a single “latest”
contract and hard-migrate old specs/themes when the contract changes.

## Implementation Status (As Of 2026-02-07)

Implemented (or mostly implemented):

- Token-first App theming via `--app-*` CSS variables, including `theme.vars` (arbitrary `--app-*` overrides).
- App Config pane editing for `App Spec JSON`, `Theme JSON`, and `Assets JSON`.
- App-mode tokenization for common Param UIs (App-only overrides/wrappers):
  - `DropdownParam`, `PasswordParam`, `SliderParam`, `RotaryParam`, `SwitchParam`,
    `DropzoneParam`, `ColorPickerParam`.
- Portal theming in App mode (combobox/dropdowns inherit theme variables + dark class).
- Layout primitives (`Box`, `Grid`, `Container`, `Spacer`) and catalog support for CSS dimension strings on key layout props (e.g. `"1rem"`, `"clamp(...)"`).
- Responsive schema: breakpoint maps for selected layout props (breakpoints `base|sm|md|lg|xl|2xl`, resolved at runtime).
- Motion primitives: catalog-defined `Motion` and `Stagger` components for preset-based animations.
- App Config error UX: surface backend validation detail on save/load failures (instead of generic errors).
- App validation endpoint + UI: `validateAppDefinition` returns `{errors[], warnings[], capabilities}` and App Config exposes a `Validate` action.
- Richer validator output: `validateAppDefinition` accumulates multiple errors (no fast-fail) and advertises feature support via capabilities flags.

Not implemented yet (future work, integrations deferred):

- External design tool compilers/importers/exporters (Pencil/Figma/etc.).
- Theme schema expansion + validator hardening (beyond `theme.vars` warnings).

## Goals

- Make styling a first-class, versioned contract that can express sophisticated designs.
- Ensure app UI components and param controls are themeable through tokens, not hard-coded styles.
- Expand layout primitives so external tools can reliably compile into AppSpec without hacks.
- Add validation so an AI can iterate deterministically (clear errors/warnings, not trial-and-error).
- Enable design-tool integrations by adding compilers/importers that output the Setta App contract.

## Non-Goals

- Replacing the AppSpec catalog constraint with arbitrary React code.
- Allowing arbitrary JavaScript execution from the app spec.
- Creating a full WYSIWYG builder inside Setta (design tools can cover that).

## Design Principles

- Stable contract: App runtime should depend on a versioned schema, not a specific tool.
- Catalog-driven: AppSpec stays bounded to a known component catalog with typed props.
- Token-first styling: Theming is data, resolved into CSS variables, consumed by all widgets.
- Keep IDE stable: Prefer App-only wrappers or explicit theme-override props for shared widgets so App mode theming does not accidentally perturb IDE mode layout/behavior.
- Explicit escape hatches: When needed, allow CSS-only extension points that are deployable and policy-gated.
- AI-friendly: Schemas + validators + capabilities metadata are the primary interface for AI generation/editing.

## Current State (App Mode v1)

- AppSpec is a JSON-render UITree using `setta.app.default` catalog `v1`.
- `appDefinition.theme` supports a limited set of styling knobs:
  - `mode`: `light | dark | auto`
  - `colors`, `fonts`, `spacing`
  - resolved into a small set of `--app-*` CSS variables
- Many App components already reference `--app-*` variables in their Tailwind classnames.
- Some param widgets still contain hard-coded Tailwind colors (not fully token-driven yet).
- `appDefinition.assets` can inject `<link>` tags at runtime.

Important limitation:

- AppSpec `className` props are not a general solution for runtime styling if they rely on Tailwind utility strings embedded only in JSON. Tailwind class generation happens at build time and won’t reliably include classes that exist only inside the JSON spec at runtime.

## Proposed Runtime Contract (Versioned)

### 1) Theme Tokens: Design Tokens Schema (Breaking Update)

Evolve `appDefinition.theme` into a richer token schema that can represent:

- Color system:
  - semantic roles: `primary`, `bg`, `surface`, `text`, `muted`, `border`, plus status colors
  - component roles: `button`, `input`, `slider`, `tabs`, `card`, `code`, etc.
  - light/dark variants or modes
- Typography:
  - font families (`body`, `heading`, `mono`)
  - typographic scale (`xs..2xl`), weights, line heights, letter spacing
- Spacing and layout:
  - spacing scale (4/8/12/16 etc.)
  - radii scale
  - shadows/elevation
- Motion:
  - animation tokens (durations, easing)
  - catalog-defined animation presets (fade, slide, stagger) with typed params

Theme resolution should produce:

- A single computed “resolved theme” object for runtime
- A deterministic CSS variable map applied at the App root

### 2) Make App UI Fully Token-Driven

Refactor App renderer components and ParamInput UI wrappers so they:

- Avoid hard-coded color classes (`bg-blue-500`, `bg-setta-*`, etc.) for app mode rendering.
- Use CSS variables for color, borders, focus rings, disabled state, etc.
- Define a consistent component token surface (e.g., `--app-button-bg`, `--app-input-border`, `--app-slider-track`, etc.).
- Prefer App-only wrappers and theme override props:
  - Many Param UIs are shared with IDE mode and are highly sensitive to layout/interaction constraints.
  - Default approach: keep shared Param UIs "IDE-correct" by default, and let App mode opt into token styling via explicit override props or `App*` wrappers.
  - Only refactor shared Param UIs to be fully token-driven when we explicitly want the same token system in IDE mode.

This makes theme changes predictable and allows design tools to output tokens without patching component code.

### 3) Catalog Expansion: Layout + Responsiveness + Motion (Breaking Update)

Extend the catalog with a small, predictable set of primitives:

- Layout:
  - `Box` (single element wrapper with padding/margin/background/border)
  - `Grid` (explicit rows/cols/gap)
  - `Container` (content width + centering + padding)
  - `Spacer` (fixed or token-sized)
- Responsive rules:
  - A constrained mechanism like `responsive` props keyed by named breakpoints
  - Or container-query-based variants (already used in the codebase via Tailwind container queries)
- Motion:
  - Catalog-defined animation components/props
  - Avoid “arbitrary JS” motion hooks in spec

Key constraint:

- Keep primitives few, strongly typed, and composable. This is what makes AI generation and external compilation reliable.

### 4) Validator + Capabilities (AI Ergonomics)

Add a spec/theme validator that returns structured output:

- errors:
  - unknown component type
  - invalid prop types
  - missing required binding fields
  - invalid theme token keys/values
- warnings:
  - run action missing target section id
  - output bindings refer to non-TextBlock sections
  - assets with remote URLs when policy disallows external links

Add a “capabilities” payload the AI can query:

- catalog id/version
- active theme schema/version
- supported feature flags (responsive, motion, assets, custom components)

This allows AI prompts and toolchains to target exactly what the runtime supports.

## Integrations: Compile To The Setta App Contract

External tools should compile into:

- `appSpec.json` (AppSpec UITree)
- `theme.json` (Theme tokens)
- `assets/` (fonts/images/css)

Setta runtime should not need to know about Pencil/Figma-specific concepts.

### Pencil.dev (Example)

Relevant official docs:

- `.pen` files are Pencil’s design format and are JSON-based and version-control friendly. https://docs.pencil.dev/core-concepts/pen-files and https://docs.pencil.dev/core-concepts
- Pencil runs a local MCP server when Pencil is running, exposing MCP tools like `batch_design`, `batch_get`, `get_screenshot`, `snapshot_layout`, and `get_variables` / `set_variables`. https://docs.pencil.dev/ai-integration
- Pencil emphasizes design-to-code synchronization and mentions syncing variables with CSS variables/design tokens. https://docs.pencil.dev/design-and-code/design-to-code

Potential Setta integration shape:

- Store a `.pen` file in the repo as a design source of truth (e.g., `design/app.pen`).
- Provide a compiler/exporter that:
  - reads the `.pen` file (through Pencil MCP tools, or via a Pencil export)
  - maps Pencil variables to Setta Theme tokens
  - maps Pencil layout into Setta catalog primitives (Stack/Grid/Box/etc.)
  - exports to `setta_files/app_specs/*.json` and `appDefinition.theme`
- Optional: use `get_screenshot` to produce golden images for manual review or CI artifacts.

### Figma (Example)

Relevant official docs:

- Files endpoints provide file JSON (`GET /v1/files/:key`) and node JSON (`GET /v1/files/:key/nodes`), plus image rendering (`GET /v1/images/:key`) and image fills (`GET /v1/files/:key/images`). https://developers.figma.com/docs/rest-api/file-endpoints/
- Variables REST API supports querying/creating/updating variables with specific token scopes and Enterprise plan requirements. https://developers.figma.com/docs/rest-api/variables/ and https://developers.figma.com/docs/rest-api/variables-endpoints/
- Dev Resources endpoints support attaching developer resources (links/metadata) to nodes, useful for traceability between design nodes and deployed apps. https://developers.figma.com/docs/rest-api/dev-resources-endpoints/

Potential Setta integration shape:

- A CLI importer (or service) that:
  - fetches Figma file/node JSON
  - fetches image assets
  - optionally fetches Variables (when available) and maps to Setta tokens
  - compiles to Setta AppSpec + Theme + assets
- Optional: a Figma plugin exporter for environments where REST API permissions/scopes are constrained.
- Optional: write-back dev resources to Figma nodes to link to Setta deployment URLs or to a specific AppSpec revision.

## Security / Policy Considerations

- Keep runtime “safe by default”:
  - No JS execution from spec
  - Strict catalog validation
- Assets:
  - Treat remote CSS/font URLs as policy-gated (“external links”) if we allow them at all.
  - Prefer bundling assets into the deployment root for fully self-contained deployments.
- Custom components:
  - If we eventually support “component bundles”, they must be explicitly registered and versioned.
  - This is a high-complexity escape hatch and should be delayed until tokens + primitives prove insufficient.

## Sequencing (Recommended)

1. Token-first refactor (App-only): ensure existing App widgets in App mode render using tokens/CSS variables.
   - Prefer App-only wrappers / explicit theme override props for shared Param UIs.
   - Avoid changing IDE-mode behavior/layout unless we intentionally want IDE theming.
2. Theme schema + validator: richer tokens, explicit schema contract, structured validation output.
3. Catalog primitives: Box/Grid/Container/Spacer + constrained responsive rules.
4. Motion primitives: small, typed animation system.
5. External tool compilers: Pencil and Figma importers/exporters that compile into the Setta contract.
6. Optional escape hatches: CSS-only extension points, and later custom component bundles if needed.

## Open Questions

- Assets policy:
  - Do we allow remote CSS/fonts in app deployments, or require bundling into the deployment?
- Responsive model:
  - Breakpoint-based props vs container-query variants vs both?
- Design tool sync:
  - One-way compile (design -> spec/theme) vs two-way sync (spec/theme edits reflected back)?
- Custom components:
  - When do we introduce a bundle mechanism, and how do we version/audit it?
