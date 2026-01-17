# Unify Listener Events Around Dependency Keys

## Goal
Make action events and value-change events share the same dependency-key model so
listeners can use `dep_id(...)` for both and subscribe by dependency + mode.

## Motivation
- Current actions use `actionId` (string), while value changes use dependency keys.
- `actionId` is rename-unsafe and can collide on duplicate names.
- Listeners already have rename-safe ids via `dep_id`; actions should use the same path.
- A unified model makes it easy to subscribe by dependency key (section/param).

## Proposed model

### 1) Modes + wildcard deps
Use callback modes instead of event type registration:
- `REFRESH_ONLY`: snapshots only
- `REALTIME_ONLY`: realtime deltas + action events only
- `ALWAYS`: snapshots + realtime
- Use `deps=[]` for a wildcard that listens to all dependencies.

### 2) Replace actionId with dependencyKey
Replace `ControlActionEvent.actionId` with a `dependencyKey`:
- For button MetaControl: `SectionDependencyKey(sectionId=<meta_control_section>)`
- For chat send: `SectionDependencyKey(sectionId=<chat_section>)`
- For param-level actions (if any): `SectionParamDependencyKey(sectionId, paramId)`

### 3) Listener registration: modes + dependency keys
Replace `ListenerRegisterCallback.actions` with dependency keys + `dependencyMode`:
- Set `dependencyMode=REALTIME_ONLY` for action-only listeners.
- Set `dependencyMode=ALWAYS` for listeners that should run on snapshots and realtime.
- Use `deps=[]` for a wildcard that listens to all dependencies.

### 4) Listener callback context
Replace `ctx.actions` with a typed event list, e.g.:
- `ctx.events: list[DependencyEvent]`
Where a `DependencyEvent` includes:
  - `dependencyKey`
  - `payload` (string | None)
  - `timestampMs`

`ctx.changed` remains the structured map for value updates only.

### 5) Frontend emission
Replace `sendRealtimeControlAction(...)` with a generic emitter:
- `sendRealtimeDependencyEvent({ dependencyKey, payload })`
Existing button control and chat send both call this emitter.

### 6) Backend messaging
Unify `WebsocketMsgRealtimeActionEvent` and `WebsocketMsgRealtimeUIChange` into
one event stream, or keep both but normalize into a shared `DependencyEvent`
model before dispatch:
- Listener registry filters by dependency keys.
- Listener coverage snapshots only track realtime value dependencies.

### 7) Backward-compatibility
No backward compatibility required (per project guidelines). Old actionId-based
listeners will need migration.

## Migration notes
- Replace `actions=[...]` with dependency keys + `dependencyMode=REALTIME_ONLY`.
- Replace logic that checks `ctx.actions` with `ctx.events`.
- Replace button action subscription by section name with `dep_id(section_id)`
  or the sanitized dependency name for the section.
- Update docs: `docs/setta-listener-examples.md`, `docs/meta-controls.md`.

## Open questions
- Should value deltas be unified into the dependency event stream later?
- Should action payloads be structured JSON or remain string-only?
