# Setta Remote Runtime — Plan of Record

**Date:** 2026-07-02
**Status:** Plan of record. This is the single source of truth for the remote-runtime direction. It supersedes `byo-setta-runtime-architecture-report.md` (kept for background research) and all earlier RFC/bootstrap drafts (deleted). If another document contradicts this one, this one wins.

## What We Are Building

Setta is the orchestration and control surface for AI work (chat, agent runs, workflow graph) running on machines the **user** owns. Users bring compute; Setta brings the product. We do not provision, bill for, or operate infrastructure.

```text
Setta Desktop (Electron)  ─┐
Laptop / Phone (later)    ─┼── Tailscale ──> setta serve on a user-owned box
                           │                 (workspaces, terminals, agents,
Local desktop backend ─────┘                  workflow kernel, SQLite state)
```

Team is two people. The strategy is: **prove the core works, then add features.** Everything below is either in the proof of concept or explicitly deferred.

## Decisions (settled — do not relitigate without updating this doc)

1. **All backend work is Go.** The existing `setta-backend` (`internal/runtime`, `internal/httpapi`) is the runtime. The old Python/Fly `setta-saas` repo is a parked prototype; lessons only, no code reuse.
2. **BYO compute only.** No managed runtimes, no provider APIs, no Setta-held cloud credentials, no relay/tunnel service. Cloud infra is not our differentiator.
3. **Tailscale is the only remote access method.** Not SSH forwarding, not public HTTPS, not LAN. One dependency gives us encryption, identity, NAT traversal, and phone access (Tailscale mobile app). Other transports (incl. Nostr-based VPNs — interesting, not yet mature) are deferred until the product is proven.
4. **The runtime serves plain HTTP; Tailscale is the security boundary for transport.** App-level auth still exists (below) because tailnets can be shared and mobile needs narrower permissions than desktop.
5. **One runtime = one human.** No multi-user runtimes. No cross-runtime history sync — state lives on the runtime that produced it.
6. **One auth code path.** The local Electron-spawned backend is just a pre-paired device (bootstrap token over stdout). No `if local, skip auth` branches.
7. **Mobile mirrors the desktop.** The phone shows the same project through the same niri pane layout — on a phone a pane is ≈ one screen width and you swipe along the strip. It is NOT a reduced "companion app" with a curated feature subset. First implementation: Android PWA (the desktop renderer built for the web), with Web Push sent directly from the runtime (zero Setta infrastructure). Native app (and the APNs relay it requires) only if the PWA proves insufficient.
8. **Notifications matter**: "agent finished / agent needs approval / agent responded" push is a core feature, not a nice-to-have.

## Proof of Concept — the demo is the spec

The PoC is done when this exact sequence works:

```text
1. On a Linux box already on your tailnet:
     curl -fsSL <install-url> | sh          # installs `setta` to ~/.local/bin
     setta serve --tailnet                  # binds tailnet IP, prints pairing URL + QR
2. In Setta Desktop: "Add runtime" -> paste/scan pairing URL -> runtime appears
   in the runtime picker alongside "Local".
3. Select the remote runtime: open a workspace on that box, run a chat/agent
   session, run a workflow, attach a terminal. Everything visibly executes there.
4. setta devices revoke <id> on the box kills the desktop's access within 30s.
5. Switching back to "Local" behaves exactly as today.
```

No other features gate the PoC. Manual SSH to the box for install is fine — our first users are technical.

### PoC Phase 2 (immediately after): the same workspace on the phone

The Android PWA is the desktop renderer built for the web, showing the **same project through the same niri pane layout** — a pane is ≈ one screen width on a phone; swipe moves along the strip. Pane layout is already runtime-side state (`internal/workspaceui`; store methods `LoadLayout`/`SaveLayout`, exposed as the `ReadWorkspaceUILayout`/`SaveWorkspaceUILayout` endpoints), so desktop and phone genuinely see the same panes, not merely the same kind of UI. Plus Web Push for run-finished / approval-requested / agent-responded.

Implementation facts that gate this — Phase 2 is a real project, not a build-flag flip:

- The renderer reaches the backend **only** via `window.setta` — a preload IPC bridge (`desktop/src/preload/index.ts:348`) to the main process, which owns the HTTP client. The web build needs a second implementation of the same `SettaAPI` interface (`desktop/src/shared/types.ts`, ~130 methods across 11 namespaces) speaking HTTP/SSE directly. Good news: `desktop/src/generated/backend.ts` already generates not just the request/response shapes but a complete fetch-based HTTP client (`createBackendClient(baseURL, fetchImpl)`), so the web adapter's request layer mostly exists; the new work is the event-subscription surface and the shims below.
- **SSE in the browser must use fetch-streaming, not `EventSource`.** Native `EventSource` cannot set headers, and the auth rule below (bearer header on every stream, never query strings) is non-negotiable. The Electron main process already reads all five SSE streams via `fetch` + `response.body.getReader()` (`desktop/src/main/backend-event-stream.ts`); the web adapter uses the same pattern.
- The Electron-only surface is bigger than `app.*` (window drag, open-in-editor, region capture, editor discovery, git info via child_process): also the native folder-picker dialog for opening workspaces and `workspaceNativeViews` (already optional in the `SettaAPI` type — omit it). Each needs a web equivalent or a graceful stub.
- There is no web build target today — only `electron-vite` producing main/preload/renderer together. A standalone Vite web target for the renderer is new work.
- Service workers (install + push) require HTTPS: put `tailscale serve` in front of the runtime — one command, valid tailnet certs, still zero Setta infra. `setta serve --tailnet` prints the exact command. Note `tailscale serve` proxies from loopback, so the runtime must not use client IP for anything meaningful (see pairing rate-limit note below).

## The Model (minimal)

**Runtime** — one `setta serve` (or Electron-spawned) process. Identity: `runtime_id` = random 128-bit hex generated at first start, stored in `<app-data-dir>/runtime/identity.json` with a user-editable display name. Clients verify `runtime_id` on every connect; a mismatch means "different runtime at this address" and blocks with a warning.

**KnownRuntime** (client-side, JSON in Electron `userData`):

```text
{ runtime_id, display_name, base_url, device_token, is_local, last_connected }
```

One URL per runtime. No endpoint lists, kinds, or priorities — that generality is deferred with the transports that needed it.

**Connection states:** `disconnected → connecting → connected`, with terminal states `unreachable`, `revoked` (re-pair), `incompatible` (protocol mismatch: render cached data, disable controls).

## Pairing and Auth

Tokens: random 256-bit values, stored **SHA-256-hashed** in runtime SQLite (new `internal/runtimeauth` store: `device_sessions`, `pairing_tokens`).

- **Pairing is runtime-initiated only** (possession of the box is the trust root):
  `setta pair` prints a single-use URL (10-min expiry) + QR:
  `setta://pair?rt=<runtime_id>&tok=<token>&url=http://<tailnet-ip>:7345`
- Client calls `POST /pairing/complete` with the token and its display name; gets back `{device_id, device_token, runtime_id, protocol_version}`. Guard it with a global (not per-IP) rate limit — behind `tailscale serve` every request arrives from loopback, so per-IP limiting is meaningless. The real protection is that tokens are single-use with a 10-minute expiry; the rate limit only blunts brute-force guessing (e.g. 10 failed attempts/min runtime-wide, constant-time token compare).
- Every other request: `Authorization: Bearer <device_token>` — including all SSE streams (header auth, never query strings; browser clients therefore consume SSE via fetch-streaming, not `EventSource` — see Phase 2). The only unauthenticated routes are `GET /runtime/info` (id, name, versions) and `POST /pairing/complete`. **No unauthenticated event streams, ever** (the setta-saas prototype's global unauthenticated WebSocket is the mistake we do not repeat).
- **Scopes: one full-access scope (`full`) in the PoC.** Every paired device is you, and the phone mirrors the full desktop UI, so a reduced "mobile scope" has nothing real to protect: a device that can send chat and approve agent commands can already execute arbitrary code, so excluding terminals or other endpoints would be security theater. Protection against a lost/stolen device is fast revocation, not permission curation. The `device_sessions` table keeps a `scope` column (only value: `full`) so narrower scopes (e.g. a future `preview-only` share) arrive without a migration.
- **Revocation:** `setta devices list|revoke <id>` on the box. Revoked sessions 401 immediately; live SSE connections closed by a 30s sweep.

## Backend Changes (file-level contract)

- `internal/runtime/server.go` — `Config` gains `AllowRemote bool`. `Config.Validate()` (loopback check, ~line 114) permits non-loopback only when `AllowRemote`; `AllowRemote` forces auth-required mode. Note `Validate()` requires a numeric IP (it rejects hostnames), so `--tailnet` must resolve the tailnet IP itself — it cannot pass a MagicDNS name as `Host`. `ReadyEvent` gains `bootstrapToken` + `protocolVersion` (the Electron supervisor's `parseReadyLine` in `desktop/src/main/backend-supervisor.ts` already tolerates extra fields); desktop-spawned backends mint one `full`-scope session at startup and emit its token — that is the local auto-pair (same single scope value as every other device; the session's display name distinguishes it).
- `internal/httpapi/endpoints.go` — `registerEndpoints` (~line 166) wraps every handler with: resolve bearer → device session (constant-time compare) → 401 → stamp `last_seen_at`. One insertion point, no per-handler edits (the endpoint table gets an unauth flag for the two public routes). The wrapper must preserve `http.Flusher` on the `ResponseWriter` — the SSE handlers type-assert it (`internal/httpapi/event_stream.go`), so a naive wrapper struct silently breaks every stream. Per-endpoint scope requirements are added only when a second scope value exists.
- `internal/httpapi` — new endpoints in the same table: `GET /runtime/info` (unauth), `POST /pairing/complete` (unauth, guarded), `POST /devices/list`, `POST /devices/revoke`, `POST /push/subscribe|unsubscribe|test`.
- **Protocol version:** single int constant in `internal/httpapi`; bumped on any breaking contract change; emitted by `cmd/generate-contracts` alongside a schema hash (CI check: breaking hash change without a bump fails). Reported in `/runtime/info`, `/health` (`internal/httpapi/health.go`), pairing responses. Clients ship a supported range.
- `cmd/setta` — new user-facing CLI over the same `internal/runtime`: `serve` (`--tailnet` resolves the tailnet IP and binds it with `--allow-remote`; default port 7345), `pair`, `devices`. `cmd/setta-backend` stays as-is for Electron.
- **Phase 2:** `internal/notify` — VAPID keypair at first start; Web Push subscriptions per device session (die on revoke); pushes for run-finished, approval-requested, agent-responded; payloads carry IDs only, clients fetch content over their authenticated connection.
- **Untouched:** `internal/workspace*`, `internal/terminal`, `internal/chat`, `internal/orchestrator`, `internal/semanticgraph`. If a change looks like "make service X remote-aware," the model is being violated.

Rollout order: auth middleware + local bootstrap (desktop unchanged) → `cmd/setta` serve/pair/devices → desktop runtime picker + KnownRuntime storage → install script → PoC demo → Phase 2 (PWA + push).

Sizing note on the picker step: the main process today has exactly one module-level backend handle plus five singleton SSE forwarders (`desktop/src/main/index.ts`), and no Electron `userData` persistence at all. The picker step therefore includes: a runtime registry with an active selection, KnownRuntime storage (greenfield), auth headers on the `fetchImpl` passed to `createBackendClient`, relaxing the loopback-only URL validation in `backend-supervisor.ts` for remote entries, and tearing down/restarting all SSE forwarders on switch. Straightforward, but it is the largest desktop chunk before the demo.

## Deferred (in rough order of expected pull — none gate the PoC)

- `setta remote add user@host` one-shot installer, then an AI-guided setup session in Setta itself (agent runs the installer via existing terminal + approval UX). Design rule when it lands: AI orchestrates idempotent JSON-output commands; it never improvises security-critical config.
- `setta doctor` (structured environment/capability checks) and capability reporting (GPU, agents installed).
- Desktop device-manager UI (CLI is enough for PoC).
- iOS PWA evaluation → native app + APNs relay (the first and only planned Setta-hosted service) if PWA push proves insufficient.
- tsnet (embedded Tailscale) to remove the "install Tailscale first" step.
- Additional transports: user HTTPS proxies, SSH forwarding, Nostr-VPN (watch), LAN.
- Provider setup recipes (Runpod/Hetzner/etc.) as agent-readable checklists.
- Web client for laptops-without-the-app; decide runtime-served vs hosted when it lands.

## Non-Goals (hard lines)

Managed/provisioned runtimes; Setta-held provider credentials; Setta-owned relay or tunnel; multi-user runtimes; cross-runtime history sync; remote file-explorer/IDE parity; store-submitted WebView wrapper apps; TLS termination inside the runtime.

## Open Questions

1. Default serve port — 7345 is a placeholder; settle before docs ship.
2. Install script distribution + binary signing (GitHub releases + checksums assumed; minisign?).
3. Whether `/health` should also be auth-gated or fold into `/runtime/info` (leaning: fold, keep exactly two unauth routes).
