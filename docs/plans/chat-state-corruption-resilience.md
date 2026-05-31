# Chat State Corruption Resilience

## Problem

The chat history loader currently fails closed for workspace-level corruption.
One malformed historical run can prevent the renderer from loading any
conversation list entries for that workspace, even when most conversations are
valid.

Observed example:

- A new conversation and its messages persisted successfully.
- On the next app start, `chat:list-conversations` failed before returning any
  conversations.
- The blocker was an existing run missing `assistantMessageId`, not the new
  conversation.

This is too brittle for local-first durable state. Corruption should remain
visible and actionable, but unrelated valid conversations must stay available.

## Goals

- Load every valid conversation that can be loaded deterministically.
- Isolate corrupt conversations, runs, messages, run items, outputs, traces, and
  diagnostics to the narrowest owning scope.
- Keep validation strict for writes and for records that are returned as valid
  product state.
- Report corruption loudly with structured diagnostics, affected paths, owning
  ids, and user-visible recovery status.
- Provide explicit quarantine and reset tools for local app data.
- Preserve production app-boundary test coverage for startup, workspace load,
  chat creation, message send, event streaming, restart, and recovery flows.

## Non-Goals

- Do not silently ignore corruption.
- Do not weaken validation so malformed records are treated as valid records.
- Do not add ad hoc compatibility aliases to durable records.
- Do not add backward compatibility, legacy support, migrations, transitional
  adapters, or old-shape readers.
- Do not rely on renderer-only fallbacks as the long-term history source.
- Do not make chat list loading depend on reading full transcripts or full run
  histories when summary metadata is enough.

## Current Failure Shape

The current `ListConversations` flow loads conversation metadata, then scans all
workspace runs to determine active run ids. If any run scan returns a corrupt
record, the whole list call fails. The renderer then has no durable conversation
list to show after restart.

This conflates three concerns:

- Conversation discovery.
- Active run summary calculation.
- Workspace corruption reporting.

The long-term fix is to split those concerns so each can fail at its natural
scope.

## Proposed Model

Introduce an explicit partial-read model for chat state scans.

Core result shape:

- `valid`: records that passed strict validation.
- `corrupt`: structured corrupt-state findings.
- `skipped`: valid records excluded because an owning parent is corrupt.

Corrupt-state findings should include:

- stable diagnostic code
- severity
- filesystem path
- workspace id
- conversation id when known
- run id when known
- record kind
- underlying validation error
- recommended recovery action

The backend should still fail hard on persistence errors, unreadable directories
that prevent deterministic scanning, invalid request ids, and corruption in the
specific record being opened or mutated. The backend should not fail the entire
workspace list because an unrelated historical run is corrupt.

## Backend Plan

1. Add typed scan findings.

   Create a shared internal representation for corrupt chat records instead of
   passing around plain `error` slices. Keep the existing error type for direct
   load failures, but make broad scans return typed findings with ownership
   fields.

2. Split conversation listing from workspace run validation.

   `ListConversations` should first return valid conversation metadata and
   message counts. Run-derived fields such as `activeRunId` should be computed
   from valid runs only. Corrupt runs should produce diagnostics and should not
   block unrelated conversations.

3. Scope failures by owner.

   A corrupt conversation metadata file should exclude that conversation from
   the list. A corrupt message filename should affect that conversation's
   message count and opening path, not every other conversation. A corrupt run
   should affect that run and its owning conversation's run status, not every
   conversation in the workspace.

4. Add corruption status to list responses.

   Extend the endpoint-owned HTTP response contract with workspace-level
   corruption summary fields. Generate the TypeScript surface from the Go
   endpoint registry after changing the contract.

   Suggested fields:

   - `conversations`: valid conversation list items
   - `corruption`: summary with counts by kind and severity
   - `diagnostics`: recent or newly recorded corruption diagnostics relevant to
     this list operation

5. Keep strict direct-load semantics.

   Opening a corrupt conversation, loading a corrupt message page, or mutating a
   conversation with corrupt required state should still fail specifically. The
   key distinction is that broad discovery should degrade partially, while
   direct operations on corrupt state fail loudly.

6. Add explicit quarantine and reset operations.

   Add backend-owned maintenance commands for app data, not renderer-side file
   edits. These commands must be deterministic and auditable.

   Initial maintenance options:

   - quarantine corrupt records by moving them into an app-owned quarantine
     directory with a manifest
   - clear all chat state for a selected workspace after explicit confirmation
   - clear only quarantined records after explicit confirmation
   - re-run validation after quarantine/reset and report the exact outcome

7. Avoid format drift.

   If durable schema changes are needed, update the owner-defined schema and
   write new records in that schema only. Do not add silent dual-read paths,
   legacy aliases, or transitional readers.

## Renderer Plan

1. Render partial history.

   The chat sidebar should show all valid conversations returned by the backend
   even when corruption is present.

2. Surface corruption separately from chat content.

   Show a workspace-level warning or diagnostics panel when corruption exists.
   It should not replace the transcript for a valid selected conversation.

3. Remove reliance on create-flow fallback for history durability.

   The current create-chat fallback can keep the just-created conversation in
   memory when list refresh fails, but restart must rely on the backend partial
   list response.

4. Add quarantine and reset entry points.

   Provide explicit user actions for quarantine or reset once backend
   maintenance APIs exist. Show before/after counts and require confirmation
   before moving or deleting local app data.

## Verification Plan

The change touches chat workflows, durable state, generated backend contracts,
renderer chat state, transcript UI, and restart behavior. It is incomplete
without app-boundary workflow coverage.

Required deterministic workflow coverage:

- workspace opens with one corrupt historical run and multiple valid
  conversations
- valid conversations appear in the sidebar despite the corrupt run
- corruption warning/diagnostic appears with the corrupt path and owning ids
- creating a new chat persists and appears after restart
- sending a message in a valid conversation works while unrelated corruption
  remains
- opening the owning corrupt conversation fails narrowly if required state is
  still corrupt
- quarantine removes a corrupt record from active scans and preserves an audit
  manifest
- workspace chat-state reset removes selected chat state after explicit
  confirmation
- restart/reload preserves quarantined or reset results

Also run focused Go tests for store scanning, service list behavior, quarantine
decisions, and corrupt-state diagnostics.

When `.env` contains `OPENAI_API_KEY`, run the live Codex E2E tests because the
change touches chat workflow and run lifecycle behavior. If credentials are
absent, report that live-provider tests skipped for that reason only.

Before committing implementation, run:

```sh
./scripts/format.sh
./check_quality.sh --all
```

Run `./scripts/check_supply_chain.sh` only if dependency manifests, lockfiles,
package manager configuration, Go module configuration, or supply-chain tooling
change.

## Rollout Sequence

1. Backend scan model.

   Add typed scan findings and unit coverage without changing HTTP contracts.

2. Partial list behavior.

   Change `ListConversations` to return valid conversations while recording
   corrupt diagnostics. Add focused service tests.

3. Endpoint contract.

   Extend the list response contract with corruption summary fields and
   regenerate TypeScript contracts.

4. Renderer UI.

   Render partial lists and workspace corruption warnings. Keep valid
   transcripts usable.

5. App-boundary workflows.

   Add deterministic Electron workflow tests for partial list, create/send,
   restart, and visible diagnostics.

6. Quarantine and reset.

   Add explicit backend maintenance APIs, renderer entry points, audit
   manifests, reset behavior, and workflow tests.

7. Live-provider verification.

   Run live Codex workflows when credentials are available and record skipped
   live coverage explicitly when they are not.

## Open Decisions

- Whether corrupted conversations should be hidden entirely from the sidebar or
  shown as disabled rows with quarantine/reset actions.
- Whether maintenance APIs should live under chat endpoints or a broader
  app-data maintenance surface.
- Exact quarantine directory layout and retention policy.
- Whether diagnostics should be returned inline by list calls, queried
  separately, or both.
- Whether quarantine should ever be automatic on startup or always require an
  explicit user action.
