# Hosted Control-Plane Live Attempt — 2026-07-20

## Outcome

The authorized hosted Candidate B run stopped before image publication and did
not execute a measurement workload. Three bounded attempts created only the
exact disposable Fly App boundary. Every App was deleted immediately and
independent mutation-token and inventory-token listings both returned zero
matching Apps afterward.

No Fly Machine, Fly Volume, shared IPv4 address, staged Fly secret, Sprite, or
client credential was created. No Phase 1c or WebSocket work ran. The owner
must still review billing; the provider reported the personal organization as
non-billable during inventory, but that is not substituted for billing proof.

## Authorization

- Owner authorization: 2026-07-20T18:58:26Z
- Hard cleanup deadline: 2026-07-20T20:58:26Z
- Maximum spend: USD 5.00
- Fly organization and region: `personal`, `yyz`
- Sprites organization: `setta-100`
- Workload: the fixed hosted Candidate B HTTP/SSE and lifecycle suite
- Exclusions: WebSocket and Phase 1c

## Attempts and cleanup proof

| Run | App create accepted | App delete accepted | Independent absence confirmed |
| --- | --- | --- | --- |
| `hosted-20260720-yyz-1` | 19:06:58Z | 19:08:14Z | 19:08:14Z |
| `hosted-20260720-yyz-2` | 19:19:21Z | 19:19:23Z | 19:19:23Z |
| `hosted-20260720-yyz-3` | 19:25:27Z | 19:25:29Z | 19:25:30Z |

All three durable journals ended in `clean`. Final Fly inventory was zero for
all three exact names. Final Sprites inventory contained none of the run names.

Two issued Fly organization tokens were revoked at 19:28:43Z. The first
read-only token was rejected by the Machines API with HTTP 403 and was replaced
before the successful cleanup retry; it is time-limited to approximately
21:03Z. Every local Fly and Sprites credential copy was removed after final
absence proof. No credential value entered a manifest, journal, report, or
repository file.

## Findings and repairs

1. Current Fly tokens use an internal ASCII space (`FlyV1 <payload>`). The
   runner incorrectly rejected that provider-owned format before mutation.
   Commit `0b2022361` now accepts bounded printable ASCII without outer spaces
   and covers the live format.
2. Isolating `DOCKER_CONFIG` also hid the Docker Buildx CLI plugin. Commit
   `ec041b746` now requires an absolute guarded Buildx executable and installs
   its resolved target into the private Docker configuration. The same commit
   skips provider cleanup inventories when the journal has no resource or
   intent for that provider.
3. The live Sprites list response reported more pages without a continuation
   token. Commit `b80b575ba` replaced cleanup listing with the existing typed
   exact-name inspection path, retaining ownership and provider-ID checks.
4. Image build inputs and a local linux/amd64 Buildx build passed. Fly registry
   authentication created a non-empty `registry.fly.io` Keychain entry, but
   the registry push still failed before writing image metadata.
5. The installed Fly CLI is `0.3.191`; Homebrew stable is `0.4.71`. Fly's
   current documentation still prescribes `fly auth docker` followed by a push
   to `registry.fly.io/<app>:<tag>`, which is the implemented flow. The stale
   CLI's registry credential exchange is therefore the leading unresolved
   cause, but this attempt did not perform another create merely to test that
   inference.
6. Homebrew fetched and verified the `0.4.71` arm64 bottle. A private extracted
   binary is retained at `tmp/hosted-tools/flyctl-0.4.71` with SHA-256
   `611782e7d9bf82ce216589119663ed6c5ff08d1e5fb6e5d96f1601784403bef0`.
   The global `0.3.191` installation was not replaced. The private current
   binary does not consume the legacy CLI's stored login implicitly, so a
   future run must continue to pass an explicit short-lived token.

## Next safe step

Use the prepared private current Fly CLI with explicit short-lived credentials,
verify registry authentication behavior before publishing, and obtain a fresh
time-limited owner authorization before another App create. Do not reuse these
expired manifests or deleted credential files.
