# Chat Engine + Transcription Decoupling Plan

## Why This Plan Exists
- Current design still couples transcription provider choice to `EngineConfig` via `transcriptionLlmConfigId`.
- That makes engine switching noisy (e.g., Claude SDK chat -> OpenCode chat) because users must duplicate engine configs just to keep the same transcription setup.
- We want the inverse layering:
  - core primitives are decoupled,
  - coupling is optional and can be added as a higher-level bundle abstraction later.

## Current Constraints (Investigation)
- Provider transcription route resolves config from `engineConfigId` (`/api/transcribeChatAudio`).
- `EngineConfig` owns both chat config and transcription config references.
- Project/Section chat settings store `engineConfigId` + `dictationMode`, but not an independent transcription profile reference.
- Frontend provider transcription enablement derives from the selected engine’s transcription config.

## Target Architecture
- **EngineConfig** becomes chat-runtime only:
  - internal chat model selection (`settaLlmConfigId`) and/or external agent runtime config,
  - no transcription fields.
- **TranscriptionProfile** becomes transcription-runtime only:
  - references transcription LLM config (Whisper or equivalent),
  - can hold transcription-specific defaults later (language, prompt hints, etc.).
- Chat surfaces store independent references:
  - `engineConfigId` (chat),
  - `transcriptionProfileId` (provider transcription),
  - `dictationMode` (`auto`/`browser`/`provider`).
- Optional **EngineBundle** abstraction (follow-up): preset that points to both IDs for convenience.

## Scope
- Required in this cutover:
  - full core decoupling (engine vs transcription profile),
  - provider transcription for both managed and external chat engines,
  - no managed-only restrictions.
- Explicitly not required in this cutover:
  - advanced bundle UX (can ship in phase 2).

## Data Model Changes

### 1) Backend types
- Remove `transcriptionLlmConfigId` from `EngineConfig` and related create/update request models.
- Add `TranscriptionProfile` model family:
  - `id`
  - `name`
  - `transcriptionLlmConfigId`
  - optional future-ready fields (kept minimal initially).

### 2) Project/chat state
- Add `transcriptionProfileId` to managed chat section settings payload/state.
- Add project-level transcription profile selection in AI store (alongside existing project-level dictation mode persistence).

### 3) API endpoints
- Add CRUD endpoints for transcription profiles (parallel to engine configs):
  - create/update/get/list/delete transcription profile.

## Request/Route Refactor

### 4) Transcription route contract
- Refactor `/api/transcribeChatAudio` request to use `transcriptionProfileId` instead of `engineConfigId`.
- Keep multipart body shape otherwise unchanged (`file`, optional `language`).
- Server resolves transcription provider config only from transcription profile.

### 5) Resolution logic
- Add a transcription profile resolver that returns resolved transcription LLM config.
- Remove transcription concerns from engine resolver.
- Keep chat engine resolver focused on chat execution only.

## Frontend Refactor

### 6) Settings UX
- Project Chat settings:
  - show `Engine` selector,
  - show `Transcription Profile` selector,
  - show `Dictation Mode` selector.
- Managed Chat Section settings:
  - same independent selectors.
- Remove `Transcription Config` from engine-specific settings blocks (it belongs to transcription profile now).

### 7) Dictation behavior wiring
- Provider transcription availability depends on:
  - selected `transcriptionProfileId` exists,
  - profile’s transcription config resolves.
- No engine-type gate for provider transcription.
- Keep existing mode semantics:
  - `auto`: provider first, browser fallback.
  - `browser`: browser only.
  - `provider`: hard provider path, explicit config error.

## Optional Bundle Layer (Phase 2)
- Introduce optional `EngineBundle` model:
  - `id`, `name`, `engineConfigId`, `transcriptionProfileId`, optional defaults.
- Bundle selection can prefill both selectors while still allowing per-surface overrides.
- Bundle layer must not reintroduce hard coupling at core type level.

## Tests

### Backend
- Add resolver/route tests for transcription-profile-driven transcription:
  - valid profile -> success,
  - missing/invalid profile -> expected 400.
- Update existing transcription tests to new request field (`transcriptionProfileId`).
- Keep external-agent chat + provider transcription coverage as first-class path.

### Frontend Vitest
- Settings state tests:
  - independent persistence/updates for `engineConfigId` and `transcriptionProfileId`.
- Dictation behavior tests:
  - provider availability from transcription profile, not engine type,
  - `auto` fallback and `provider` explicit error preserved.

### Playwright
- Add/update flows for:
  - selecting independent engine + transcription profile,
  - external engine + provider transcription path,
  - dictation mode controls on both Project Chat and managed Chat section settings.

## Docs
- Update `docs/reference/chat-sections.md` to describe independent chat/transcription selection.
- Add examples showing:
  - Claude SDK chat + Whisper transcription profile,
  - OpenCode chat + same Whisper transcription profile (no duplication).

## Cutover Policy
- No backward compatibility and no migration shim.
- Existing `transcriptionLlmConfigId` on engine configs is removed.
- Existing projects must reconfigure transcription via `TranscriptionProfile` and `transcriptionProfileId` selection.
