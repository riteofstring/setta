# Chat UX

This document records intended chat interaction behavior. Treat these notes as
product contracts for future reviews and implementation changes, not as bug
reports.

## Composer Keyboard Behavior

### Tab Queues Follow-Up Messages

Pressing `Tab` in the chat composer is intentionally reserved for queueing the
current draft as a follow-up message.

When the draft is queueable, `Tab` should:

- prevent normal focus traversal from the composer;
- queue the trimmed draft on the selected conversation;
- clear the composer after accepting the draft;
- keep focus in the composer so the user can continue writing.

This shortcut supports the active-run workflow where the user can keep drafting
follow-ups without leaving the keyboard. The visible queue button remains the
mouse and assistive-control affordance for the same action while a run is
active.

Slash-command drafts are the exception. If the composer contains a slash command
draft, `Tab` completes the selected command suggestion instead of queueing a
message.
