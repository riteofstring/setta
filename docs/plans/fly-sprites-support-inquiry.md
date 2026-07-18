# Fly Sprites Support Inquiry Draft

Date: 2026-07-15 (revised for brevity and reduced product disclosure; supersedes the 2026-07-14 draft)
Status: Send-ready draft; not sent

## Disclosure posture

Fly can already associate the inquiry with the org (`setta-100`) and its login
email, so the goal is not anonymity from Fly. The goal is to keep the product
name, roadmap, beta scale, and budget out of ticket systems and forwarded
threads. Therefore: no product name in the subject or body, no beta size, no
per-user budget, no cutoff SLO, and no architecture beyond what the questions
require.

## Channel routing

The org currently has no paid plan, so there is no private
`<org-name>@support.fly.io` address (paid support plans only, per
https://fly.io/docs/about/support/). Route accordingly:

- Questions 1–2 (cold semantics, usage/billing API): post on
  community.fly.io, where Fly staff actively answer Sprites threads. Generic
  technical evaluation questions; a public staff answer is citable. Use an
  account not obviously tied to the product.
- Question 3 (end-customer workloads, abuse process): email `billing@fly.io`
  — a terms/account question that should be answered in writing, privately.
- Deferred list: via `setta-100@support.fly.io` after purchasing the plan the
  beta requires anyway (the no-plan 10-concurrent cap forces this).

## Forum post draft (community.fly.io — questions 1–2)

Before posting: check that the forum username/display name is not obviously
tied to the product.

Title: When is a sprite actually "cold"? Org counter showed cold, but wake
preserved the running process

Body:

---

I've been evaluating Sprites for per-user persistent dev environments
(terminal, previews, occasional agent runs) and hit something confusing while
testing wake behavior.

Setup: server `0.0.1-rc45`, Go SDK pinned at
`v0.0.0-20260706200727-0d0f37d154bd`.

What I observed:

- I filled the org's warm capacity, expecting older sprites to go cold. The
  API then reported eleven sprites as `cold` in the org counters.
- I woke one of them, expecting a fresh boot. Instead the original Service
  process was still there with its heartbeat advancing — no new process
  start. That looks like a memory-preserving suspend, not a cold start.

Questions:

1. Can the org `cold` counter include memory-preserving suspended VMs, or
   should `cold` always mean memory was discarded?
2. Is there a machine-readable signal that proves memory was actually
   discarded (boot ID change, lifecycle event, anything documented)? I'd
   rather not infer it from process behavior.
3. Is there a supported way to force a genuine cold transition on a specific
   sprite, for testing? I don't want to rely on undocumented endpoints.

Related, on the accounting side: is authoritative per-sprite usage (CPU,
memory, hot/cold storage) available via an API or export, and what's the
reporting delay? I couldn't find it under the documented API categories, and
I'd like to build cost controls against provider data rather than my own
estimates.

Happy to share sprite names and timestamps for the cold-status observation.

---

## Billing email draft (billing@fly.io — question 3)

Subject: Running end-customer workloads on Sprites — supported use?

Hello,

We're evaluating Sprites for a product where each end customer gets a
persistent Linux development environment. The code inside each sprite would
be our customers' own — including coding-agent runs — under our sandboxing
and egress policy. Our backend holds the org token; customers never receive
provider credentials.

Two questions before we commit to a paid plan and beta:

1. Is one sprite per end customer, running untrusted customer code, a
   supported use of the platform under your terms?
2. What abuse-reporting, suspension, and escalation process would apply to a
   customer workload that causes a problem?

Org: `setta-100`. Happy to provide more detail privately.

Thanks,

[personal first name]

## Deferred follow-up questions (second contact, once a dialogue exists)

Held back deliberately; several are account-manager topics rather than
first-touch support questions, and some reveal scale or budget posture:

- Whether `warm` bills resident memory, and the maximum billable memory
  exposure before suspend (pairs with the Phase 1c measurement).
- Checkpoint copy-on-write bytes: billed hot, cold, or separately; storage
  reclassification timing; deletion/TRIM behavior.
- Enforceable whole-Sprite CPU/memory ceilings for hard per-user budgets.
- Placement data, creation/rate/geography limits, and quota escalation for a
  small beta (do not state cohort size until it matters).
- SLA scope, status components, incident escalation, and support response
  targets on the relevant paid plan.
- Encryption, backup/durability, data-residency, deletion, and a supported
  off-provider filesystem export.
- Roadmap for a scoped end-user Proxy credential or edge auth so clients never
  need an org bearer token and unauthenticated traffic cannot trigger wake.

## Before sending

- Follow the channel routing above; when splitting into a forum post, drop the
  email framing (greeting/sign-off) and lead with the observed discrepancy.
- Sign with a personal name only; no product name, beta size, per-user budget,
  or cutoff target in first contact.
- Attach only content-free lifecycle timestamps and identifiers; no tokens,
  repository data, or the full local environment.
- Record the sent time, ticket ID, responder, and every answer in the Phase 1b
  and Phase 1c evidence reports.
- Do not treat silence, an undocumented workaround, or a dashboard screenshot
  as a machine-readable provider contract.
