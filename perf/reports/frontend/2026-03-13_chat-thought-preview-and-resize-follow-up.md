# 2026-03-13 Chat Thought Preview And Resize Follow-up

Date: 2026-03-13
Worktree: `misc-fixes`
Dev instance: `http://127.0.0.1:3026`

## Scope

Follow-up runtime polish after the prior chat-window pass:

- completed minimized thought previews snapping back to the first line
- parent activity titles repeating raw thought sentences
- severe browser-window resize hitching with open chat windows

## Baseline

Live route: `/branch_showing`
Surface: open floating chat windows

Observed baseline issues before the fix:

- `ActivityThoughtPreview` explicitly reset `scrollTop` to `0` when `animate` became false, so a completed thought could scroll to the bottom and then jump back to the first line as soon as streaming ended.
- Multiple chat measurement paths in `ChatMessages.tsx` registered their own `window.resize` listeners, multiplying work with every browser resize when message-heavy chat windows were open.
- `ProjectChatBottomDock.tsx` also updated viewport state directly on every raw resize event instead of batching to one animation-frame update per burst.

## Changes

- `ActivityThoughtPreview` now pins completed thoughts to the bottom instead of resetting them to the top when streaming finishes.
- Bottom-pinned previews now stay anchored to the latest line when the preview element remeasures.
- The chat message tree no longer registers per-row global `window.resize` listeners for thought/summary measurement; those paths now rely on element `ResizeObserver`s.
- Dock viewport resize syncing is now batched through a single `requestAnimationFrame` callback per resize burst.
- Parent activity titles now use stable status labels (`Thinking`, `Reasoning`, `Thoughts`) instead of replaying the raw thought sentence.

## Verification

Automated:

- `pnpm -C frontend exec vitest run src/components/Chat/ChatMessages.activityThoughtPreview.test.tsx src/components/Chat/ChatMessages.test.tsx`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/chat-activity-thought-preview.spec.ts frontend/tests/e2e/chat/chat-thought-title-timing.spec.ts frontend/tests/e2e/overview/project-ai/project-chat-bottom-dock.spec.ts`

DevTools / live app:

- Route: `http://127.0.0.1:3026/branch_showing`
- Resize trace interaction: resize the page window through `1500 → 1160 → 1420 → 1220`

After-change DevTools trace summary:

- No long-task or forced-reflow insight set surfaced for the resize interaction.
- The only surfaced insight was `CLSCulprits`, which is expected when the viewport itself is being physically resized and layout is forced to shift.

Live UI checks:

- A visible floating chat window now shows `Reasoning` as the parent activity title instead of repeating the full thought sentence.
- A visible completed thought preview reported `data-chat-assistant-activity-thought-at-bottom="true"` while remaining collapsed, confirming it stayed pinned to the latest line.

## Result

The functional bug is fixed: completed thought previews no longer jump back to the first line after the stream ends.

The resize path is lighter for message-heavy chat windows because the chat renderer no longer fans global `resize` work out per measured row, and the dock batches viewport updates to one animation-frame pass per resize burst. In live headed DevTools use, resize responsiveness is visibly smoother than the pre-fix behavior, while the existing floating-window browser suite still passes intact.
