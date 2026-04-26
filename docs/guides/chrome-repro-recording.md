# Chrome Repro Recording

Use this guide for the capture-first workflow:

1. run `./scripts/record-chrome-repro.sh`
2. reproduce the issue in the dedicated Chrome window
3. close that window
4. hand the resulting bundle to Codex

This is separate from `chrome-devtools-mcp`. Use
[browser-mcp-quickstart.md](/Users/kevin/Documents/AppDevelopment/setta.go-rewrite/docs/guides/browser-mcp-quickstart.md)
when you want Codex to drive the browser live through Chrome DevTools MCP.

## Default flow

Run:

`./scripts/record-chrome-repro.sh`

For branches that require HTML-in-Canvas / CanvasFlow, pass the Chromium feature
flag:

`CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement" ./scripts/record-chrome-repro.sh`

Behavior:

- starts Setta with the normal dev-state defaults
- prefers Playwright's bundled Chrome for Testing when available
- launches a dedicated browser profile with a local recording extension
- runs the backend at debug log level for the repro session
- captures browser events into `${TMPDIR:-/tmp}/setta-chrome-recordings/<repo>/recording-<timestamp>/`
- fails early if the recorder extension did not actually attach
- finalizes the bundle when that Chrome window exits

Options:

- `--artifact-dir <dir>` to override the output directory
- `--reset` to clear the active dev `setta_files_dev` state first

## Resolve The Latest Bundle

Use the helper instead of guessing under `/tmp`:

- `./scripts/latest-chrome-recording.sh` prints the newest bundle path
- `./scripts/latest-chrome-recording.sh --json` prints the newest bundle plus key log and metadata paths
- `./scripts/latest-chrome-recording.sh --field backendLog` prints a specific resolved path
- `./scripts/latest-chrome-recording.sh --field llmArtifactsManifest` prints the bundled LLM artifact manifest path

The recorder also writes a stable pointer under the recording root:

- `latest`: symlink to the newest bundle
- `latest.json`: machine-readable pointer metadata for the newest bundle

## Bundle Contents

- `recording.json`: finalized event recording payload
- `events.ndjson`: raw event stream
- `console.ndjson`: browser console, page errors, and unhandled rejections
- `transport.ndjson`: fetch/XHR/websocket activity captured from the page runtime
- `transport_details.ndjson`: full request/websocket payload sidecar for large transport events
- `app_state.ndjson`: app-published debug snapshots such as diagnostics state
- `session.json`: recording summary metadata
- `launcher.json`: launcher/bootstrap metadata
- `llm_engine_artifacts/`: redacted generated external-agent artifacts copied from the active `setta_files` root when a recording includes external-agent runs
- `llm_engine_artifacts/manifest.json`: copied run summary, copied file list, and any collection issues
- `extension/`: the generated unpacked extension used for that session
- `logs/`: dev-instance, collector, and browser logs

The recorder captures more than raw clicks and inputs:

- browser console output and uncaught runtime failures
- fetch/XHR/websocket activity from the page
- full websocket/request payload details in the transport sidecar when previews are truncated
- app-published frontend debug snapshots when Setta emits them during state updates
- backend debug summaries in `logs/backend.log` for LSP diagnostics and watch-code refresh flows
- generated external-agent session artifacts such as run metadata, session config, session logs, and rollout JSONL when those runs were part of the recording

LLM artifact bundling rules:

- Bundled artifacts are copied into `llm_engine_artifacts/` after the recording finishes.
- Sensitive keys such as cookies, authorization headers, and tokens are redacted in copied JSON, JSONL, and TOML payloads.
- Unsafe or high-noise session files are intentionally omitted, including `auth.json`, sqlite state/log files, `shell_snapshots/`, `tmp/`, and `memories/`.
- The default source-checkout dev flow uses an explicit `SETTA_FILES_ROOT`, so bundling works automatically there.

## Handoff To Codex

Recommended handoff flow:

1. Run `./scripts/record-chrome-repro.sh`.
2. Reproduce the issue and close the dedicated Chrome window.
3. Tell Codex `see the latest Chrome recording`.

Repo guidance maps that phrase to `./scripts/latest-chrome-recording.sh --json`,
so the agent can jump straight to the newest bundle and its logs.

## Useful Overrides

Pass `SETTA_CHROME_REPRO_SKIP_DEV_START=1` when you want to attach to an already
running local Setta instance, and `SETTA_CHROME_REPRO_BOOTSTRAP_URL=<url>` to
skip bootstrap URL discovery. Use `SETTA_CHROME_REPRO_LOG_LEVEL=<level>` to override
the default debug backend logging for the repro session. Use `CHROME_EXTRA_ARGS`
for required Chromium feature flags such as
`--enable-blink-features=CanvasDrawElement`.
