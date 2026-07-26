# Research Prompt — Fly Sprites Documentation Sweep (2026-07-26)

Hand this file to a research agent. It defines the task, the rules, the
questions, and the output. It is not a plan and contains no implementation work.

## Why this exists

Setta runs each user's hosted runtime on Fly Sprites. We have been building
against the provider by observation rather than by reading it, and it cost us:

- We believed Setta could request a per-Sprite resource shape. It cannot. There
  is no per-Sprite sizing, and the `config` field we were sending was never
  going to be honored.
- We read 8 GiB from inside an idle Sprite and concluded 8 GiB was a hard
  ceiling. Wrong — memory autoscales under pressure.
- The API response shape changed under us between 2026-07-13 and 2026-07-26
  with no signal we were watching for.

Every one of those was answered by one page of the documentation we had not
read. The goal here is to read all of it, once, properly, and leave behind
condensed notes we can trust.

## Sources

Primary, in priority order:

1. `https://docs.sprites.dev/` — every section: Getting Started, Concepts
   (Checkpoints, Connectors, Lifecycle and Persistence, Networking, Services),
   CLI Reference, Integrations.
2. Any HTTP API reference the docs expose. If none exists, say so explicitly —
   that absence is itself a finding, because we depend on the HTTP API directly.
3. `https://github.com/superfly/sprites-go` — README, types, and recent commits.
4. `https://fly.io/pricing/` and any Sprites-specific pricing.
5. The `sprite` CLI's own `--help` output, if reachable.

Secondary, clearly labelled as such: Fly blog posts, community forum threads,
changelogs, release notes.

## Ground rules

- **Quote verbatim for anything load-bearing.** A number, limit, or guarantee we
  might build against gets the exact sentence and its URL with anchor.
- **Never infer a number.** If the docs do not state a maximum, a rate, or a
  timeout, write "not documented" and move on. Do not estimate, and do not
  carry a figure over from a blog post as if it were a spec.
- **Record silence as a result.** "The docs do not say what happens when X" is a
  finding worth writing down, because it tells us what we must test ourselves.
- **Date everything.** This provider is moving fast enough to break us inside two
  weeks. Every note gets a research date and a note that figures are
  time-sensitive.
- **Flag contradictions with observed behavior.** The section below lists what we
  measured. Where the docs disagree with what we saw, say so plainly rather than
  smoothing it over.
- **Separate documented fact from our inference.** Different sections, different
  labels.

## What we already observed

Use this to reconcile, not as a source of truth. All of it is from live probes
on 2026-07-26, recorded in this repo's
`docs/plans/setta-cloud-platform-sprites-plan.md`.

- `GET /v1/sprites/{name}` returns: `id`, `name`, `status`, `version`, `url`,
  `labels`, `url_settings` (with `auth` and `private_access`), `created_at`,
  `updated_at`, `organization`, `last_running_at`, `last_warming_at`,
  `environment_version`. No `config`, no `primary_region`, no `bucket_name`.
- `POST /v1/sprites` returns 201 with the full Sprite object, not `{"name":…}`.
- Requesting `cpus=1, ram_mb=512, storage_gb=10` and `cpus=4, ram_mb=32768,
  storage_gb=50` both produced the identical machine: 8 processors, `MemTotal
  8388608 kB`, 105,542,934,528-byte overlay root, no cgroup limit.
- `GET /v1/sprites` returned `"has_more": true` alongside
  `"next_continuation_token": null`, which is self-contradictory.
- Observed organization limits: 10 running, 10 warm.
- Status went `cold` at creation, then `warm`. We never observed `created` or
  `provisioning`.

## Questions to answer

Grouped by topic. Answer what the docs answer; mark the rest "not documented".

### Resources and memory

1. What exactly is fixed per Sprite, and does it vary by plan, org, or region?
2. How does memory autoscaling work — what triggers growth, how fast, does it
   ever shrink back?
3. Is there any practical or documented memory ceiling? What happens to a
   workload that exceeds it — OOM kill, Sprite restart, throttle?
4. Is autoscaled memory billed differently from baseline memory?
5. Is the 100 GB storage figure a hard ceiling or a soft one, and what happens
   at the limit?

### Lifecycle and persistence

6. Define `active`, `warm`, and `cold` precisely: what triggers each transition,
   how long each takes, and what is preserved versus dropped.
7. What keeps a Sprite alive? Services, HTTP requests, open sessions, something
   else? What are the idle timeouts?
8. What exactly survives a cold transition? Is in-memory process state
   guaranteed to be dropped, or only likely to be? We have a historical result
   where a Sprite reported `cold` while process memory was demonstrably retained
   — does the documentation now define this?
9. What are all the possible `status` values, including transient ones?

### Billing

10. What is billed, on what unit, and at what rate: compute, memory, storage,
    checkpoints, network egress?
11. Is compute billing genuinely zero in warm and cold?
12. How is "bytes actually written" measured for storage, and does deleting data
    reduce it?
13. Is there any per-Sprite fixed or minimum charge?

### HTTP API

14. Is there a published API reference? If yes, capture the endpoints we use:
    create, get, list, delete, exec, suspend, URL settings, services, network
    policy, checkpoints.
15. What are `version` and `environment_version` on the Sprite object?
16. What is `url_settings.private_access`, and what values does it take?
17. What are the pagination semantics of `GET /v1/sprites`, and what does
    `has_more: true` with a null continuation token mean?
18. Was a `config` object ever part of the API, and is its removal documented
    anywhere? Is there a changelog or deprecation policy at all?
19. How are API errors shaped, and is there a documented retry or rate-limit
    contract?

### Services, networking, checkpoints

20. The service model: what fields exist? Specifically, is there now a native
    way to set the user a service runs as? We currently wrap commands in
    `setpriv` because the pinned SDK exposes no such field.
21. Network policy: rule shape, ordering, defaults, and what is denied by
    default.
22. Checkpoints: how they are created, whether automatic checkpoints exist, how
    they are identified, and what restore actually restores.
23. What is the in-Sprite management socket at `/.sprite/api.sock`? Document its
    API, especially anything resembling tasks or leases, which we depend on.

### Limits, quotas, and operations

24. Documented per-organization limits: running, warm, cold, total. Are they
    raisable?
25. Rate limits on the API.
26. Regions and placement: can placement be requested or observed at all?
27. What observability does the platform offer — logs, metrics, events?

### Integrations

28. What are the Remote MCP Server and Claude Managed Agents integrations, and
    do they overlap with what Setta is building?

### Client libraries

29. Is `sprites-go` the supported client, and is it current with the API? Its
    newest published version still declares a `SpriteConfig` the API no longer
    returns.
30. Is there a documented way to be notified of breaking API changes?

## Output

Write condensed notes into the Obsidian vault at
`/Users/jeff/Documents/_projects/m-knowledge`, following that vault's existing
conventions (see its `README.md` and `Operations/LLM Instructions.md`).

**Location:** a new `Setta/Sprites/` folder.

**Files:**

- `Sprites Overview.md` — the index. What a Sprite is, the resource model in
  four lines, links to every other note. Under 200 words.
- `Sprites Resources and Memory.md`
- `Sprites Lifecycle and Persistence.md`
- `Sprites Billing.md`
- `Sprites HTTP API.md`
- `Sprites Services and Networking.md`
- `Sprites Checkpoints.md`
- `Sprites Limits and Quotas.md`
- `Sprites Open Questions.md` — everything the docs do not answer, everything
  that contradicts our observations, and the cheapest test that would settle
  each one.

Also add a dated run note under `Research/Runs/` per the vault's convention,
holding raw links and working notes, so the topic notes stay clean.

**Every note gets:**

- Front matter matching the vault house style: `tags` (include `topic/setta`,
  `topic/research`, and a status tag), `aliases`, `created`, `updated`.
- A `Related:` line linking to the other Sprites notes and to
  `[[Setta Cloud Runtime Vendor Comparison]]`, `[[Setta Map]]`, and `[[Setta 3]]`.
- A research date and a line noting that limits and pricing are time-sensitive.
- Short sections. Concrete evidence. No hype. Verbatim quotes with source URLs
  for load-bearing claims.

**Condensed means condensed.** Target under 400 words per topic note. This is a
reference we will reread under time pressure, not a transcript. If a section
would be long, it probably belongs in the run note instead.

Finally, update `Setta/Setta Map.md` and
`Setta/Setta Cloud Runtime Vendor Comparison.md` with a link to
`[[Sprites Overview]]`, and correct anything in the vendor comparison that this
sweep proves wrong — particularly any claim that Sprite resources are
configurable.

## Done when

- Every question above is either answered with a citation or explicitly marked
  "not documented".
- Every note is under its word budget and readable cold.
- `Sprites Open Questions.md` lists a concrete next test for each unknown.
- The two existing vault notes are updated and correct.
