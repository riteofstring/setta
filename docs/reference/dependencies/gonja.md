# gonja

- Module: `github.com/nikolalohinski/gonja/v2`
- Local status: pinned in `go.mod`
- Local version: `v2.7.0`
- Retrieved: 2026-03-12
- Official package docs: https://pkg.go.dev/github.com/nikolalohinski/gonja/v2
- Official repo: https://github.com/nikolalohinski/gonja

## Why It Exists In This Rewrite

- bounded Jinja-compatible template parsing and execution for Go-owned prompt
  section helpers
- supports strict undefined-variable behavior needed for current prompt
  missing-variable semantics
- lets Setta keep prompt rendering semantics in `internal/promptrender` while
  using a mature parser/runtime instead of heuristic string handling

## APIs We Use Now

- `config.New` with `StrictUndefined = true`
- `loaders.MustNewMemoryLoader`
- `exec.NewTemplate`
- `exec.NewContext`
- `Template.ExecuteToString`
- AST/control-structure packages used by the repo-owned undeclared-variable
  collector:
  - `nodes`
  - `builtins/control_structures`

Current repo call sites:

- `internal/promptrender/render.go`

## Usage Rules For This Repo

- keep all library interaction behind `internal/promptrender`
- preserve Setta-owned prompt-section result semantics:
  - missing inputs return empty rendered text plus `Missing variables: ...`
  - parse/runtime failures return empty rendered text plus a render error
- do not leak gonja AST or runtime types across the project-state boundary

## Gotchas

- gonja does not directly expose every control-structure detail the collector
  needs, so `internal/promptrender` uses a narrow reflected access path for a
  few private fields
- prompt compatibility still depends on Setta’s own wrapper behavior, not just
  raw gonja defaults
