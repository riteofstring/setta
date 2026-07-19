# Hosted Control-Plane Live Attempt — 2026-07-20

## Outcome

The first authorized hosted Candidate B run stopped before image publication
and did not execute a measurement workload. Three bounded attempts created
only the exact disposable Fly App boundary. A second authorization progressed
through registry publication, signed Sprite runtime preparation, and inner
pairing, then stopped before Fly Volume creation and before any measurement
workload.

Across both authorizations, no Fly Machine, Fly Volume, shared IPv4 address,
staged Fly secret, bootstrap client credential, Phase 1c workload, or WebSocket
work was created or run. The second authorization created one disposable
Sprite, installed and paired the signed runtime, and destroyed that Sprite
immediately after the subsequent Fly Volume request failed. Every Fly App and
the one Sprite were independently confirmed absent. The owner must still
review billing; provider inventory is not substituted for billing proof.

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

## Follow-up authorization and cleanup proof

- Owner authorization: 2026-07-20T22:46:01Z
- Hard cleanup deadline: 2026-07-21T00:46:01Z
- Maximum spend: USD 5.00
- Fly organization and region: `personal`, `yyz`
- Sprites organization: `setta-100`
- Workload and exclusions: unchanged from the first authorization

| Run | Furthest completed stage | App create | Sprite create | Cleanup absence confirmed |
| --- | --- | --- | --- | --- |
| `hosted-20260720-yyz-4` | App boundary; Docker invocation rejected locally | 22:49:07Z | — | App 22:49:10Z |
| `hosted-20260720-yyz-5` | Registry image push; metadata permission attestation failed | 23:15:10Z | — | App 23:15:42Z |
| `hosted-20260720-yyz-6` | Image attested; signed runtime installed and paired; volume request rejected | 23:29:34Z | 23:30:00Z | Sprite 23:30:20Z; App 23:30:21Z |

All three follow-up journals ended in `clean`. The final independent Fly
organization inventory at 00:14:33Z returned zero matching hosted Apps. The
deleted yyz-6 App returned not found for both Machine and Volume inventory, and
exact/prefix Sprites inventory returned no hosted Sprite. No Volume or Machine
create was accepted.

The short-lived Fly organization token was revoked at 23:59:50Z. Its derived
read-only token then failed authentication with HTTP 401. All eleven local Fly
and Sprites credential artifacts were removed after absence proof; the retained
private directories contain only authorization manifests, clean journals,
tool binaries, Docker configuration, and content-free image metadata.

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
7. The command runner verified and then invoked the resolved OrbStack multicall
   executable as `docker-tools`. OrbStack requires the original `docker` argv0
   and exited 127 before Buildx started. The runner now keeps the verified real
   path while preserving the authorized invocation name, with a re-exec
   regression test.
8. Current Buildx replaces its pre-created metadata file with mode 0644 and
   emits `containerimage.digest` without the older optional descriptor object.
   The publisher now verifies a regular file, immediately re-secures it to
   0600 inside the mode-0700 run directory, accepts the current digest field,
   and still rejects a conflicting descriptor. The yyz-6 image was published
   and attested as
   `sha256:1b28163fca224e4fe883a75eaa715fcd2b0de49d21dbee4979c1e64a05504c36`.
9. Fly rejected the App-style Volume name with HTTP 400 before creating a
   Volume. The previous deterministic name contained hyphens and was 44
   characters. Provisioning and cleanup now share one compact provider-safe
   identity, `setta_data_<16-hex>`, derived from the authorized resource prefix;
   the API binding rejects App-style names. This repair is fully covered
   offline but has not received a fresh live validation.

## Verification after follow-up repairs

`./check_quality.sh --all` passed in one final run after the Volume identity
repair: all 47 Go packages, 105 desktop test files with 828 tests, the
production build, and all 19 required Electron workflows passed. Focused
reruns also confirmed three unrelated Electron timing/startup flakes before
that clean final run.

`./scripts/check_supply_chain.sh` passed Go vulnerability and dependency-age
checks, exact direct-version checks, lockfile sync, and package-age checks. Its
pnpm audit failed on a newly reported high-severity `brace-expansion` advisory
through the ESLint/minimatch development-tool path (plus two low findings). No
dependency files were changed as part of the hosted runner repair.

## Next safe step

Obtain a fresh time-limited owner authorization and new short-lived credentials,
then run one clean journal with the repaired compact Volume identity. Registry
publication and signed Sprite runtime preparation are now live-proven; the next
unproven boundary is Fly Volume creation, followed by secrets/IP/Machine,
bootstrap, and the hosted HTTP/SSE/lifecycle workload. Do not reuse these
manifests or deleted credential files.
