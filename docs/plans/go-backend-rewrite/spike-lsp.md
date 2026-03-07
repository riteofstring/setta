# Spike: LSP

## Purpose

Reduce uncertainty around LSP client/session implementation before Phase 5 depends on it.

## Questions To Answer

- Which framing and protocol packages help without taking over the architecture?
- How much of the LSP session manager should we own directly?
- What restart, timeout, and process-supervision rules are needed?
- Which language servers do we need as the minimum viability set?

## Scope

This spike should cover:

- launching one real language server
- stdio framing
- initialize handshake
- open/change document flow
- diagnostics reception
- one completion request

## Out Of Scope

- multi-language production coverage
- advanced LSP feature completeness
- deep editor integration
- final performance tuning

## Candidate Direction

- custom LSP manager
- small helper packages only where they reduce friction

The spike should assume we own session lifecycle and process supervision ourselves.

## Prototype Requirements

### Minimum End-To-End Flow

- start server process
- initialize
- open document
- change document
- receive diagnostics
- request completion

### Failure Paths

- server start failure
- server crash or hang
- restart path
- timeout or cancellation path

### Type And Framing Boundary

- identify what package, if any, should provide:
  - JSON-RPC framing
  - LSP message types
- avoid letting third-party package structure dictate our service design

## Evaluation Criteria

- amount of custom logic still required
- protocol package quality
- framing package quality
- process lifecycle control
- restart friendliness
- type ergonomics
- maintenance risk

## Deliverable

At the end of the spike we should have:

- a recommended framing/types approach
- a proposed `internal/lsp` boundary
- a minimum supported language-server list for early rewrite work
- a written list of lifecycle rules:
  - start
  - initialize
  - restart
  - timeout
  - shutdown

## Exit Criteria

- one real language server works end-to-end
- diagnostics and completion both function
- failure handling is understood well enough for Phase 5 planning
- we know which parts stay custom and which helper packages are acceptable

## Failure Conditions

- no candidate helper approach reduces enough pain
- lifecycle control remains unclear
- language-server behavior varies so much that Phase 5 needs a narrower target

## Follow-Up If Successful

- lock the LSP approach in the master plan
- define the first supported language server for Phase 5
- write a narrower implementation plan for diagnostics and completion flows
