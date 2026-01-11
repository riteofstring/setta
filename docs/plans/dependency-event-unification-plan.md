# Unify Listener Events Around Dependency Keys

## Goal
Make action events and value-change events share the same dependency-key model so
listeners can use `dep_id(...)` for both and subscribe by event type (value vs action).

## Motivation
- Current actions use `actionId` (string), while value changes use dependency keys.
- `actionId` is rename-unsafe and can collide on duplicate names.
- Listeners already have rename-safe ids via `dep_id`; actions should use the same path.
- A unified model makes it easy to subscribe by event type (e.g., button click, chat send).

## Proposed model

### 1) Event types
Add an event type enum, e.g.:
- `DependencyEventType.Value`
- `DependencyEventType.Action`

### 2) Replace actionId with dependencyKey
Replace `ControlActionEvent.actionId` with a `dependencyKey`:
- For button MetaControl: `SectionDependencyKey(sectionId=<meta_control_section>)`
- For chat send: `SectionDependencyKey(sectionId=<chat_section>)`
- For param-level actions (if any): `SectionParamDependencyKey(sectionId, paramId)`

### 3) Listener registration: event types instead of actions
Replace `ListenerRegisterCallback.actions` with `eventTypes` (list):
- `eventTypes=["action"]` subscribes to action events.
- `eventTypes=["value"]` subscribes to value changes (realtime deltas).
- `eventTypes=["action","value"]` subscribes to both.
- Keep `dependencyMode` semantics; event types apply to whichever dependencies are
  attached to the callback.

### 4) Listener callback context
Replace `ctx.actions` with a typed event list, e.g.:
- `ctx.events: list[DependencyEvent]`
Where a `DependencyEvent` includes:
  - `dependencyKey`
  - `eventType`
  - `payload` (string | None)
  - `timestampMs`
  - `shareSessionId` if needed

`ctx.changed` remains the structured map for value updates only.

### 5) Frontend emission
Replace `sendRealtimeControlAction(...)` with a generic emitter:
- `sendRealtimeDependencyEvent({ dependencyKey, eventType, payload })`
Existing button control and chat send both call this with `eventType="action"`.
Value changes use `eventType="value"` (or remain as deltas, see below).

### 6) Backend messaging
Unify `WebsocketMsgRealtimeActionEvent` and `WebsocketMsgRealtimeUIChange` into
one event stream, or keep both but normalize into a shared `DependencyEvent`
model before dispatch:
- Listener registry filters by dependency keys and event types.
- Listener coverage snapshots can include event type coverage (optional).

### 7) Backward-compatibility
No backward compatibility required (per project guidelines). Old actionId-based
listeners will need migration.

## Migration notes
- Replace `actions=[...]` with `eventTypes=["action"]`.
- Replace logic that checks `ctx.actions` with `ctx.events` filtered by type.
- Replace button action subscription by section name with `dep_id(section_id)`
  or the sanitized dependency name for the section.
- Update docs: `docs/setta-listener-examples.md`, `docs/meta-controls.md`.

## Open questions
- Should `eventType="value"` reuse the existing delta path or be a unified event?
- Do we want a separate `eventSubType` for chat sends vs button clicks?
- Should event payloads be structured JSON or remain string-only?

