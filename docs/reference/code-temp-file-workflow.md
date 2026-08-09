# Code Temp File Workflow

This note collects the current Go-owned conventions around the files we surface
to the language server for completions and signature help.

## Canonical project files

- Code-section bindings come from project-state `CodeFileBinding` data and are
  reconciled before LSP work runs.
- Generated Python bindings come from
  `internal/projectstate.ReconcilePythonGeneratedBindings`, which assigns
  canonical write-only paths under
  `setta_files/code/sections/<projectConfigName>/setta_gen.py` and optional
  `setta_gen_meta.py`.
- `internal/lsp.ProjectSynchronizer` opens the canonical section files plus the
  generated Python files with the LSP so cross-file imports resolve against the
  latest on-disk state.

## Completion snapshots

- Snapshot completions are handled by `internal/lsp.Service.CompleteSnapshot`.
- The service writes a throwaway sibling file named
  `<base>__<hex>.<ext>` beside the canonical reference document, opens it with
  `didOpen`, issues the completion request, then always sends `didClose` and
  unlinks the temp file.
- This keeps completions isolated from the canonical document while preserving
  the same import-resolution directory.

## Snapshot builders

- `internal/lspcompletion/python_snapshot_builders.go` builds the temporary
  content and cursor position for:
  - normal code-area completions
  - generated Python param/value completions
  - generated output-accessor completions
  - generated prefix/suffix completions
- Generated Python snapshot builders clone the project, reconcile generated
  bindings, rebuild the Go-owned dependency graph, and render temporary
  `setta_gen.py` content through `internal/codegen.PythonCodeRenderer` plus
  `internal/codegen.PythonMetadataRenderer` when metadata is enabled.
- `internal/lspsignature/service.go` uses the same generated-snapshot context
  for signature help so completion and signature requests stay aligned.

## Operational expectation

- Snapshot requests must leave no temp files behind after completion success or
  failure; `internal/lsp/completion_snapshot_test.go` and
  `internal/lspcompletion/service_test.go` cover that cleanup path.
- If a completion resolves imports from neighboring files, that comes from the
  canonical synchronized documents, not from a persisted snapshot.

## Quick reference

| Scenario                          | Files touched                                                |
| --------------------------------- | ------------------------------------------------------------ |
| Canonical code-section sync       | `setta_files/code/sections/<projectConfigName>/<Section>.py` |
| Generated code sync               | `setta_files/code/sections/<projectConfigName>/setta_gen.py` |
| Generated metadata sync           | `setta_files/code/sections/<projectConfigName>/setta_gen_meta.py` |
| Snapshot completion request       | sibling temp file `.../<base>__<hex>.<ext>`                 |
