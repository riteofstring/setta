# Easy Button Initial Pane Readiness — 2026-07-15

## Scope

This report covers the delay between opening a workspace and receiving the first
durable Easy Button conversation. Conversation creation legitimately waits for
the provider thread to start, so the UI now renders an explicit Easy Button
startup pane during that work instead of exposing the default empty frame.

## Before

The two user recordings showed the production `/conversations/create` request
taking 962 ms and 1,223 ms. The workspace displayed its default empty frame
during that entire interval.

| Recording | Conversation creation |
| --- | ---: |
| `.recordings/20260716T030822Z/backend-http.jsonl` | 962 ms |
| `.recordings/20260716T030635Z/backend-http.jsonl` | 1,223 ms |

## After

The deterministic production Electron workflow delays the first fake Codex
`thread/start` response by 900 ms. With that backend delay still active, the
Easy Button startup pane appeared 107 ms after the workspace-open action. The
workflow budget is 500 ms and the startup state was `creating`.

Artifact:
`.recordings/topic-conversation-pane-projection/20260716T034743531Z/summary.json`

This changes perceived readiness without claiming the conversation is ready
before its durable provider thread exists. The same workflow then waits for the
real Easy Button surface, verifies that the startup pane disappears, and
continues through the full topic-conversation lifecycle.
