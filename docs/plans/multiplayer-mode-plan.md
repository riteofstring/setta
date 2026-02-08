# Multiplayer mode plan (cursors + shared edits)

This plan adds a first-class "multiplayer mode" to Setta: multiple people can be
in the same project at the same time, see each other's cursors with colors +
names, and optionally attach short messages to their cursor (Figma-style).

The key constraint is performance: the Setta canvas can be very large, and
cursor updates are high-frequency. The plan is designed so presence traffic and
UI rendering stay cheap and isolated from `ProjectState` updates.

## Goals
- Multiplayer presence: multi-cursor with `name`, `color`, optional `message`.
- Participant list: who's here, join/leave, idle/active, "follow" affordance.
- Shared edits: multiple frontends can edit and stay in sync (backend remains
  the source of truth).
- Share-friendly: works for both normal server mode and share deployments.
- Performance: presence updates must not cause ReactFlow/node rerenders.

## Non-goals (initially)
- Offline-first / local-first merges (CRDT across full `ProjectState`).
- "Live drag replay" of every intermediate move at 60fps.
- Audio/video or full screen/terminal sharing.
- Fine-grained access control beyond "host vs guest" and existing share policy.

## What We Already Have (Helpful Constraints)
- Backend is authoritative and already broadcasts project state snapshots over
  the existing WebSocket (`UpdateFrontendProjectState`).
- Multiple frontend clients can connect at once in normal mode; share mode
  already has a room-like `shareSessionId` and session-scoped broadcasting.
- Frontend already has a pending-op/ack flow (`completedOpIds` / `pendingOpIds`)
  for optimistic UI, which we can keep but must validate under concurrency.
- XYFlow fork already exposes coordinate helpers:
  `screenToFlowPosition()` and `rendererPointToPoint()` for cursor positioning.

## Key Architectural Decision (v1)
### Use server-authoritative durable state + a separate presence layer
- Durable state (sections, params, layouts) continues to be mutated via existing
  HTTP endpoints and broadcast as snapshots (existing behavior).
- Presence (cursor position, name, color, message, "what I'm editing") is sent
  over the existing WebSocket as lightweight messages and never stored in
  `ProjectState`.

This is the lowest-risk path that fits Setta's current architecture and avoids
trying to CRDT-ify the entire `ProjectState` upfront.

## Alternatives (for later)
### CRDT for durable edits (Yjs / Automerge)
When we need offline-first collaboration, better conflict resolution for
simultaneous edits, and/or high-frequency shared manipulation, we should
re-evaluate CRDT.

Tradeoffs in Setta:
- Pros: better merge semantics, fewer "last writer wins" surprises, can support
  real-time co-editing of text-like fields more naturally.
- Cons: large refactor; `ProjectState` is not a single document today; backend
  is Python; we'd need a Yjs/Automerge sync server or a substantial bridge.

Candidate stacks:
- Yjs with a websocket provider (self-host) and Awareness for presence.
- Automerge Repo with a websocket server.
- "Managed" hosted services (Liveblocks) if we decide SaaS is acceptable.

### Managed presence/storage (Liveblocks)
Fastest time-to-feature and includes built-in presence patterns, but introduces
SaaS dependency, account/billing, and data residency questions. Likely not a v1
fit for Setta's packaging/distribution story.

## Terminology
- **Room**: the scope within which presence and broadcasts are shared.
  Suggested room key: `{serverMode}:{shareSessionId?}:{projectConfigId}`.
- **Participant**: a person/device in a room. Has a stable `participantId`
  (browser-local) and ephemeral `connectionId` (per websocket connection).
- **Presence**: ephemeral participant state (cursor, message, edit target).
- **Durable state**: `ProjectStateSingleConfig` and other persisted artifacts.

## Connection + Auth Models
We should support both "Figma-like" (hosted) and "VSCode Share-like" (host runs,
others join) collaboration without inventing a brand new auth layer.

### Normal server mode (VSCode Share-style)
- Guest access should use the existing bootstrap token flow:
  - Host shares a bootstrap token out-of-band.
  - Guests visit the bootstrap page and exchange the token for an auth cookie.
  - Once the cookie is set, both HTTP endpoints and WebSockets work normally.
- The multiplayer room itself should be scoped by `projectConfigId` (and
  optionally view mode), not by the token.

### Share deployments
- Share deployments are already effectively "hosted" (no auth cookie required).
- Multiplayer room key should include `shareSessionId` so participants can join
  the same session by sharing a link that includes `shareSessionId=...`.

## Protocol Design
We should treat presence as its own mini-protocol with strict payload sizes.

### Participant identity
- `participantId`: stable UUID stored in `localStorage` (per browser profile).
- `displayName`: user-editable, stored in `localStorage` (default generated).
- `color`: deterministic from `participantId` (stable) or server-assigned.
- `connectionId`: server-assigned websocket id (already exists today).

### Presence payloads (client -> server)
Suggested new `WebsocketMsgTypeForBackend` values and message classes:
- `PresenceHello`
  - Sent once after websocket open.
  - Fields: `participantId`, `displayName`, `color`, `projectConfigId`.
- `PresenceUpdate`
  - Sent at a capped rate (see performance section).
  - Fields: `participantId`, `projectConfigId`, `cursor` (flow coords),
    optional `viewport` (x/y/zoom), optional `activeIds` (selected section ids),
    optional `editing` (sectionId/paramId), optional `isIdle`.
- `PresenceMessage`
  - Low-frequency: sets/clears the bubble text attached to cursor.
  - Fields: `participantId`, `projectConfigId`, `message`, optional `ttlMs`.

### Presence payloads (server -> client)
Suggested new `WebsocketMsgTypeForFrontend` values:
- `PresenceState`
  - Full state for a room (sent to a joiner, or periodically for repair).
- `PresencePatch`
  - Delta updates: participant upsert/remove, message updates, etc.

### Scoping and filtering
Presence should only be broadcast to the same room:
- Normal mode: room is `projectConfigId`.
- Share mode: room is `(shareSessionId, projectConfigId)`.

Avoid using `currentAddress` alone as the room id. It's helpful for UX but not a
reliable data key.

## Backend Implementation Plan
### Phase 0: Presence hub skeleton (no UI)
1. Add a `PresenceHub` to the backend (new module):
   - Holds per-room participant presence in memory with TTL.
   - Coalesces updates (keeps only latest per participant).
   - Provides `snapshot(room)` and `apply_update(...)`.
2. Add a background "tick" broadcaster per room:
   - Every `50ms` (20Hz) broadcast a single `PresencePatch` containing only
     changed participants since the last tick.
   - This avoids O(n^2) fanout from per-mouse-move messages.

Suggested files:
- `backend/setta/websockets/presence_hub.py` (new)
- `backend/setta/server_state.py` (initialize hub on app state)

### Phase 1: WebSocket message types
1. Extend `backend/setta/types/websocket.py`:
   - Add enums for the new message types.
   - Add `BaseModel`/Pydantic types for presence content.
   - Add `WebsocketMsgPresenceHello`, `WebsocketMsgPresenceUpdate`, etc.
2. Regenerate websocket unions:
   - `frontend/generation/generate_unions.py websocket_unions` (via `pnpm generate`).

### Phase 2: Backend receiver integration
1. Update `backend/setta/websockets/msg_handlers/frontend_receiver.py`:
   - Parse and handle presence messages.
   - Validate `projectConfigId` exists (and share session has that config).
   - Push updates into `PresenceHub`.
2. On connect:
   - Require a `PresenceHello` within a short timeout (e.g. 3s) or keep the
     connection but treat as anonymous.
   - Send a `PresenceState` snapshot to the joining client for the current room.
3. On disconnect:
   - Remove participant entries for that websocket id (and broadcast patch).

### Phase 3: Join links / room selection UX (share deployments first)
Share deployments already have an effective "room id" (`shareSessionId`), but
the frontend always creates a new session. To enable real multiplayer:
1. Allow "join existing session":
   - If `shareSessionId` is present in the URL query param, do not call
     `route_create_share_session_current`; instead, join the provided id.
2. Add "Copy multiplayer link" UI in share mode:
   - Link should include `shareSessionId=...` so others join the same room.
3. Optional: Add a "host-only" button to rotate session id (kicks guests).

Normal mode can start without explicit room creation: multiple people visiting
the same backend URL are already in the same durable state; presence will use
`projectConfigId` scoping.

## Frontend Implementation Plan
### Phase 0: Stores and local identity
1. Add a multiplayer/presence store (Zustand):
   - Local identity: `participantId`, `displayName`, `color`.
   - Remote participants map by `participantId`.
   - Derived list for UI (sorted stable).
2. On WebSocket open:
   - Send `PresenceHello`.

Suggested files:
- `frontend/src/state/definitions.ts` (new store)
- `frontend/src/state/actions/websocketReceive.ts` (send + receive presence msgs)

### Phase 1: Cursor capture + broadcast
1. Capture pointer movement on the canvas pane:
   - Use `screenToFlowPosition({x: e.clientX, y: e.clientY})`.
2. Rate-limit sending:
   - Sample with `requestAnimationFrame`.
   - Hard-cap network sends to `20Hz` per client.
   - Only send when moved more than a small epsilon in flow coords.
3. Send `PresenceUpdate` with flow coords + optional `viewport`.

### Phase 2: Cursor rendering (high performance)
1. Add a `RemoteCursorsOverlay` rendered inside `react-flow__pane` (not the
   scaled viewport) so cursor size stays constant.
2. Convert remote flow coords to pane coords with:
   - `rendererPointToPoint(flowPos, transform)` using current ReactFlow transform.
3. Keep DOM small:
   - 1 wrapper element per participant.
   - `pointer-events: none`.
   - `transform: translate3d(...)` for positioning.
4. Smooth remote movement:
   - Use `perfect-cursors` (or a tiny in-house lerp) to avoid jitter.

### Phase 3: Names, colors, and message bubbles
1. Render name tags next to cursor with participant color.
2. Render message bubble when `PresenceMessage` is set; auto-clear by TTL.
3. Add minimal UI affordances:
   - "Participants" button in header showing count.
   - List with rename (local only) and "follow" action.

### Phase 4: Reduce edit conflicts (soft locks)
1. Send presence `editing` target when focusing a param input / text field.
2. Show "Jeff is editing..." inline near that control.
3. Optional enforcement:
   - Configurable: allow edits anyway (default) vs disable input when locked.

## Durable Edit Semantics (v1)
- Backend ordering is the conflict resolver: operations are applied in the order
  they reach the server.
- Clients stay consistent via websocket snapshots (existing behavior).
- For high-contention fields, rely on soft locks + good awareness UI rather than
  deep merge algorithms.

If we later need stronger semantics, introduce a CRDT document for the subset
of fields that truly need it (likely text-like content and/or layout).

## Performance Guardrails
### Network
- Client send rate: max 20Hz; send only on meaningful movement.
- Server broadcast rate: max 20Hz per room; coalesced.
- Payload size:
  - Cursor positions quantized (e.g. 0.5px in flow coords) to reduce noise.
  - Avoid sending big arrays; send deltas only.

### Frontend rendering
- Presence updates must not touch `useProjectState` or trigger node rebuilds.
- Cursor overlay should not subscribe to large stores; keep selectors minimal.
- Prefer direct style updates or tiny React components over rerendering the
  whole canvas subtree.

### Instrumentation
- Add a dev-only counter for:
  - Presence msgs sent/received per second.
  - Cursor overlay render count (React renders) per second.
- Use Chrome DevTools Performance to baseline pan/zoom FPS with 10 participants
  connected and cursors moving.

## Testing Plan
### Backend
- Unit test `PresenceHub`:
  - TTL expiry removes participants.
  - Coalescing keeps latest.
  - Room scoping works for share vs normal.
- WebSocket integration test:
  - Two clients in same room: updates from A are received by B.

### Frontend (Vitest)
- Presence store:
  - Identity initialization, color determinism.
  - Patch application correctness.
- Coordinate conversion:
  - Given transform, `rendererPointToPoint` placement math is correct.

### E2E (Playwright)
- Multiplayer cursors:
  - Open two contexts to the same project/room.
  - Move cursor in one; see labeled cursor in the other.
  - Send a cursor message; bubble appears and expires.
- Join/leave:
  - Close a context; cursor disappears after TTL.

## Rollout / Flags
- Gate behind a setting/env flag initially:
  - Backend: `SETTA_ENABLE_MULTIPLAYER_PRESENCE=1`
  - Frontend: local storage toggle to show/hide remote cursors.
- Enable presence first (read-only); then iterate on UX and conflict reduction.

## Open Questions
- Should the default room be per `projectConfigId` only, or also per view mode?
- Do we want a distinct "host" role in normal mode, or only in share mode?
- Are we OK with "last writer wins" for all durable edits in v1?
- Where should "Participants" live in the UI (header vs canvas controls)?

## References / Prior Art (for implementation)
- React Flow multiplayer guide (Jan 2026): transport + state partitioning.
- `perfect-cursors`: lightweight cursor interpolation for multiplayer UIs.
- CRDT options: Yjs (Hocuspocus/y-websocket), Automerge Repo.
