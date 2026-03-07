# Go Rewrite Docs

This folder contains the working plan set for the Go backend rewrite.

Use the docs in this order:

1. `go-backend-rewrite-plan.md`
   - master roadmap and sequencing
2. `go-backend-rewrite-stack-recommendations.md`
   - stack and library research input
3. `dependency-docs-local-reference.md`
   - safe acquisition and local-reference strategy for external dependency docs
4. `testing-strategy.md`
   - rewrite-wide testing expectations, harness model, and coverage rules
5. `phase-0-capability-inventory-and-harness.md`
   - immediate planning work before implementation
6. `phase-1-foundation-runtime.md`
   - first implementation phase
7. `phase-2-auth-modes-request-context.md`
   - auth, mode-policy, and request-context implementation plan
8. `phase-3-project-state-core.md`
   - project-state persistence, runtime ownership, and revision plan
9. `phase-4-realtime-and-terminal-runtime.md`
   - realtime ownership, websocket fan-out, and terminal runtime plan
10. `phase-4-terminal-transport-migration.md`
   - focused current-work plan for terminal websocket and HTTP transport migration
11. `phase-4-terminal-run-code-migration.md`
   - focused current-work plan for remaining terminal run-code migration
12. `phase-4-generated-entry-runs-and-temp-terminals.md`
   - focused current-work plan for generated-entry run support and temporary-terminal fallback
13. `phase-4-deployment-run-code-policy-and-session-overlays.md`
   - focused current-work plan for deployment/share run-code policy and session runtime foundations
14. `phase-4-deployment-session-transport-and-cleanup.md`
   - focused current-work plan for deployment session bootstrap/state transport and session cleanup ownership
15. `phase-4-deployment-state-routes-and-projectstate-transport.md`
   - focused current-work plan for frontend-facing Go project-state transport and deployment state/project-config route migration
16. `phase-4-listener-realtime-producer-migration.md`
   - focused current-work plan for the remaining listener realtime producer boundaries
17. `phase-4-plugin-worker-listener-event-bridge.md`
   - focused current-work plan for the first Go plugin worker host + transport boundary needed by the remaining listener producer migration
18. `phase-4-plugin-worker-session-owner.md`
   - focused current-work plan for the first Go-owned backend worker process/session lifecycle boundary
19. `phase-4-plugin-codegen-worker-runtime.md`
   - focused current-work plan for the first worker-backed plugin codegen runtime and target invocation boundary
20. `phase-4-plugin-codegen-refresh-owner.md`
   - focused current-work plan for the first Go-owned plugin codegen output materialization owner above the worker runtime
21. `phase-4-codegen-targets-mutation-transport.md`
   - focused current-work plan for the first IDE project-state mutation/save transport that can drive the new Go codegen refresh hook
22. `phase-4-python-codegen-runtime-and-enablement.md`
   - focused current-work plan for first-party Python codegen runtime ownership, generated file materialization, and target enablement
23. `phase-5-lsp-diagnostics-and-completion-runtime.md`
   - focused current-work plan for the first Go-owned LSP runtime, diagnostics, and completion transport
24. `spike-mcp.md`
   - MCP uncertainty-reduction plan
25. `spike-pty.md`
   - PTY uncertainty-reduction plan
26. `spike-lsp.md`
   - LSP uncertainty-reduction plan

All docs in this folder assume a clean-break rewrite:

- no backward compatibility requirement
- no legacy route preservation requirement
- no storage migration requirement
- current Python code/tests/docs are reference material, not a compatibility contract
