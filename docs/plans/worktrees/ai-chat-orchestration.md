# AI Chat Orchestration

## Checklist Instructions

- Mark an item `[x]` only after implementation, relevant tests, and verification are complete.
- Keep the linked detailed plan doc updated with decisions/scope changes while working.
- If a task is split or re-scoped, update both this checklist line and the linked plan path.

## Todo Checklist

- [ ] Add dictation support in chat input by using provider/environment audio-input capabilities when available. Plan: `docs/plans/worktrees/ai-chat-orchestration/01-dictation-support-in-chat.md`
- [ ] Enforce a non-negotiable completion rule for project/section creation flows: the assistant must run error checks before saying work is done. Plan: `docs/plans/worktrees/ai-chat-orchestration/02-mandatory-error-check-before-completion.md`
- [ ] Show a clear AI-working indicator in the overview pane while an agent is actively working on a section. Plan: `docs/plans/worktrees/ai-chat-orchestration/03-overview-pane-ai-working-indicator.md`
- [ ] Support agent-style slash commands in chat (`/new`, `/resume`, `/model`, etc.), with GUI affordances for common commands and CodeMirror-style autocomplete. Plan: `docs/plans/worktrees/ai-chat-orchestration/04-slash-commands-gui-and-autocomplete.md`
- [ ] Add conversation history browsing/restoring for chat sections. Plan: `docs/plans/worktrees/ai-chat-orchestration/05-chat-conversation-history.md`
- [ ] Add a permission-mode control below chat input (`minimal`, `yolo`, `config.toml custom`) as a Setta-style dropdown; align styling with existing chat top controls. Plan: `docs/plans/worktrees/ai-chat-orchestration/06-chat-permissions-buttons.md`
- [ ] Add a search toggle control below chat input; match active/inactive states used by existing chat top controls. Plan: `docs/plans/worktrees/ai-chat-orchestration/07-chat-search-toggle-button.md`
- [ ] Add a skills toggle control below chat input (integrated with the skills browser work); align styling with existing chat top controls. Plan: `docs/plans/worktrees/ai-chat-orchestration/08-chat-skills-toggle-button.md`
- [ ] Add starter prompt buttons, including a conditional "Create Project" button shown only when Python is present in the working directory; clicking dispatches a preset prompt for codebase analysis, project/section setup, and error-check-first execution. Plan: `docs/plans/worktrees/ai-chat-orchestration/09-starter-prompt-buttons-python-project-flow.md`
