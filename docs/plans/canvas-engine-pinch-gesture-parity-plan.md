# Canvas Engine Pinch Gesture Parity Plan

## Goal

Stop browser page zoom from winning over the experimental canvas engine when the
user performs a pinch-equivalent gesture over the workspace.

## Problem

- The engine host already has a native `wheel` listener, but its pinch path is
  still keyed to the older macOS-only assumption.
- Browser page zoom is still the competing default for `ctrl`-modified wheel
  gestures over the workspace.
- There is no browser-level regression coverage for the engine path here, so
  this gap can slip back in unnoticed.

## Scope

1. Treat `ctrl`-modified wheel input over the engine host as canvas zoom on all
   platforms, while keeping the existing delta scaling convention on macOS.
2. Prevent browser gesture zoom defaults on the host via native gesture event
   suppression in addition to the wheel path.
3. Add focused coverage for:
   - `ctrl`-wheel originating from a `nowheel` DOM-island descendant
   - native gesture-event default suppression
   - browser-level `ctrl`-wheel zoom on the engine host

## Verification

- Extend `CanvasEngineHost.test.tsx` with explicit pinch-path assertions.
- Extend `canvas-engine-host.spec.ts` with a browser check for `ctrl`-wheel
  zoom on the engine path.
- Run a live CDP check on the engine host and confirm the camera zoom changes in
  response to a pinch-equivalent dispatch.

## Non-goals

- Full two-pointer touch pinch support.
- Reintroducing the React Flow d3 zoom runtime on the engine path.
- General viewport-control work outside pinch/gesture suppression.
