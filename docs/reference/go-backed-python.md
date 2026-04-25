# Go-Backed Python

This document defines when Python behavior in Setta should stay in Python and
when it should delegate to Go.

## Definitions

- **Go-owned/generated Python types**: Python consumes Go-authored contracts
  through generated models and constants. This is about schema ownership, not
  where runtime behavior executes.
- **Go-backed Python**: correctness-sensitive Python SDK behavior delegates to
  Go so local behavior stays aligned with backend semantics.
- **Python-owned runtime helpers**: behavior that is genuinely local to the
  Python package and does not redefine canonical backend semantics.

## Current Codebase Shape

- The running-backend path is already the main delegation surface for Python:
  `backend/setta/api/listener.py`, `backend/setta/api/chat_toolkit.py`, and
  `backend/setta/api/runner.py` all talk to the active Go runtime over HTTP or
  websockets.
- The `sdk-local-core` path exists, but it is currently narrow. Today the main
  local-core client is `backend/setta/local_core_client.py`, used by the
  listener runtime and package-managed plugin runtime shims to keep local
  behavior aligned with Go-owned semantics.
- `backend/setta/plugin_runtime/*` is a published package-facing shim surface
  for installed plugin backends. App-subsystem helpers there should stay thin:
  they probe/dispatch plugin backend requests and delegate correctness-sensitive
  behavior to `sdk-local-core` rather than reimplementing app-definition logic
  in Python.
- The Python package also owns real local runtime infrastructure that should
  stay in Python, including callback scheduling and hot reload
  (`backend/setta/api/scheduling.py`, `backend/setta/api/hot_reload.py`),
  auth/session helpers (`backend/setta/auth/*`, `backend/setta/sessions/*`),
  logging helpers (`backend/setta/logging/*`), and binary-frame decoding
  (`backend/setta/websockets/binary_frames.py`).

## When To Delegate To Go

- Use the running backend when the behavior is already backend-owned, depends
  on backend/project/session state, or naturally belongs to the existing
  HTTP/websocket runtime.
- Use `setta sdk-local-core` when the behavior should match Go/backend
  semantics but the Python SDK needs a local low-latency path instead of an
  HTTP or websocket round trip.

## What Should Stay In Python

- Keep Python for SDK/runtime orchestration and for local runtime helpers whose
  semantics are genuinely Python-owned.
- Typical examples in this repo: listener transport/session glue, chat-toolkit
  orchestration around Go-owned routes, context managers, callback scheduling,
  hot reload, auth/session helpers, logging helpers, binary-frame decoding, and
  packaging-side process/bootstrap helpers.

## What Does Not Justify Go-Backed Execution

- Parsing Go-authored DTOs or generated models in Python, by itself.
- Small convenience helpers that only rearrange or expose contract data.
- Re-implementing Go validation, defaulting, or derived metadata in Python just
  for convenience.

## Decision Rule

Ask: "If this behavior changes, where should the canonical semantics live?"

- If the answer is Go/backend, Python should delegate.
- If the answer is Python SDK ergonomics or orchestration, keep it in Python.

## Relevant Code Paths

- Running-backend compatibility handshake: `backend/setta/runtime_compat.py`
- Running-backend listener/runtime surface: `backend/setta/api/listener.py`
- Running-backend helper surface: `backend/setta/api/chat_toolkit.py`
- Running-backend runner surface: `backend/setta/api/runner.py`
- Local Go delegation client: `backend/setta/local_core_client.py`
- Local Go delegation command: `internal/settacmd/sdk_local_core.go`
- Plugin backend runtime helpers: `backend/setta/plugin_runtime/*`
- Python-owned callback scheduler: `backend/setta/api/scheduling.py`
- Python-owned hot reload: `backend/setta/api/hot_reload.py`
- Python-owned auth/session helpers: `backend/setta/auth/session.py`, `backend/setta/sessions/registry.py`
- Python-owned logging helpers: `backend/setta/logging/context.py`, `backend/setta/logging/tasks.py`
