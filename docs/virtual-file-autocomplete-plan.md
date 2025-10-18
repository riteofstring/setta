# Virtual File Autocomplete Plan

1. **Add virtual LSP document support**  
   - Extend `ProjectGenPythonCode` and `ProjectPythonCode` with helpers that generate deterministic virtual URIs (e.g. `setta://completion/<project>/<section>`) and send `didOpen`/`didChange` directly through the existing LSP writer API.  
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
