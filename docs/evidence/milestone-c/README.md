# Milestone C design records

This directory holds Milestone C's package-only design decisions while the milestone is in
progress. It is not an accepted-output baseline: nothing here has developer visual or interaction
approval. The accepted baseline is recorded only after the Milestone C acceptance gate, alongside
the milestone-a and milestone-b bundles.

- [C1 command registry](c1-command-registry.md)
- [C2 key bindings](c2-key-bindings.md)
- [C2 viewport and selection bindings](c2-viewport-and-selection-bindings.md)
- [C2 focus scopes and section navigation](c2-focus-and-navigation-bindings.md)
- [C2 creation chords and empty-space placement](c2-creation-bindings.md)

## Frozen reference

Frozen main at `043d3b2e9c69caf99d1246f1408b3ad7194b7864` has no command registry. Its actions are
written directly into each surface — section header buttons, context menus, Inspector panes — and
its shortcut engine binds separate application handlers. The registry, its surfaces, and its
disabled-state explanations are therefore package design authorized by C1 of
`docs/plans/setta-workspace-extraction-plan.md`, not main parity. Every canonical operation the
commands run is unchanged accepted package behavior.
