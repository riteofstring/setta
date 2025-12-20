LSP client stack is in backend/setta/lsp/:

- backend/setta/lsp/server.py spawns a stdio language server (currently hardcoded to ty server) and tracks init state, pending requests, doc versions, and per-URI diagnostics callbacks.
- backend/setta/lsp/writer.py sends JSON-RPC frames (initialize, didOpen/didChange/didClose, completion, signatureHelp, workspace/didChangeConfiguration) and provides send_and_wait for request/response.
- backend/setta/lsp/reader.py reads Content-Length framed messages, routes responses back to pending_requests, and invokes diagnostics callbacks for textDocument/publishDiagnostics.
- Setta features that depend on this: completion + signature help + diagnostics handling in backend/setta/project_state/project_code.py and backend/setta/project_state/lsp_response_handlers/*.

A practical test plan (real subprocess, no fake server) to make a “ty swap” measurable:

- Add a small async harness in tests/utils/lsp_harness.py:
    - asynccontextmanager start_lsp(workspace: Path) that constructs LanguageServer(workspace, settings={}, name="test"), starts server.start(), then LanguageServerReader.start(), then
    LanguageServerWriter.start(), and finally waits (poll + timeout) for server.is_initialized.
    - Note: LanguageServerWriter.start() sends initialize, and the reader triggers an "initialized" notification + configuration update once the response arrives. If ty needs additional
    handshake steps, treat failures here as a signal that Setta's LSP handshake needs adjustment (which is exactly what we want the tests to surface for ty).
    - Cleanup: stop reader, terminate process, close stdin, drain stdout/stderr (you can reuse the shutdown logic pattern from tests/utils/manager_fixture.py).
- Create a new test package tests/lsp/ with unittest.IsolatedAsyncioTestCase tests that drive the exact protocol Setta uses:
    1. test_initialize_handshake_sets_is_initialized
        - Assert server.is_initialized becomes True within a timeout (this will immediately catch if ty requires an initialized notification that Setta doesn’t currently send).
    2. test_completion_on_open_document_returns_items
        - Write a temp file in the workspace, didOpen it, send textDocument/completion at a known position, and assert the response is non-None and contains at least one completion item.
        - (Optional: run it through backend/setta/project_state/lsp_response_handlers/completion.process_completion_response and assert non-empty to validate Setta’s expected response shape.)
    3. test_signature_help_returns_signature
        - Use a deterministic local symbol (define def foo(a: int, b: str = \"x\") -> None: ...; foo( and request signature help at the callsite.
        - Assert result.signatures is non-empty (and optionally validate Setta’s parsing via process_signature_help_response).
    4. test_publish_diagnostics_callback_fires_for_syntax_error
        - Open a file with a syntax error (more portable than type-checker-specific errors), register a diagnostics callback via send_document_open_request(..., diagnostics_callback=...), and assert the callback
        fires and includes at least one diagnostic.
        - This will also catch the “diagnostics version is missing/None” behavior (your Setta gen-code path currently filters by params.version).
- Keep assertions minimal and “capability-focused” (non-empty completion/signature/diagnostics), then add a second tier of Setta-specific tests only if you want to lock in previous-server behavior (basedpyright):
    - e.g. diagnostics include code values like reportCallIssue / reportArgumentType that your process_gen_code_diagnostics depends on (these are likely to change under ty, which might be exactly what you want
    surfaced).
- Decide upfront what “works with ty” means for Setta:
    - If Setta needs completion + signatureHelp + diagnostics, these tests should hard-fail when those aren’t supported.
    - If diagnostics-only is acceptable initially, structure the suite so completion/signature tests can be toggled (env var / settings flag) rather than deleted.
