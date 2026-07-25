# Phase 3 Selected-Path Offline Hardening — 2026-07-19

## Outcome

Candidate B is ready for a production-shaped hosted measurement, but not for a
production deployment. The routing boundary now requires authorization,
runtime-route, and content-free observation implementations; applies bounded
HTTP server settings that preserve long-lived SSE; records relayed request and
response bytes; and distinguishes denial, routing, provider-open, upstream, and
stream-failure outcomes without retaining a URL, runtime name, client address,
query, header, credential, or body.

The web client now implements the offline portion of the connection policy. It
closes registered SSE connections when hidden, placed in the page cache, or
offline, and resumes once from the last accepted cursor when visible and online
again. It uses browser events rather than polling.

## Gateway boundary

The required content-free observation contains only:

- a normalized HTTP method category;
- completion time and duration;
- HTTP status and exhaustive gateway result;
- whether route resolution and provider transport were reached; and
- request and response bytes actually relayed.

The HTTP server bounds request headers and read/idle time. Its whole-response
write timeout is deliberately disabled because such a timeout would terminate
healthy SSE streams. TLS and edge request normalization remain responsibilities
of the eventual hosting deployable.

Deterministic tests prove:

- every production boundary dependency is mandatory;
- raw custom methods are reduced to `OTHER` rather than retained;
- a denial records neither route resolution nor provider transport;
- a forwarded request records exact relayed body bytes and transport state;
- credential separation, header stripping, failure redaction, SSE flushing,
  runtime credential rotation, and push revocation still pass; and
- the same live Phase 3 harness compiles against the hardened gateway contract.

## Explicit boundary

This slice does not add an in-memory production authority or a standalone
gateway service. The plan intentionally keeps the thin gateway in the future
Go control-plane deployable, whose durable database, secret store, grant
authority, routing records, reconciliation, budget enforcement, and deployment
boundary are Phase 5 work. Adding a second temporary authority or deployable
would violate that boundary rather than advance it.

No external infrastructure was created and no provider credential was used.

## Remaining Phase 3 evidence

1. Deploy the gateway inside the selected control-plane boundary and pin its
   intended region.
2. Use one disposable private Sprite to record actual placement when available,
   gateway CPU/memory, relayed bytes, availability/failure behavior, attached-
   idle provider activity, and actual cost.
3. Repeat the hidden/offline/resume policy on a representative phone and across
   a real network transition.
4. Review Cost Explorer and close the physical-region comparison condition.

These steps require new live deployment/spend authorization; the real-device
step also requires owner access to a representative phone.
