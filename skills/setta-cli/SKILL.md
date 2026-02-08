---
name: setta-cli
description: Use the Setta CLI to authenticate and call Setta MCP tools without MCP.
compatibility: Requires the Setta CLI on PATH and access to a running Setta backend session.
metadata:
  version: "0.2.0"
---

# Setta CLI (no MCP)

Use this skill whenever you need a CLI-first, machine-readable way to call
Setta MCP tools. Prefer a single `setta api` command when possible.

## Quickstart

Run commands from the workspace that owns the Setta session. Use `setta tools`
to list available tool names and schemas (bare names, no `setta__` prefix):

```sh
setta api get_latest_project_state_summary \
  --agentic-project-config-id "..." \
  --agentic-section-id "..." \
  --json '{"projectConfigId":"..."}' \
  --json-output
```

Agentic scope enforcement is strict by default:
- Without agentic context, `setta api` calls return `structuredContent.reason="missing_context"`.
- With a project config id but no section id, calls return `structuredContent.reason="missing_section_id"`.

To associate tool calls with a specific chat/run, also include the chat id:

```sh
setta api get_latest_project_state_summary \
  --agentic-project-config-id "..." \
  --agentic-chat-id "..." \
  --agentic-section-id "..." \
  --json '{"projectConfigId":"..."}' \
  --json-output
```

IDs may be temporary or canonical.

## Auth fallback

If auto-auth fails (missing session, different workspace, or remote host),
generate auth JSON and reuse it:

```sh
setta auth --json --latest > /tmp/setta_auth.json
setta api get_latest_project_state_summary --auth-json /tmp/setta_auth.json \
  --agentic-project-config-id "..." \
  --agentic-section-id "..." \
  --json '{"projectConfigId":"..."}' --json-output
```

You can also pass auth JSON via stdin:

```sh
setta auth --json --latest | setta api get_latest_project_state_summary --auth-stdin \
  --agentic-project-config-id "..." \
  --agentic-section-id "..." \
  --json '{"projectConfigId":"..."}' --json-output
```

## Output parsing rules

- Only parse stdout when `--json` (for `setta auth`) or `--json-output`
  (for `setta api`) is used.
- `setta tools` always emits strict JSON on stdout.
- When `--json-output` is set, errors are emitted as JSON objects.

## References

- CLI contract and options: `references/cli.md`
- HTTP API notes and OpenAPI location: `references/http-api.md`
