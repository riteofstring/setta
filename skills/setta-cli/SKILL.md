---
name: setta-cli
description: Use the Setta CLI to authenticate and call Setta APIs without MCP.
compatibility: Requires the Setta CLI on PATH and access to a running Setta backend session.
metadata:
  version: "0.1.0"
---

# Setta CLI (no MCP)

Use this skill whenever you need a CLI-first, machine-readable way to call
Setta APIs. Prefer a single `setta api` command when possible.

## Quickstart

Run commands from the workspace that owns the Setta session:

```sh
setta api GET_LATEST_PROJECT_STATE --json '{"projectConfigId":"..."}' --json-output
```

## Auth fallback

If auto-auth fails (missing session, different workspace, or remote host),
generate auth JSON and reuse it:

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

- Only parse stdout when `--json` (for `setta auth`) or `--json-output`
  (for `setta api`) is used.
- When `--json-output` is set, errors are emitted as JSON objects.

## References

- CLI contract and options: `references/cli.md`
- HTTP API notes and OpenAPI location: `references/http-api.md`
