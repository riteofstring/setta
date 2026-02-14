# ai-chat-orchestration

## Checklist Instructions
- Mark an item `[x]` only after implementation, relevant tests, and verification are complete.
- Keep the linked detailed plan doc updated with decisions/scope changes while working.
- If a task is split or re-scoped, update both this checklist line and the linked plan path.

## Todo Checklist
- [ ] dictation support in chats (use dictation features / audio input feature of various LLMs?). Plan: `docs/plans/worktrees/ai-chat-orchestration/01-dictation-support-in-chat.md`
- [ ] when requesting the chat ai to create sections, project etc, we need a system prompt or something like that lists a non-negotiable rule that the LLM must check for errors before stating it has completed the task. Plan: `docs/plans/worktrees/ai-chat-orchestration/02-mandatory-error-check-before-completion.md`
- [ ] overview pane should show when an AI is working on a section. Plan: `docs/plans/worktrees/ai-chat-orchestration/03-overview-pane-ai-working-indicator.md`
- [ ] chat: support an agent's slash commands (codex and claude code for instance have slash commands like /new or /resume or /model -- should this have gui options for all common or similar slash commands across different agents? probably should support codemirror style auto complete in the chat typing area too). Plan: `docs/plans/worktrees/ai-chat-orchestration/04-slash-commands-gui-and-autocomplete.md`
- [ ] chat sections need to be able to show conversation histories. Plan: `docs/plans/worktrees/ai-chat-orchestration/05-chat-conversation-history.md`
- [ ] need buttons below chat input to set permissions (minimal, yolo mode, config.toml custom). Plan: `docs/plans/worktrees/ai-chat-orchestration/06-chat-permissions-buttons.md`
- [ ] need button below chat input to toggle search. Plan: `docs/plans/worktrees/ai-chat-orchestration/07-chat-search-toggle-button.md`
- [ ] need button below chat input to toggle skills on and off (skills browser being worked on in appgen-output-quality, can have the actual details of what skills might be used). Plan: `docs/plans/worktrees/ai-chat-orchestration/08-chat-skills-toggle-button.md`
- [ ] we should have a couple starter prompt buttons. we have create project ui which should only exist if there is any python in the working directory. when it exists, and the button is clicked, it should send off a pre-saved prompt that essentially says to look at the existing codebase and create a project, test thfor errors, and lay out all sections with good organization. Plan: `docs/plans/worktrees/ai-chat-orchestration/09-starter-prompt-buttons-python-project-flow.md`
