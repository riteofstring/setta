# Dev Quickstart (Setta)

Short guide for starting/stopping local dev and telling the assistant how to connect.

## Start

```bash
pnpm -C frontend ai
```

Resets state + starts:

```bash
pnpm -C frontend aireset
```

## Tell the assistant what to use

- “Use agent-browser via CDP” (assistant will use `abcdp-run`).
- “Use chrome-devtools-mcp” (assistant will use the CDP port).

## CDP helpers (manual)

```bash
pnpm -C frontend cdp-port
pnpm -C frontend abcdp-run -- tab
pnpm -C frontend abcdp-run -- snapshot -i
```

## Stop

Stop everything:

```bash
pnpm -C frontend kill
```

Stop only the CDP/Chrome helpers (repo root):

```bash
./scripts/stop-browser-mcp.sh --devtools --playwriter --agent-browser
```

## End chat vs. keep running

- Want Setta still running? Leave the `pnpm ai` terminal open and just end the chat.
- Want a clean stop? Run `pnpm -C frontend kill`, then close tabs.
