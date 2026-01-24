# Agent CLI Integration (Setta)

This doc describes a CLI-first workflow for agents that can run shell commands
(Codex, Claude Code, OpenCode). The goal is a stable, machine-readable contract
without MCP.

## Recommended flow (single command)

Run commands from the workspace that owns the Setta session:

```sh
setta api GET_LATEST_PROJECT_STATE --json '{"projectConfigId":"..."}' --json-output
```

`setta api` auto-auths using the newest local session in the current workspace.

## Auth fallback

If auto-auth fails (missing session, different workspace, or remote host),
produce an auth JSON file and reuse it:

```sh
setta auth --json --latest > /tmp/setta_auth.json
setta api GET_LATEST_PROJECT_STATE --auth-json /tmp/setta_auth.json \
  --json '{"projectConfigId":"..."}' --json-output
```

You can also pass auth JSON via stdin:

```sh
setta auth --json --latest | setta api GET_LATEST_PROJECT_STATE --auth-stdin \
  --json '{"projectConfigId":"..."}' --json-output
```

## Output parsing rules

- Only parse stdout when `--json` (for `setta auth`) or `--json-output` (for
  `setta api`) is used.
- When `--json-output` is set, errors are emitted as JSON objects.

## Useful endpoints

See `docs/setta-cli-commands.md` and `/api/openapi.json` for payloads and
endpoint definitions.
