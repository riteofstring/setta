# Agent CLI Integration (Setta)

This doc describes a CLI-first workflow for agents that can run shell commands
(Codex, Claude Code, OpenCode). The goal is a stable, machine-readable contract
without MCP.

## Recommended flow (single command)

Run commands from the workspace that owns the Setta session:

```sh
setta api get_latest_project_state_summary --json '{"projectConfigId":"..."}' --json-output
```

`setta api` auto-auths using the newest local session in the current workspace.
Use `setta tools` to list available tool names and schemas.

## Auth fallback

If auto-auth fails (missing session, different workspace, or remote host),
produce an auth JSON file and reuse it:

```sh
setta auth --json --latest > /tmp/setta_auth.json
setta api get_latest_project_state_summary --auth-json /tmp/setta_auth.json \
  --json '{"projectConfigId":"..."}' --json-output
```

You can also pass auth JSON via stdin:

```sh
setta auth --json --latest | setta api get_latest_project_state_summary --auth-stdin \
  --json '{"projectConfigId":"..."}' --json-output
```

## Output parsing rules

- Only parse stdout when `--json` (for `setta auth`) or `--json-output` (for
  `setta api`) is used.
- `setta tools` always emits strict JSON on stdout.
- When `--json-output` is set, errors are emitted as JSON objects.

## Useful references

See `docs/reference/setta-cli-commands.md` for CLI contracts. Use `setta tools` output
for MCP tool schemas. `/api/openapi.json` is only needed for legacy REST calls.
