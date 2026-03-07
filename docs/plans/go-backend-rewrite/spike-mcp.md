# Spike: MCP

## Purpose

Reduce uncertainty around MCP before we commit the rewrite to a specific SDK and transport model.

## Questions To Answer

- Is `modelcontextprotocol/go-sdk` good enough for both server and client roles?
- Which transports actually matter for this product?
- How much custom glue is required for:
  - auth
  - namespacing
  - scope enforcement
  - tool metadata
  - frontend affinity
- What parts of MCP should remain behind our own abstractions?

## Scope

This spike should cover:

- one minimal MCP server
- one minimal MCP client
- one authenticated tool call path
- one namespaced tool call
- one scoped tool call decision point
- one transport setup that matches the likely production shape

## Out Of Scope

- full parity with current MCP features
- rich tool search implementation
- LLM orchestration integration
- polished production API design

## Candidate Default

- `github.com/modelcontextprotocol/go-sdk`

Alternatives should only be considered if the default spike fails on a concrete requirement.

## Prototype Requirements

### Server Prototype

- expose at least one init-like tool
- expose at least one regular tool
- include structured tool metadata
- show how auth is enforced outside or around the SDK

### Client Prototype

- connect to one server
- list tools
- call one tool successfully
- handle one auth failure path

### Product-Specific Checks

- namespaced tool identity
- scoped tool invocation boundary
- ability to keep SDK request/response types out of most of the codebase

## Evaluation Criteria

- transport support quality
- API ergonomics
- auth integration friction
- metadata/schema support
- streaming behavior
- stability and maintenance risk
- amount of wrapper code required

## Deliverable

At the end of the spike we should have:

- a recommendation:
  - use
  - use with tight wrapper
  - do not use
- a list of MCP concerns that stay custom
- a minimal internal interface sketch for the Go rewrite

## Exit Criteria

- one authenticated end-to-end MCP tool call works
- server and client integration both feel viable
- we can name the abstraction boundary we want to keep around the SDK
- we have a written accept or reject decision

## Failure Conditions

- SDK hides transport or auth concerns in ways that fight the product
- schema or tool metadata support is too awkward
- the client/server split forces too much SDK leakage into application code

## Follow-Up If Successful

- lock the SDK choice in the master plan
- define `internal/mcpx` boundaries
- move on to Phase 6 with reduced uncertainty
