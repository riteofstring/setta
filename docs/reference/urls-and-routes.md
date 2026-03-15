# URLs and Routes

This doc describes the public-facing frontend URL paths and how they map into
the router. Backend API routes are separate and live under `/api`.

## Frontend Paths

Routes are defined in `frontend/src/components/Pages/router.tsx`.

- `/`
  - Index route. In share mode it may redirect to `/home` or the default project
    (see `ShareIndexRedirect`).
- `/home`
  - Home page.
- `/:projectConfigName`
  - Primary project config view.
- `/:projectConfigName/chat`
  - Dedicated standalone project chat surface for that project.
- `/:projectConfigName/chat/:chatId`
  - Dedicated standalone project chat surface for a specific thread id.
- `/:projectConfigName/windowspace/:windowSpaceSlug`
  - Dedicated standalone floating-window surface resolved from a saved window
    space name slug.
- `/:projectConfigName/section/:sectionSlug`
  - Dedicated standalone section surface resolved from the section's canonical
    full-path slug.
- `/:projectConfigName/view/:viewModeName`
  - Deep link into a named view mode for that project.

The same paths are used in IDE and share modes; the router wraps them with
`ModeWrapper` to pick the correct container.

## URL Encoding + Matching

The project and view mode names are URL-encoded with `encodeURIComponent` when
building paths. Matching is exact (case-sensitive) against the stored names.

For standalone section routes, `sectionSlug` is derived from the existing
canonical full-path slug logic:

- backend: `sanitize_slug(get_section_path_full_name(...))`
- frontend: `sanitizeNameForSlug(resolveSectionFullPathName(...))`

Standalone project thread routes use the existing thread `chatId` identifier:

- `/:projectConfigName/chat/:chatId`

Standalone window-space routes are namespaced under `/windowspace` and resolve
against `projectConfig.windowSpaces` by sanitized name slug:

- `/:projectConfigName/windowspace/:windowSpaceSlug`

Section routes are namespaced under `/section`, so section slugs no longer need
to reserve `chat` or `windowspace`.

Window-space names also use explicit namespacing under `/windowspace`, so names
such as `home`, `settings`, `chat`, or `windowspace` are not reserved at the
window-space level.

If `/:projectConfigName/view/:viewModeName` does not match an existing view mode,
the app keeps the current active view mode and replaces the URL with that active
name once state is loaded.

## View Mode URL Sync

When the app is on the `/view` route, `useViewModeUrlSync`
(`frontend/src/state/hooks/viewModeUrl.ts`) keeps the URL and active view mode in
sync:

- URL -> state: navigating to `/view/<name>` switches the active view mode (if
  the viewer has permission to change variants).
- State -> URL: switching the active view mode replaces the current `/view` path
  with the active view mode name.

Navigation uses `replace: true` to avoid stacking history entries. Query string
and hash are not preserved during the replace (current behavior).

## Backend API Routes

Frontend routes above are **not** the same as backend API routes. Backend routes
use the `Route` enum (`backend/setta/types/routes.py`) and are called via
`/api/<route>` using the generated endpoint helpers in
`frontend/src/utils/generatedEndpoints.ts`.

### Chat dictation session routes

Chat dictation uses session-based JSON routes:

- `/api/startTranscriptionSession`
  - Method: `POST`
  - Content type: `application/json`
  - Request fields: `transcriptionProfileId` (string), optional `language` (string)
- `/api/appendTranscriptionAudio`
  - Method: `POST`
  - Content type: `application/json`
  - Request fields: `sessionId` (string), `audioPcm16Base64` (base64 PCM16), `sampleRateHz` (int), `channels` (int)
- `/api/stopTranscriptionSession`
  - Method: `POST`
  - Content type: `application/json`
  - Request fields: `sessionId` (string)
- `/api/cancelTranscriptionSession`
  - Method: `POST`
  - Content type: `application/json`
  - Request fields: `sessionId` (string)

Generated endpoint helpers expose these routes as JSON helpers (for example
`route_start_transcription_session`, `route_append_transcription_audio`,
`route_stop_transcription_session`, and `route_cancel_transcription_session`).

### Transcription profile management routes

Transcription profile CRUD is separate from chat engine config:

- `/api/getTranscriptionProfiles`
  - Method: `GET`
  - Returns: list of transcription profiles.
- `/api/createTranscriptionProfile`
  - Method: `POST`
  - Content type: `application/json`
  - Request fields: `name`, `transcriptionLlmConfigId`, `transportMode`
    (`auto`/`file`/`realtime`), `chunkMs` (`200-10000`), optional `language`.
- `/api/updateTranscriptionProfile`
  - Method: `POST`
  - Content type: `application/json`
  - Request fields: `profile` (full profile object).
- `/api/deleteTranscriptionProfile`
  - Method: `POST`
  - Content type: `application/json`
  - Request fields: `profileId`.

### LLM config + API key routes

- `/api/llm/config`
  - `GET` returns the full LLM config (`AllLLMConfigs`).
  - `POST` replaces the full LLM config payload.
- `/api/llm/apiKeys`
  - `GET` returns `{ apiKeys, revision }`.
  - `POST` expects `{ apiKeys, expectedRevision }` and returns `{ apiKeys, revision }`.
  - Writes are compare-and-set by revision; stale revisions return `409`.
  - Error payloads use `{ errorCode, message, revision }` with:
    - `managed_api_keys_revision_conflict` (`409`)
    - `managed_api_keys_store_corrupt` (`409`)
    - `managed_api_keys_store_unavailable` (`503`)
- `LLMApiKeysUpdated` websocket messages now carry snapshots:
  - `{ apiKeys, revision, corrupt, errorCode, message }`

### Managed chat stop route

- `/api/stopLLMChat`
  - Method: `POST`
  - Request fields: `chatId`
  - Response fields:
    - `alreadyStopped`
    - `stoppedRunId` (nullable)
    - `stoppedMessageId` (nullable)

### Project chat windowing + window-space routes

- `/api/setProjectChatWindowingState`
  - Method: `POST`
  - Request fields: `projectConfigId`, `state`
  - Persists layout-only project-chat window state.
  - Thread-bound `chatId` changes are rejected here; use the dedicated
    chat-binding route instead.
- `/api/setProjectChatWindowChatId`
  - Method: `POST`
  - Request fields: `projectConfigId`, `instanceId`, `chatId`
  - Persists the managed-chat thread binding for an existing
    `project_ai_mode` window.
- `/api/createWindowSpace`
  - Method: `POST`
  - Request fields: `projectConfigId`, `state`, optional `name`
  - Persists a saved floating-window snapshot under `projectConfig.windowSpaces`.
- `/api/setWindowSpaceName`
  - Method: `POST`
  - Request fields: `projectConfigId`, `windowSpaceId`, `name`
- `/api/setWindowSpaceSortOrder`
  - Method: `POST`
  - Request fields: `projectConfigId`, `orderedWindowSpaceIds`
  - Requires a full, deduplicated order list.
- `/api/deleteWindowSpace`
  - Method: `POST`
  - Request fields: `projectConfigId`, `windowSpaceId`

## Frontend API Origin Mapping

Most generated endpoint calls use the backend origin (`C_ADDRESSES.BACKEND`),
but a small set is intentionally routed through the launcher origin
(`C_ADDRESSES.LAUNCHER`) in `frontend/src/utils/endpointUtils.ts`:

- `/api/launch`
- `/api/settaHomeInfo`
- `/api/revealPathInOsFileExplorer`

## App-Generation Extension Endpoints

The app-generation/skills viewer flow adds these backend routes:

- `/api/getAppGenSkills`
  - Lists skills discovered from workspace/user/env skill roots.
  - Response fields:
    - `skills`: discovered skill entries.
    - `customSkillCreateRootPath`: preferred writable custom-skill root when one
      can be determined.
    - `customSkillCreateRootActionable`: whether that root already exists and can
      be revealed directly in the OS file explorer.
  - Each skill entry now includes `isEditable` and `editabilityReason` so the
    frontend can distinguish editable custom skills from read-only roots.
- `/api/getAppGenSkillContent`
  - Reads `SKILL.md` preview content for a selected skill id.
- `/api/upsertAppGenCustomSkill`
  - Creates or replaces a custom `SKILL.md`.
  - Method: `POST`
  - Content type: `application/json`
  - Request fields:
    - `content` (required)
    - exactly one of `skillId` (update existing discovered custom skill) or
      `relativePath` (create new custom skill under the preferred writable root)
  - Response fields:
    - `skillId`, `created`, `rootPath`, `skillDocPath`
    - refreshed `skill` metadata
    - refreshed `skillContent`
- `/api/streamAppSpec`
  - Streams JSONL patch ops for tool-driven or API-driven app-spec generation.
  - The current app-config pane generation flow no longer depends on this
    route; it now uses `/api/getLLMResponse` plus `/ws/frontend` tool-preview
    updates and Go-owned `stream_app_definition` persistence.
- `/api/getLLMResponse` (extended payload)
  - Accepts `appGenerationMode` and `appGenerationByMessageId` for Project Chat
    app-generation turns.
  - `appGenerationByMessageId` is the authoritative per-user-message submission
    map and can encode explicit `plain_chat` turns alongside app-generation
    modes.
- `/api/getLLMChat` and `/api/getExternalAgentChat` (extended responses)
  - Return `appGenerationByMessageId` so Project Chat can hydrate per-message
    app-generation provenance after reloads, edits, or queued replay.
- `/api/mcpServerRuntimeStatus`
  - Returns current MCP runtime status for Setta + external agent integrations.
  - Request fields: optional `chatId`, optional `engineConfigId`.
  - Response includes `servers`, `externalServers`, `llmConfigPath`, and
    `activeSettaFilesLocation` (`local|global|custom`).

For git route details (`/api/git/*`), see `docs/reference/git-pane.md`.
For project-chat/window-space behavior, see
`docs/reference/project-chat-windowing.md`.

## View Mode + File Browser Route Notes

Recent frontend features in this branch rely on these backend API routes:

- `/api/setViewModeSortOrder`
  - Persists drag-reordered view mode order from tabs and the Overview View
    Modes pane.
- `/api/setSectionVariantSortOrder`
  - Persists drag-reordered section variant order in the UI Editor variants
    list.
- `/api/getFolderContents` with `includeSettaInitialized: true`
  - Adds `isSettaInitialized` on folder entries, used by Home page file-browser
    "Setta" badges.
  - Optional `allowOutsideWorkspaceRoot: true` allows absolute-path browsing in
    surfaces that opt into out-of-workspace navigation (Home workspace browser).
- `/api/checkWorkspaceInitialized`
  - Returns whether a folder has Setta workspace state.
  - Request fields: `folderPath`, optional `allowOutsideWorkspaceRoot`.
  - Used to resolve root-folder badge state (since `getFolderContents` returns
    metadata for children, not the root node itself).
