# Fly Sprites Support Inquiry Draft

Date: 2026-07-14
Status: Send-ready draft; not sent

## Recipient and subject

Recipient: Fly/Sprites support and billing contact
Subject: Setta beta: cold semantics, per-Sprite billing data, capacity, and customer-workload terms

## Message

Hello Fly/Sprites team,

Setta is evaluating Sprites for a bounded beta that would give each user a
persistent Linux development environment for interactive terminals, previews,
and explicitly bounded coding-agent work. Provider credentials would remain in
our control plane; users would not receive our organization token.

We have pinned `sprites-go`
`v0.0.0-20260706200727-0d0f37d154bd` and observed server version
`0.0.1-rc45`. Create, inspect, URL settings, Services, policy,
checkpoint/restore, renewable Tasks, filesystem persistence, and cleanup worked
through the typed adapter.

We need help resolving the following before making a beta decision:

1. **Cold semantics and observability.** After filling the organization's warm
   capacity, the API reported eleven cold Sprites. Waking the target preserved
   its original Service process and advancing heartbeat rather than starting a
   new process. Is the organization `cold` counter allowed to include
   memory-preserving suspended VMs? What supported machine-readable signal
   proves memory has been discarded?
2. **Deterministic testing.** Is there a documented operation, test control, or
   disposable organization configuration that forces a same-Sprite
   memory-dropping cold transition? We do not want to rely on undocumented
   lifecycle endpoints.
3. **Billing data.** Is authoritative CPU, memory, hot/cold storage, checkpoint,
   and network usage available per Sprite through an API or export? What is the
   first-visibility and final-settlement delay, and how are plan credits and
   overages represented?
4. **Storage/checkpoints.** Are copy-on-write checkpoint bytes billed as hot,
   cold, or a separate category? How quickly does storage classification
   change, and how is deletion/TRIM reflected?
5. **Resource bounds.** Can an organization request and inspect a fixed
   whole-Sprite CPU and memory ceiling suitable for a hard per-user budget? If
   memory remains provider-managed, what maximum billable exposure can we
   enforce before suspending?
6. **Placement and capacity.** Which placement data is supported by the API?
   What creation, running, warm, rate, and geography limits should a 20–100 user
   beta expect, and what is the quota-escalation process?
7. **Customer workloads.** Please confirm whether one Sprite per Setta customer,
   including hardware-isolated execution of customer and coding-agent code, is
   permitted. What abuse-reporting, suspension, and escalation process applies?
8. **Reliability/support.** Which SLA, status components, incident escalation,
   and support response targets apply to the relevant paid plan? Are there
   separate control-plane, execution, storage, and gateway commitments?
9. **Data protection and exit.** Please identify encryption, backup, durability,
   data-residency, deletion, and recovery commitments. Is there a supported
   off-provider filesystem export suitable for disaster recovery or migration?
10. **URL/proxy access.** Is a scoped end-user Proxy credential or provider-edge
    custom authentication mechanism planned, so clients do not require an
    organization bearer token and unauthenticated traffic cannot trigger work?

Our provisional beta guardrails are approximately $25 provider cost per user
per month and at most 60 seconds from a Setta cutoff decision to compute stop.
We are happy to provide the disposable run ID, timestamps, and content-free
lifecycle evidence privately.

Thank you,

Setta cloud-platform team

## Before sending

- Replace the generic recipient with the account's supported channel.
- Attach only content-free lifecycle timestamps and identifiers; do not attach
  tokens, repository data, or the full local environment.
- Record the sent time, ticket ID, responder, and every answer in the Phase 1b
  and Phase 1c evidence reports.
- Do not treat silence, an undocumented workaround, or a dashboard screenshot
  as a machine-readable provider contract.
