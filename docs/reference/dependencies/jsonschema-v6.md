# jsonschema/v6

- Module: `github.com/santhosh-tekuri/jsonschema/v6`
- Local status: planned candidate, not yet pinned in `go.mod`
- Official package page observed on 2026-03-07: `v6.0.2`
- Official package docs: https://pkg.go.dev/github.com/santhosh-tekuri/jsonschema/v6
- Official repo: https://github.com/santhosh-tekuri/jsonschema

## Why It Is A Candidate

- JSON Schema validation for plugin manifests, tool metadata, MCP-related
  schemas, and other edge-facing contracts
- intended as a validator only, not as the source of product semantics

## API Surface To Use If Adopted

- `jsonschema.NewCompiler`
- `(*Compiler).AddResource`
- `(*Compiler).Compile`
- `(*Schema).Validate`

Feature toggles likely relevant:

- `(*Compiler).AssertFormat`
- `(*Compiler).AssertContent`

## Usage Rules For This Repo

- compile schemas at the boundary, not on every request
- wrap the library in a small internal package so validation behavior stays
  explicit and testable
- keep externally authored schemas explicit; do not make reflected Go types the
  source of truth by default

## Relevant Upstream Guidance

- supports modern JSON Schema drafts, including newer vocabularies
- compiled schemas are the intended runtime form
- custom formats, content encodings, media types, and vocabularies are
  supported when needed

## Gotchas

- format and content assertions are not simply "always on"; enable them
  deliberately
- keep schema loading and reference resolution deterministic
- if adopted, decide early which drafts and assertion settings the repo will
  support
