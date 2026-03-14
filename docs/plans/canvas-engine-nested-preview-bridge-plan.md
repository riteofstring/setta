# Canvas Engine Nested Preview Bridge Plan

## Goal

Move the engine beyond top-level-shell-only rendering by ingesting real nested
section geometry from mounted DOM islands and caching it as a renderer preview.

## Problem

- The current scene adapter only knows about `topLevelSections`.
- Arbitrary nested section layouts do not exist as explicit pane-layout state in
  this repo today; they are produced by the nested section DOM tree.
- A pure state-driven nested scene graph is therefore not yet available through
  a robust source-of-truth path.

## Approach

1. Add a small bridge module that measures nested `section[data-section-id]`
   bounds inside mounted canvas-engine DOM islands.
2. Convert those measured bounds back into world-space preview rects.
3. Cache the last measured previews per top-level section so the renderer can
   keep showing nested structure after the corresponding DOM island unmounts.
4. Feed those preview rects into the canvas renderer as a dedicated primitive,
   separate from top-level scene rects and edges.

## Why This Is Defensible

- It uses actual mounted DOM geometry rather than guessed nested positions.
- It applies across arbitrary project types because it reads the same section
  tree the UI already renders.
- It is a bridge toward a fuller recursive scene model without silently
  inventing layout semantics that are not encoded in state today.

## Scope

1. New nested-preview bridge module plus focused unit coverage.
2. Renderer support for nested preview rects.
3. Host integration and observability (`data-*` count).
4. Browser guardrail showing nested previews persist after DOM-island unmount on
   the engine path.

## Non-goals

- A full pure-state recursive scene graph.
- Nested edge rendering parity.
- Replacing mounted nested DOM with canvas-only interactivity.
