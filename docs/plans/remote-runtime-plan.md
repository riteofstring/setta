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
7. **Mobile mirrors the desktop.** The phone should eventually show the same project through the same niri pane layout — on a phone a pane is about one screen width and you swipe along the strip. It is not a reduced companion app with a curated feature subset. The removed browser-build path is no longer a current implementation; any future mobile client needs a new plan.
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

### Deferred mobile client: the same workspace on the phone

The desired phone experience remains the same project through the same niri pane layout. Pane layout is already runtime-side state (`internal/workspaceui`; store methods `LoadLayout`/`SaveLayout`, exposed as the `ReadWorkspaceUILayout`/`SaveWorkspaceUILayout` endpoints), so a future phone client can share durable panes instead of inventing a reduced mobile-only model.

The previous browser-build implementation has been removed. A future mobile client must get its own product plan, client contract, transport details, notification model, and verification gates before implementation.

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

Rollout order: auth middleware + local bootstrap (desktop unchanged) -> `cmd/setta` serve/pair/devices -> desktop runtime picker + KnownRuntime storage -> install script -> PoC demo -> future mobile-client plan.

Sizing note on the picker step: the main process today has exactly one module-level backend handle plus five singleton SSE forwarders (`desktop/src/main/index.ts`), and no Electron `userData` persistence at all. The picker step therefore includes: a runtime registry with an active selection, KnownRuntime storage (greenfield), auth headers on the `fetchImpl` passed to `createBackendClient`, relaxing the loopback-only URL validation in `backend-supervisor.ts` for remote entries, and tearing down/restarting all SSE forwarders on switch. Straightforward, but it is the largest desktop chunk before the demo.

## Findings from the first live demo (AWS box over Tailscale, 2026-07-03/04)

- **Runtime/desktop version awareness is needed beyond the protocol number.** A runtime binary built one day earlier than the desktop spoke the same protocol version but lacked terminal replay-on-attach, producing silently blank terminals. `/runtime/info` should report a build/feature identity the desktop can compare and surface ("runtime older than this app — update it").
- **The agent-spawning environment is a real gap `setta doctor` must cover.** Chat failed twice on the box for environment reasons invisible to the UI: the codex binary was off the serve process's PATH (node under nvm), then its ChatGPT credentials were stale. Capability checks ("agent installed / on PATH / authenticated") belong in doctor and in a clearer chat-error surface.
- **Self-update through setta works.** The `curl | sh` installer and a runtime restart were executed over setta's own terminal API — evidence the deferred "AI-guided setup session" is viable with existing primitives.
- Demo box ops note: on the AWS devbox the runtime runs as a systemd user service (`~/.config/systemd/user/setta-serve.service`, linger enabled) so it survives reboots.
- **Multi-device terminal dims need a policy.** Pane terminals are runtime-side state; two clients (e.g. desktop + phone, or any second device) attaching the same pane at different viewport sizes resize the shared PTY back and forth, and each bounce makes the shell redraw — leaving blank-line artifacts in replay. Options when multi-device becomes real: size-to-smallest-attached (tmux default), per-client virtual views, or last-attach-wins with a full repaint. Deferred with Phase 2 mobile polish.

## Deferred (in rough order of expected pull — none gate the PoC)

- `setta remote add user@host` one-shot installer, then an AI-guided setup session in Setta itself (agent runs the installer via existing terminal + approval UX). Design rule when it lands: AI orchestrates idempotent JSON-output commands; it never improvises security-critical config.
- `setta doctor` (structured environment/capability checks) and capability reporting (GPU, agents installed).
- Desktop device-manager UI (CLI is enough for PoC).
- Mobile client evaluation, including whether a native app and APNs relay are justified.
- tsnet (embedded Tailscale) to remove the "install Tailscale first" step.
- Additional transports: user HTTPS proxies, SSH forwarding, Nostr-VPN (watch), LAN.
- Provider setup recipes (Runpod/Hetzner/etc.) as agent-readable checklists.
- Web client for laptops-without-the-app; decide runtime-served vs hosted when it lands.

## Non-Goals (hard lines)

Managed/provisioned runtimes; Setta-held provider credentials; Setta-owned relay or tunnel; multi-user runtimes; cross-runtime history sync; remote file-explorer/IDE parity; store-submitted WebView wrapper apps; TLS termination inside the runtime.

## Open Questions

1. ~~Default serve port~~ — settled: 7345 (implemented in `cmd/setta`).
2. Install script distribution — settled: GitHub releases + `SHA256SUMS` covering archives and extracted binaries (`scripts/release/`). Binary signing (minisign) still open.
3. ~~Whether `/health` should be auth-gated~~ — settled: `/health` stays unauthenticated alongside `/runtime/info` and `/pairing/complete` (three unauth routes); the supervisor probes health before it holds a token. Revisit only if the unauth surface grows.
4. Mobile-device token storage — unresolved; decide it in the future mobile-client plan.
