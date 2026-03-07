# Go Rewrite Docs

This folder contains the working plan set for the Go backend rewrite.

Use the docs in this order:

1. `go-backend-rewrite-plan.md`
   - master roadmap and sequencing
2. `go-backend-rewrite-stack-recommendations.md`
   - stack and library research input
3. `testing-strategy.md`
   - rewrite-wide testing expectations, harness model, and coverage rules
4. `phase-0-capability-inventory-and-harness.md`
   - immediate planning work before implementation
5. `phase-1-foundation-runtime.md`
   - first implementation phase
6. `spike-mcp.md`
   - MCP uncertainty-reduction plan
7. `spike-pty.md`
   - PTY uncertainty-reduction plan
8. `spike-lsp.md`
   - LSP uncertainty-reduction plan

All docs in this folder assume a clean-break rewrite:

- no backward compatibility requirement
- no legacy route preservation requirement
- no storage migration requirement
- current Python code/tests/docs are reference material, not a compatibility contract
