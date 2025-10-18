# Virtual File Autocomplete Plan

1. **Add virtual LSP document support**  
   - Extend `ProjectGenPythonCode` and `ProjectPythonCode` with helpers that generate deterministic virtual URIs (e.g. files under `<temp>/virtual_docs/<project>/<section>.py`, or an `untitled:` URI when `SETTA_VIRTUAL_COMPLETION_SCHEME=untitled`) and send `didOpen`/`didChange` directly through the existing LSP writer API.  
   - Maintain parity with the current temp-file flow by gating the new behavior behind a temporary feature flag so we can fall back while validating.

2. **Switch completion handlers to virtual documents**  
   - Update `text_field_completion`, `code_area_completion`, and related helpers to opt into the virtual document path.  
   - Ensure the helpers still reuse the latest generated code snapshot so the LSP receives the same text it would have seen via the temp files.  
   - Confirm imports continue to resolve by keeping dependent modules (real files or other virtual docs) registered with the server.

3. **Write regression coverage for virtual completions**  
   - Add a test that exercises the virtual-document path end-to-end: open a project, trigger a completion that relies on a virtual file, and assert the LSP response is surfaced correctly.  
   - Where direct LSP invocation is hard to automate, mock the LSP writer to verify the `didOpen`/`didChange`/completion request sequence and ensure fallbacks still work when the feature flag is disabled.

4. **Retire the temp-file fallback**  
   - Once the virtual flow and test coverage are stable, remove the feature flag and delete the legacy temp-file writes from the completion code paths.  
   - Document the new behavior and the expectations for keeping virtual documents open when completions need cross-file context.

## Current Progress

- Backend completions can now target virtual LSP URIs when the `SETTA_ENABLE_VIRTUAL_COMPLETIONS` environment variable is truthy; the existing temp-file flow remains the default fallback.
- Regression coverage lives in `tests/project_state/test_project_code_virtual.py`, verifying the virtual-document path and the legacy path behind the feature flag.
- The optional `SETTA_VIRTUAL_COMPLETION_SCHEME=untitled` toggle lets us experiment with Pyright’s untitled document handling without changing code.
- Default virtual docs now generate stable paths under `<temp>/virtual_docs`, while the untitled scheme keeps everything in-memory for LSP purposes. The backend start script exports the feature flag to simplify manual QA.
- Added an integration suite (`tests/lsp/test_virtual_completion_integration.py`) that boots basedpyright and exercises completions for both the file-based and untitled URI schemes, ensuring end-to-end parity with the real language server.

### Next Steps

- Monitor completions with the untitled scheme enabled to confirm there are no regressions (timeouts, diagnostics mismatches, or project reload issues) and codify any flaky cases as additional integration tests.
- If untitled mode remains stable, flip the default scheme to `untitled` and remove the file-backed fallback.
- Once the scheme is final, delete the temporary `SETTA_ENABLE_VIRTUAL_COMPLETIONS` guard and rip out the old per-request temp-file completion path.
- Pyright currently fails to surface completions for relative imports when the imported module exists only in a virtual document (see the skipped integration test); resolving this upstream or falling back to temp-file mirroring is required before we can remove the legacy flow.
