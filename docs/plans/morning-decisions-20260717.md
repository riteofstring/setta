# Morning Decisions — 2026-07-17

Everything engineering-side is done and committed (live install pass,
conformance 6/6 live, org empty). These five items need you; each is minutes.

## 1. Paste the final forum reply

`docs/plans/fly-sprites-forum-post-revision-20260715.md`, section 3a —
the 53.5h reported-cold result. Strongest possible thread bump.

## 2. Sign the cold-gate decision memo

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

**Deferred (owner, 2026-07-17):** budgets are not being recorded now — the
immediate goal is proving the end-to-end cloud UX is workable, built
provider-portably. This item becomes required again before the formal
Candidate A/B comparison.

The plan requires these written down before Candidate A/B experiments so the
decision can't be retrofitted:

- Cold connection time budget: ______ ms (docs claim 1–2s cold wake)
- Interactive terminal p95 latency budget: ______ ms
- Reconnect time budget: ______ ms
- Revocation latency budget: ______ s
- Maximum unauthenticated wake cost tolerated: $______ /day

## 5. Optional sends

- Billing email to billing@fly.io (customer-workload question) — drafted in
  `docs/plans/fly-sprites-support-inquiry.md`.
- Support plan purchase (needed for the beta's >10 concurrent cap anyway).
