# Dependency Docs Local Reference Strategy

## Goal

Keep rewrite work local-source-first by default.
Only do a targeted online documentation pass when local code, installed
packages, and repo notes are not enough for a correctness-sensitive decision.

## Default Mode

For normal rewrite work:

- keep web search off
- rely on local sources:
  - repo usage patterns
  - `go.mod`, lockfiles, and generated types
  - installed Go module source, comments, examples, and `go doc`
  - installed frontend package source, types, README files, and tests
  - locally stored dependency reference docs

## Acquisition Mode

Use this only when local source, installed package docs, and existing repo
notes are not enough.

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

When local docs disagree with installed source or types, installed source and
types win.

When both local source and locally stored notes are insufficient, do a short
Acquisition Mode pass, update the local reference set, then return to normal
development.

Do not silently rely on memory or heuristics when a library-specific source of
truth is missing and the behavior matters.

## When More Online Docs Are Needed

If the current work needs additional documentation from online sources:

- ask the user to enable web search before retrieving it

If the user does not enable web search:

- note the missing documentation explicitly in the plan doc for the phase,
  spike, or slice currently being worked on
- state which library or API surface needs an online acquisition pass
- continue to the next useful implementation step if the work can still proceed
  robustly from local source, installed types, and existing notes

Do not silently fill the gap from memory alone when the missing documentation
matters to a correctness-sensitive decision.

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
