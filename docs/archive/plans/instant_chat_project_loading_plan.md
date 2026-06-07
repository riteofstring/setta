# Instant Chat And Project Loading Plan

## Goal

Chats should feel ready immediately, projects should load immediately, and scrolling through large histories should feel continuous. The user should not hit visible paging boundaries, blank regions, delayed controls, or scroll jumps, even in chats with huge histories and large tool outputs.

This is a perceptual performance goal, not only a raw throughput goal. The app can do work in the background, but the foreground interaction must stay responsive and visually stable.

## Product Targets

- App start shows the selected project shell, sidebar, selected chat chrome, and composer without waiting on chat history scans.
- Project switching updates the active project shell immediately from cached session state, then reconciles details in the background.
- Opening the last selected chat shows the latest usable transcript window and composer immediately.
- Scrolling upward through old chat history prefetches before the user reaches an unloaded boundary.
- Scrolling downward after old pages were loaded remains smooth and does not require refetching unless memory-window eviction has happened.
- Active streaming, queued follow-ups, steering messages, approvals, failed runs, cancelled runs, and long output previews stay usable while history loads or prefetches.
- Renderer logs, backend logs, and recordings stay clean during the performance scenarios.

## Current Baseline

- The transcript already uses `react-virtuoso` in `desktop/src/renderer/src/components/chat-transcript.tsx`.
- The initial chat page is limited to 40 messages in `desktop/src/renderer/src/stores/chat-store.ts`.
- Older chat pages are loaded on demand and the transcript preserves scroll anchors after loading older rows.
- Run activity and run item output pages are already paged separately.
- The current approach prevents loading the entire transcript on first open, but it still allows the in-memory loaded transcript to grow as the user scrolls upward.
- Large individual rows can still be expensive because virtualization only limits mounted rows; it does not make a huge visible markdown/tool-output row cheap.
- Project/session state is persisted through app state, but project open needs to be audited for any synchronous validation, scanning, or chat hydration work that blocks first usable paint.

## Performance Budgets

Use these as initial acceptance budgets. Tune them only after measuring real fixtures.

| Scenario | Budget |
| --- | ---: |
| App shell visible after renderer start | under 100 ms |
| Selected project visible from persisted session | under 50 ms after session response |
| Selected chat composer usable | under 100 ms after selected workspace is known |
| Initial selected chat transcript window visible | under 150 ms on warm cache, under 300 ms cold |
| Project switch shell update | under 50 ms |
| Scroll p95 frame time | under 16.7 ms |
| Scroll p99 frame time | under 32 ms |
| Long tasks during scroll/open | 0 over 50 ms in target fixtures |
| Mounted transcript DOM rows | bounded by viewport plus overscan, independent of total history length |
| Renderer console errors/warnings in perf E2E | 0 new unexpected entries |

## Design Principles

- Keep the foreground path shallow. First paint should use cheap summaries and cached windows, not full workspace or full transcript hydration.
- Keep chat data windowed. Do not let scrolling old history turn the renderer store into a full transcript mirror.
- Prefetch before need. A user should almost never be the first signal that a page is needed.
- Preserve scroll anchors deterministically. Page insertion, eviction, and streaming updates must not move the user's viewport unexpectedly.
- Separate summary data from heavy content. Project lists, conversation rows, timeline metadata, and full text/tool-output bodies should not share the same loading requirement.
- Coalesce streaming writes. Token/output deltas should not force full timeline recomputation or one React render per provider event.
- Measure through production paths. Electron/main/preload/renderer/backend/store paths are the only acceptable proof for chat workflow performance.

## Phase 0: Baseline And Fixtures

Create deterministic performance fixtures with temporary app data.

- Seed an active workspace with:
  - 1 selected conversation with 10,000 short messages.
  - 1 selected conversation with 100,000 short messages.
  - 1 conversation with mixed markdown, code blocks, approvals, steering, queued, failed, and cancelled turns.
  - 1 conversation with very large assistant/tool-output text.
  - Many conversations in the project list so sidebar/project loading is measured too.
- Add a production Electron performance harness for:
  - app start to selected project ready
  - selected chat open
  - project switch
  - rapid scroll upward through history
  - rapid scroll downward after upward history loading
  - active streaming while scrolling
  - reload restoring last selected chat
- Record:
  - time to shell
  - time to composer usable
  - time to first transcript window
  - frame times
  - long tasks
  - mounted DOM node counts
  - heap snapshots or heap samples
  - IPC/backend request counts and durations
  - renderer console output
  - screenshots and recordings
- Append baseline results under `docs/reports/performance/chat-project-loading.md`.

## Phase 1: Instant Project Shell

Make project loading depend first on persisted app-state summaries, then reconcile expensive details asynchronously.

- Audit workspace/session startup for synchronous root validation, filesystem scans, git probing, chat list loading, or terminal/browser setup that blocks shell display.
- Keep active/recent workspace summaries cheap and sufficient for immediate sidebar rendering.
- Defer validation, git metadata, diagnostics, and non-selected workspace hydration until after the selected shell is visible.
- Add explicit loading/reconciliation states for stale or missing metadata, without replacing the shell with a blocking loader.
- Ensure failed background validation marks the affected workspace clearly without blocking other active projects.
- Add a project-load performance test that proves project shell render does not scale with chat count or transcript size.

## Phase 2: Fast Selected Chat Open

Make the selected chat open as one cheap, prioritized transaction.

- Keep using the persisted selected conversation per workspace as the first selection source.
- Introduce or refine a selected-chat snapshot path that can return:
  - selected conversation summary
  - latest transcript window
  - active run summary
  - queued/steering state
  - output preview metadata, not full unbounded output
- Avoid opening a workspace by listing conversations, choosing one, then separately hydrating messages and active run when a single selected snapshot can serve first paint.
- Keep conversation list loading separate from selected transcript loading. The selected chat should not wait for the full sidebar list if the selected conversation ID is known.
- Cache the most recent selected transcript window per workspace in renderer memory for instant project switches during one app session.
- Treat backend response order explicitly so stale slower responses cannot overwrite newer project/chat selections.

## Phase 3: Windowed Transcript Store

Replace append-only loaded history behavior with an explicit transcript window and page cache.

- Define a renderer-side transcript window model:
  - loaded message ordinal range
  - visible row range
  - prefetched older/newer page ranges
  - page cache keyed by conversation ID and ordinal cursor
  - stable row keys independent of page load order
  - measured row-height cache where useful
- Keep only a bounded active window in normalized renderer state, plus an LRU page cache.
- Support two-direction loading so evicted old pages can be revisited without breaking downward scroll.
- Preserve active run rows and live messages outside normal page eviction rules.
- Track total or approximate transcript bounds so Virtuoso can maintain scroll continuity without requiring every row to be loaded.
- Add focused tests for insertion, eviction, anchor preservation, stale page responses, and active-run preservation.

## Phase 4: Barrier-Free History Scrolling

Make page loading predictive instead of reactive.

- Trigger older-page prefetch before the user reaches the top threshold.
- Trigger newer-page prefetch when scrolling back down toward evicted or unloaded ranges.
- Use scroll velocity and viewport range to increase prefetch priority during fast scrolling.
- Use a small prioritized request queue with cancellation for stale project/chat/page requests.
- Keep placeholder space stable for cold misses, but treat any visible placeholder during normal scrolling as a performance failure in E2E.
- Record whether a user-visible loader appeared during scroll scenarios.
- Tune page size and overscan from measurements, not intuition.

## Phase 5: Huge Message And Output Rendering

Make large visible rows cheap enough that virtualization remains effective.

- Split heavy message bodies into renderable blocks:
  - markdown paragraphs
  - code blocks
  - tool output lines
  - approval/detail sections
  - media or attachments if present
- Cache parsed markdown or block segmentation by message ID and content version.
- Defer expensive syntax highlighting until a block is visible.
- For very large code/tool-output blocks, use nested line/block virtualization or paged output views.
- Keep long output previews bounded by design. Expanding output should load and render incrementally, not mount the full output at once.
- Use `content-visibility` only where it improves measured behavior and does not conflict with Virtuoso measurement.
- Add fixtures with huge single-message content because row virtualization alone does not cover that case.

## Phase 6: Streaming Without Reflow Storms

Keep active runs responsive while provider events stream.

- Buffer assistant text deltas and run item output deltas and flush at animation-frame cadence.
- Ensure a flush updates only the affected message/output records and derived rows.
- Avoid rebuilding the entire transcript timeline on every token or output line.
- Keep pinned-to-bottom behavior correct without forcing scroll-to-bottom calls for every small delta.
- Add active-run E2E coverage that streams large output while the user scrolls away from the bottom.

## Phase 7: Deepen The Chat Loading Boundary

Move complexity behind a smaller chat loading interface.

- Create a dedicated chat history/loading module that owns:
  - selected snapshot loading
  - page prefetch
  - page cache
  - window eviction
  - scroll anchor state
  - stale request cancellation
- Keep React components responsible for rendering and user events, not page orchestration.
- Keep Go-owned contracts generated through the existing contract path.
- Do not add compatibility shims or alternate legacy loading paths unless explicitly requested.
- Use deterministic metadata and cursors, not keyword or text-content heuristics.

## Phase 8: Verification And Reports

Verification must prove behavior through the production app path.

- Focused renderer/store tests:
  - selected conversation restoration
  - window insertion and eviction
  - prefetch request decisions
  - stale response handling
  - active-run preservation
  - long output block rendering
- Backend tests:
  - page cursor correctness
  - selected snapshot response
  - large transcript fixture paging
  - output paging
  - app-state selected project/chat persistence
- Production Electron E2E tests:
  - open workspace
  - create/select chat
  - send streamed assistant output
  - queue during active run
  - steering
  - completion/cancellation/failure
  - queued-work preservation or promotion
  - reload restoring selected workspace and selected chat
  - scroll through huge seeded history without visible barriers
- Live Codex E2E:
  - run when local Codex CLI has ChatGPT auth
  - skip narrowly and report the skip when ChatGPT auth is unavailable
  - do not use `OPENAI_API_KEY`
- Performance reports:
  - append every baseline and after-measurement to `docs/reports/performance/chat-project-loading.md`
  - include commands, fixture sizes, artifacts, frame tables, long-task counts, console logs, and screenshots/recordings reviewed
- Final gate before commit:
  - `./scripts/format.sh`
  - focused checks that cover changed behavior
  - `./check_quality.sh --all` only when broad verification is requested for the phase or before committing source changes

## Done Criteria

- The selected project and selected chat are visible and usable before expensive background work completes.
- Project switching does not visibly block on chat history, filesystem scans, diagnostics, or non-selected project hydration.
- Chat opening does not scale with total transcript length.
- Scrolling old history does not show visible loading boundaries in the target fixtures.
- Scrolling remains within frame budgets with no unexpected renderer console output.
- Very large visible messages and tool outputs are rendered incrementally.
- Loaded transcript memory stays bounded during long scroll sessions.
- All chat workflow behavior still passes production Electron E2E coverage.
- Performance results are recorded as append-only reports.
