# Morning Decisions — 2026-07-17

Everything engineering-side is done and committed (live install pass,
conformance 6/6 live, org empty). These five items need you; each is minutes.

## 1. Paste the final forum reply

`docs/plans/fly-sprites-forum-post-revision-20260715.md`, section 3a —
the 53.5h reported-cold result. Strongest possible thread bump.

## 2. Sign the cold-gate decision memo

**DONE (owner, 2026-07-17): signed Option A.** Recorded in the memo and the
plan progress log on `setta-3-sprites`.

`docs/plans/sprites-cold-gate-decision-memo.md` — recommendation is
Option A (accept the contract; correctness never depended on real cold).
Reply here with "memo: A" (or B/C) and I'll record it in the plan.

## 3. Authorize Phase 1c live measurements (runbook prerequisite)

The runbook requires these recorded before any live run:

- Maximum spend for the measurement runs: $______ (suggest $10–25; cohorts
  are short-lived disposable Sprites)
- Organization: `setta-100` (reuse) or a fresh disposable org: ______
- Intended geography: ______ (default: wherever setta-100 provisions today)
- Provider bill/invoice observer: you (Fly dashboard Cost Explorer) — ok? ___
- Start/cleanup deadlines: ______ (suggest: start on approval, cleanup same day)

## 4. Record Phase 3 access-path budgets (required BEFORE candidate comparison)

**DONE (owner, 2026-07-19):** adopted before the formal Candidate A/B live
comparison:

- Cold authenticated connection p95: 2,500 ms
- Interactive access-path p95: 250 ms
- Candidate B added interactive overhead: 100 ms maximum
- Reconnect p95: 3,000 ms
- Revocation: new requests within 5 s; existing SSE within 10 s
- Maximum unauthenticated production wake cost tolerated: $0/day

The owner separately authorized `setta-100`, a $5 maximum spend, current default
placement, immediate start and per-candidate cleanup, with a hard two-hour
cleanup deadline. HTTP/SSE, controlled wake probes, rotation, revocation,
suspension, rate limiting, reconnect, and redaction checks were authorized;
WebSocket work and Phase 1c remained excluded. Results and the Candidate B
selection are recorded in `phase3-access-path-live-comparison-20260719.md`.

## 5. Optional sends

- Billing email to billing@fly.io (customer-workload question) — drafted in
  `docs/plans/fly-sprites-support-inquiry.md`.
- Support plan purchase (needed for the beta's >10 concurrent cap anyway).
