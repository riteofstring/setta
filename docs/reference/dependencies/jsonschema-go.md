# jsonschema-go

- Module: `github.com/google/jsonschema-go`
- Local status: pinned in `go.mod`
- Local version: `v0.4.2`
- Retrieved: 2026-03-12
- Official package docs: https://pkg.go.dev/github.com/google/jsonschema-go/jsonschema
- Official repo: https://github.com/google/jsonschema-go

## Why It Exists In This Rewrite

- JSON Schema resolution and validation for Go-owned plugin config writes
- keeps schema loading/validation on a library boundary instead of reimplementing
  JSON Schema behavior in repo code

## APIs We Use Now

- `jsonschema.Schema`
- `Schema.Resolve`
- resolved-schema `Validate`
- custom `jsonschema.Loader`

Current repo call sites:

- `internal/plugins/config_write.go`

## Usage Rules For This Repo

- keep library use behind plugin-config validation helpers
- resolve schemas from local file URIs only for the current plugin-config path
- treat schema-loading failures as explicit config-schema errors, not soft
  fallbacks

## Gotchas

- schema refs still need a repo-owned loader policy; the library does not
  decide local-file restrictions for us
- plugin-config semantics remain Setta-owned even though schema validation is
  library-backed
