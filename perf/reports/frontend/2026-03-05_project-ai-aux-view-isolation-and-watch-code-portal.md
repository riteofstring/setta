# Project AI Aux View Isolation And Watch Code Portal

Date: 2026-03-05
Area: frontend
Branch/Commit: chat-refinements @ working tree
Code paths touched:
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx`
- `frontend/src/forks/xyflow/controls/Controls.tsx`
- `frontend/tests/e2e/overview/project-ai/project-ai-chat-skills-mcp-viewer.spec.ts`
- `frontend/tests/e2e/overview/layout/watch-code-pane.spec.ts`

## Goal

Remove hidden-view side effects from the Project AI Skills/MCP/Slash viewer and keep the Watch Code portal correctly clamped after post-open content growth.

## Scenario

- Project AI settings:
  - Open `Project AI Chat`.
  - Open `Project AI Settings`.
  - Switch between `Skills`, `MCP`, and `Slash Commands`.
- Watch Code portal:
  - Open `watch code settings`.
  - Add folder rows after the portal is already open.

## Before (baseline)

- Aux view side effects:
  - Hidden tabs could still trigger unrelated agent-run loading, skill discovery, or MCP runtime status work.
  - This created avoidable backend/file-system/network activity outside the active tab.
- Watch Code portal sizing:
  - The portal observer attached only during initial mount.
  - Adding rows after open could leave the popover positioned with stale dimensions.

## After

- Aux view isolation:
  - Data fetching and polling are now gated by the active `viewMode`.
  - Automated guardrail: Playwright test `project ai chat skills view does not fetch MCP runtime status while hidden` passed.
  - Result: no `/api/getMcpRuntimeStatus` request is allowed while the UI stays on `Skills`.
- Watch Code portal stability:
  - The portal now observes the mounted popover element itself.
  - Manual CDP geometry check after adding folder rows post-open:
    - `left=43`, `right=395`, viewport width `1440`
    - `top=402.25`, `bottom=760`, viewport height `772`
    - `clampedHorizontally=true`
    - `clampedVertically=true`

## Verification

- Playwright:
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/overview/project-ai/project-ai-chat-skills-mcp-viewer.spec.ts frontend/tests/e2e/overview/layout/watch-code-pane.spec.ts`
  - Pass (`32` tests)
- Chrome DevTools MCP:
  - Verified the Skills tab renders the backend-selected custom-skill root label.
  - Verified the Slash Commands tab still exposes the custom-command editor.
  - Verified the Watch Code portal remains on-screen after rows are added post-open.

## Notes

- During the CDP session, the already-running backend on `:8099` still served the old bare-array `/api/getAppGenSkills` payload.
- For manual visual verification only, the browser session wrapped that response into the new typed object shape so the updated frontend could be inspected against the intended contract.
