# Dependency Docs Local Reference Strategy

## Purpose

Define how this rewrite should gather and use external dependency documentation
when normal development runs with:

- `yolo` mode on
- web search off

The goal is to keep day-to-day development local-source-first while still
allowing targeted, safer documentation acquisition when needed.

## Problem

Two constraints are both reasonable:

- `yolo` mode is useful for fast local execution and editing
- live web search during `yolo` work increases prompt-injection risk and makes
  dependency guidance harder to audit

That means the rewrite should not assume live web access during normal coding.

## Working Approach

Use a two-mode workflow.

### 1. Safe Acquisition Mode

Use this only when local source, installed package docs, and existing repo notes
are not enough.

- turn `yolo` off
- turn web search on
- fetch docs only from official sources when possible:
  - package docs
  - tagged repo READMEs
  - official examples
  - official API references
- avoid broad web research by default:
  - no random blogs
  - no forum scraping
  - no issue-thread harvesting unless a specific edge case requires it

### 2. Normal Development Mode

Use this for routine rewrite work.

- turn `yolo` on
- turn web search off
- rely on local sources:
  - repo usage patterns
  - `go.mod`, lockfiles, and generated types
  - installed Go module source, comments, examples, and `go doc`
  - installed frontend package source, types, README files, and tests
  - locally stored dependency reference docs

## What To Store Locally

Do not dump entire upstream documentation sets by default.

Instead, store a curated, version-pinned local reference for rewrite-critical
libraries under a repo-local docs folder, expected to live under:

- `docs/reference/dependencies/`

For each important library, store:

- pinned version
- official source URLs
- fetch date
- what the library is used for in this repo
- the small API surface we actually depend on
- approved usage patterns
- patterns to avoid
- repo-local examples with file references
- known gotchas and open questions

## Priority Order

Seed local references only for libraries that define runtime boundaries or have
subtle behavior.

Examples for this rewrite:

- `github.com/go-chi/chi`
- `github.com/coder/websocket`
- the chosen PTY library
- MCP SDK once locked
- any frontend state/test library whose behavior becomes a recurring source of
  mistakes

Do not spend time documenting trivial or low-risk helpers first.

## Source-Of-Truth Rule

When local docs disagree with installed source or types:

- installed source and types win

When both local source and locally stored notes are insufficient:

- do a short Safe Acquisition Mode pass
- update the local reference set
- return to Normal Development Mode

Do not silently rely on memory or heuristics when a library-specific source of
truth is missing and the behavior matters.

## Maintenance Rule

Refresh a dependency's local reference when:

- its pinned version changes
- the rewrite starts using a new critical API surface
- development uncovers a gap or ambiguity in the current local notes

Do not try to mirror every upstream change continuously.

## Expected Outcome

This approach gives the rewrite:

- auditable dependency guidance stored in-repo
- lower prompt-injection exposure during normal `yolo` development
- less reliance on stale model memory
- version-pinned notes tied to the actual dependency set in this worktree

## Initial Seed

The first local seed set should live under:

- `docs/reference/dependencies/`

That folder should distinguish between:

- libraries already pinned in `go.mod`
- planned candidates referenced by the rewrite plan but not yet pinned locally
