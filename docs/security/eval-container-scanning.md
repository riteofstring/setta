# Eval Container Supply-Chain Scanning

Setta's eval containers have two local security gates. Neither requires CI.

`./scripts/check_supply_chain.sh` always runs the static gate. It rejects an
unapproved Dockerfile set, floating base images, remote `COPY`, `ADD`, `RUN`,
parser overrides, unsafe continuations, extra build stages, and containers that
do not end as the fixed non-root user. It also validates the exact Node, pnpm,
Trivy, release-evidence, attestation, and vulnerability-database pins, including
the repo's minimum release-age policy.

`./scripts/check_eval_container_security.sh` is the artifact gate. Run it when
an eval Dockerfile, toolchain image, scanner pin, Codex Linux bundle, or image
input changes and during an authorized merge verification that covers those
inputs. It requires the same Apple Silicon, Docker Desktop, Codex, pnpm, and
committed Phase 0 proof as the live eval harness.

## Local setup

Install the exact scanner image explicitly. The security command never pulls a
scanner or base image:

```sh
./scripts/pull_eval_container_scanner.sh
```

Then run:

```sh
./scripts/check_eval_container_security.sh \
  --codex-linux-bundle /absolute/path/to/codex-package-aarch64-unknown-linux-musl
```

The command requires a clean committed worktree so the report identifies one
exact Setta commit. Local reports are written atomically under
`.recordings/setta-container-security/`.

## What the artifact gate does

1. Trusted host-side clients validate the locally installed Trivy image against
   its exact registry digest, ARM64 image-config digest, and version. They fetch
   the pinned OCI index and official release evidence, then check the expected
   SBOM/provenance attachment digests and exact release-asset SHA-256 digests.
2. A credential-free updater container downloads a fresh vulnerability
   database into a new private cache. It receives no source, image archive,
   Docker socket, home directory, or credentials.
3. Setta builds the exact Phase 0, toolchain, Agent, backend, and verifier images
   through the production eval image paths. Builds remain networkless and never
   pull.
4. Docker's trusted CLI exports each image, plus the scanner itself, to a
   bounded local archive.
5. A fresh non-root Trivy container scans each read-only archive with networking
   disabled. It has a read-only root filesystem, no Linux capabilities, no new
   privileges, bounded memory/PIDs/CPU, a private temporary filesystem, and
   access only to that archive, the temporary database cache, a fixed empty
   ignore policy, and a private output directory.
6. Setta verifies that neither the image archives nor vulnerability database
   changed during the offline scans. It strips matched secret values before
   publishing and writes a CycloneDX SBOM and vulnerability evidence for every
   image. Trivy's raw JSON exists only in the private temporary workspace and
   is deleted during teardown; it is never copied into the report directory.

The gate fails on `HIGH` or `CRITICAL` vulnerability, secret, and image
misconfiguration findings, plus end-of-life operating systems. There is no
silent allowlist or automatic dependency modification.

## Trust limits

Pinning Trivy makes the scanner reproducible; it does not prove that Trivy has
no vulnerability. The restricted execution boundary limits a compromised
scanner's access, and scanning the scanner image records its own inventory, but
self-scanning is not independent proof. The gate checks that the pinned
Sigstore bundle bytes and expected OCI attestations are present and structurally
valid; it does not independently perform a full Sigstore identity/signature and
transparency-log verification. Review that published evidence when changing the
pin. A periodic independent cross-check with another scanner can add diversity,
but must use the same no-socket, archive-only boundary.

The dynamic gate intentionally uses the network in three bounded places: the
trusted Docker CLI reads the pinned registry metadata, a standard-library HTTPS
client downloads the two pinned GitHub release assets, and the isolated updater
container downloads the current vulnerability database. Image builds and every
actual archive scan are offline.

The vulnerability database is time-sensitive. Each report records its update
timestamps and exact database and metadata SHA-256 digests. A pinned image can
become vulnerable later, so rerun this gate periodically even when Docker inputs
have not changed.
