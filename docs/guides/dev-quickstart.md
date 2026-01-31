# Dev Quickstart (Setta)

Short guide for starting/stopping local dev and telling the assistant how to connect.

## Start

Standard dev (per-worktree ports):

```bash
pnpm -C frontend start
```

Reset state + start:

```bash
pnpm -C frontend reset
```

CDP + assistant workflow:

```bash
pnpm -C frontend ai
```

Resets state + starts:

```bash
pnpm -C frontend aireset
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
pnpm -C frontend kill
```

Stop only the CDP/Chrome helpers (repo root):

```bash
./scripts/stop-browser-mcp.sh --devtools
```

## End chat vs. keep running

- Want Setta still running? Leave the `pnpm -C frontend ai` terminal open and just end the chat.
- Want a clean stop? Run `pnpm -C frontend kill`, then close tabs.
