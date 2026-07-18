# Easy Button Focus Follow-Up Solution 2 - 2026-07-16

## Scope

Implemented Solution 2 from
`docs/plans/easy-button-focus-and-artifact-reliability-followup-20260716.md`:
explicit narrator status replies now render as one temporary STATUS card in the
left rail above NOW, without modifying Current Focus.

## Verification

Focused renderer checks:

```text
pnpm --dir desktop exec vitest run src/renderer/src/features/easy-button/easy-button-surface.test.tsx src/renderer/src/features/easy-button/easy-button-rails.test.tsx src/renderer/src/features/easy-button/conversation-routing-presentation.test.ts
```

Result: 3 files passed, 43 tests passed.

Production desktop workflow:

```text
pnpm --dir desktop build
node desktop/tests/electron/run-workflows.mjs --workflow topic-conversation-pane-projection --artifact-dir .recordings/easy-button-focus-followup-solution2-20260716
```

Result: passed. Artifact directory:
`desktop/.recordings/easy-button-focus-followup-solution2-20260716`.

The workflow summary's `statusWhileWorking` sample recorded both Alpha panes
with `statusLabel: "STATUS"`, `statusQuestion: ""`, and
`statusReplyText: "The primary topic agent is still working and has not been steered or interrupted."`
Beta's pane kept `statusReplyText: ""`.

## Notes

- The STATUS card contains only the concise narrator reply plus its label; the
  routed question is no longer duplicated inside the card.
- The center intent slot restores the stable focus after the status route
  resolves. While a pane text input is accepted and still routing, the exact
  accepted input temporarily owns the intent slot.
- Renderer tests cover replacement, timestamp expiry, and stale-on-progress
  removal for status replies.
