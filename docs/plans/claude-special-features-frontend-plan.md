# Claude Code special UI features plan

This plan covers how to represent Claude Code "plan mode", checklists/todos,
and AskUserQuestion flows in the Setta frontend.

## Goals
- Surface Claude Code plan mode in the UI so users know tools will not execute.
- Render Claude SDK todo/checklist updates as a structured checklist in chat.
- Render AskUserQuestion prompts as interactive UI and return answers to the SDK.
- Reuse the existing chat stream pipeline (`LLMStreamingResponse`) and tool call
  rendering wherever possible.

## Non-goals
- Full parity with the Claude Code CLI UI.
- Changing or replacing Setta's current chat/stream schema for non-Claude engines.
- Adding new tool types beyond Claude SDK special flows.

## Current code snapshot (what exists today)
- Claude SDK events are translated into `LLMStreamingResponseChunk` in
  `backend/setta/agentic/external_adapters/claude_sdk.py`, driven by the Node
  sidecar `backend/setta/agentic/external_adapters/sidecars/claude_sdk_runner.mjs`.
- Stream chunks are sent to the frontend and handled by
  `frontend/src/state/actions/ai.ts`, then rendered in
  `frontend/src/components/Chat/ChatMessages.tsx`.
- Tool calls are rendered as generic accordions. Approvals are special-cased via
  `setta.approval` and `route_respond_external_agent_approval` in
  `backend/setta/routers/agentic.py`.
- External agent raw events are stored as `RunEvent` type `external_event` and
  run metadata includes `approvalPolicy` in
  `backend/setta/agentic/external_agent_runner.py`.

## Gaps
- No UI for todo/checklist tool calls.
- No mechanism to answer AskUserQuestion tool calls.
- Plan mode is not surfaced in the UI.
- Approval requests are surfaced as generic tool calls with a hidden
  approve/deny affordance (expand the accordion to reach the buttons), which
  is unintuitive for users.

## Proposed UX

### Plan mode
- Show a "Plan mode" badge when the active external engine is Claude Code and
  the external agent config (or run metadata) has `approvalPolicy = "plan"`.
- Place badge near the engine selector / status line in Project Chat and Chat
  sections (keep it lightweight; no new dialog).

### Todo/checklist
- Detect the todo tool by name and parse its arguments into a `TodoList`.
- Render a checklist card with status counts (pending/in-progress/completed).
- Update the latest checklist in place on each new todo tool call.
- Keep older todo tool calls in the chat log as compact summaries, not full
  duplicates, to avoid noise.

### AskUserQuestion
- Detect the question tool by name and render a question card inline in the
  assistant message (or modal if inline becomes crowded).
- Support single- and multi-select using the tool payload's `multiSelect` flag.
- On submit, call a new backend endpoint that returns the tool response to the
  SDK and emits a `ToolResultEvent` so the UI shows the answer.

### Approvals
- Render approvals with a distinct UI (not a generic tool accordion).
- Show a compact approval banner/card with the key tool details, and keep the
  approve/deny controls visible without expanding an accordion.
- Keep the existing accordion details available behind a "Details" toggle if
  the user wants full input payload inspection.

## Data model additions (frontend)
- Extend `ChatDetails` with `todoState` and `pendingQuestions`, or derive these
  on render by scanning messages and tool results.
- Define shared types for `TodoItem`, `TodoList`, and `AskUserQuestionPayload`
  in a small helper module (avoid `any`).
- Add a tool-name mapping helper (question/todo) so the UI can switch on the
  normalized tool name in one place.

## Backend changes
1) Tool response plumbing
   - Extend `ExternalAgentAdapter` with a `send_tool_response(...)` method.
   - Update `backend/setta/agentic/external_adapters/claude_sdk.py` and
     `claude_sdk_runner.mjs` to accept stdin messages like
     `{ type: "tool_response", toolCallId, payload }` and forward them to the
     Claude SDK tool response API.
   - Track pending question tool calls in `ExternalAgentRunner` (mirror the
     approval flow) so responses can be routed to the correct run.

2) New API route
   - Add `route_respond_external_agent_question` (or a generic tool response
     route) in `backend/setta/routers/agentic.py`.
   - Payload should include `toolCallId`, `answers`, `chatId`, and/or `runId`.
   - On success, emit a `ToolResultEvent` with a `ToolChatMessage` so the chat
     log reflects the answer.

3) Metadata/badging
   - Ensure `approvalPolicy` (plan mode) continues to be persisted in
     `run.outputs.metadata` for UI display.

## Frontend changes
1) Tool parsing and state updates
   - In `frontend/src/state/actions/ai.ts`, detect todo/question tool calls
     when applying `ToolCallDeltaEvent` or when finalizing messages.
   - Update `todoState` / `pendingQuestions` in `ChatDetails`, or compute a
     derived view that `ChatMessages` can consume.

2) Rendering components
   - Add `TodoListCard` and `QuestionCard` components under
     `frontend/src/components/Chat/`.
   - Add an `ApprovalCard` (or similar) with always-visible approve/deny.
   - In `ChatMessages.tsx`, render these components when a tool call name
     matches todo/question/approval tools.

3) Answer submission
   - Add `respondExternalAgentQuestion` in
     `frontend/src/state/actions/ai.ts`.
   - Add a generated endpoint in `frontend/src/utils/generatedEndpoints.ts`
     (via `pnpm generate`) matching the backend route.
   - Show pending/error states similar to the approval UI.

4) Plan mode badge
   - In `ProjectChat` and `ChatArea`, read the selected engine config and
     external agent config to surface a "Plan mode" badge.
   - Also show the badge for historical runs via `run.outputs.metadata`.

## Open questions to resolve before implementation
- How does the SDK expect tool responses to be returned (explicit tool-response
  API vs. callback)?
- Should the checklist be pinned (single list per chat) or rendered inline per
  tool call?

## Confirmed raw SDK payloads (Jan 21, 2026)

### TodoWrite (tool_use)
From `setta_files/agent_runs/51755832-a788-4747-8728-65da8888c5ea.json`:
```json
{
  "type": "tool_use",
  "name": "TodoWrite",
  "id": "toolu_01LsyCdW1h5FdCtqQS1u9XSC",
  "input": {
    "todos": [
      {
        "content": "Review project documentation",
        "status": "pending",
        "activeForm": "Reviewing project documentation"
      },
      {
        "content": "Set up development environment",
        "status": "in_progress",
        "activeForm": "Setting up development environment"
      },
      {
        "content": "Write unit tests",
        "status": "pending",
        "activeForm": "Writing unit tests"
      },
      {
        "content": "Fix linting errors",
        "status": "completed",
        "activeForm": "Fixing linting errors"
      },
      {
        "content": "Deploy to staging",
        "status": "pending",
        "activeForm": "Deploying to staging"
      }
    ]
  }
}
```

### TodoWrite result (tool_use_result)
From the same run file:
```json
{
  "tool_use_result": {
    "newTodos": [ /* same shape as input.todos */ ],
    "oldTodos": []
  }
}
```

### AskUserQuestion (tool_use)
From `setta_files/agent_runs/6a1f6bc2-b472-413b-a0a7-bffd677e2f90.json`:
```json
{
  "type": "tool_use",
  "name": "AskUserQuestion",
  "id": "toolu_01FPbd5xVu2byS4o7hu8wrZd",
  "input": {
    "questions": [
      {
        "header": "Language",
        "question": "Which programming language would you prefer for this test project?",
        "multiSelect": false,
        "options": [
          {
            "label": "Python (Recommended)",
            "description": "Great for data science, scripting, and general-purpose development with extensive libraries"
          },
          {
            "label": "TypeScript",
            "description": "Ideal for web applications with type safety and modern JavaScript features"
          },
          {
            "label": "Rust",
            "description": "Best for performance-critical systems with memory safety guarantees"
          },
          {
            "label": "Go",
            "description": "Excellent for concurrent systems, microservices, and cloud-native applications"
          }
        ]
      },
      {
        "header": "Features",
        "question": "Which features do you want to enable for this test?",
        "multiSelect": true,
        "options": [
          {
            "label": "Logging",
            "description": "Add structured logging throughout the application"
          },
          {
            "label": "Authentication",
            "description": "Include user authentication and authorization"
          },
          {
            "label": "API endpoints",
            "description": "Set up RESTful API endpoints"
          }
        ]
      }
    ]
  }
}
```

### AskUserQuestion approval mapping (current behavior)
The SDK emits an `approval_request` for `tool: "AskUserQuestion"`. Setta maps it
to a `setta.approval` tool call with arguments:
```json
{
  "approvalId": "<uuid>",
  "tool": "AskUserQuestion",
  "input": { "questions": [ /* same as tool_use input */ ] }
}
```
This is currently rendered as a generic tool accordion, and the approve/deny
buttons are hidden until the accordion is expanded. This should be replaced
with a dedicated approval UI.

## Suggested files to touch
- Backend:
  - `backend/setta/agentic/external_adapters/base.py`
  - `backend/setta/agentic/external_adapters/claude_sdk.py`
  - `backend/setta/agentic/external_adapters/sidecars/claude_sdk_runner.mjs`
  - `backend/setta/agentic/external_agent_runner.py`
  - `backend/setta/routers/agentic.py`
  - `backend/setta/types/agentic.py`
- Frontend:
  - `frontend/src/state/actions/ai.ts`
  - `frontend/src/state/definitions.ts`
  - `frontend/src/components/Chat/ChatMessages.tsx`
  - `frontend/src/components/Chat/` (new components)
  - `frontend/src/utils/generatedEndpoints.ts` (via `pnpm generate`)

## Manual QA checklist
- Claude external run in plan mode shows a badge in Project Chat and Chat
  sections.
- TodoWrite tool calls render a checklist and updates replace the previous list.
- AskUserQuestion tool call renders options; submitting answers resumes the run.
- Answered questions show a tool result summary and disable further edits.
- Non-Claude engines keep current behavior.
