# Dev Quickstart (Setta)

Short guide for starting/stopping local dev and telling the assistant how to connect.

## Start

```bash
./ai.sh
```

Default dev paths:
- `SETTA_HOME=~/.setta-development`
- `SETTA_FILES_ROOT=<worktree>/dev_setta_files`

Start with explicit runtime profile:

```bash
./ai.sh --profile dev
```

Resets state + starts:

```bash
./aireset.sh
```

Reset/start with explicit profile:

```bash
./aireset.sh --profile dev
```

## Tell the assistant what to use

- “Use chrome-devtools-mcp” (Codex auto-connects to the per-worktree CDP port).

## CDP helpers (optional)

```bash
pnpm -C frontend cdp-port
```

Use that port to point other MCP clients at `http://127.0.0.1:<port>`.

## Stop

Stop everything:

```bash
./kill.sh
```

Stop only the CDP/Chrome helpers (repo root):

```bash
./scripts/stop-browser-mcp.sh --devtools
```

## End chat vs. keep running

- Want Setta still running? Leave the `./ai.sh` terminal open and just end the chat.
- Want a clean stop? Run `./kill.sh`, then close tabs.
