# Setta packaged runtime design rationale

This document owns current non-local rationale for the `setta-runtime` module. Public installation
and command behavior remains in the repository README and application READMEs.

## Application registry

The packaged runtime is a closed multi-application host. Each application adapter owns its command
grammar, project target resolution, native-server arguments, and identity checks. `AppRegistry`
owns exact application IDs and aliases and dispatches without product-specific branches. Generic
command context contains only services every registered application can use; application-specific
tools remain on their owning adapter.

The Python Canvas and Realtime applications have distinct IDs, project identities, native servers,
web roots, and live-session records. A session key includes the application ID, so identical local
project paths cannot collide across applications. Compatibility aliases exist only when explicitly
retained by a product contract; Realtime introduces none.

## Closed packaged manifest

The wheel manifest enumerates every packaged application with its executable and web root. Build
and staging code consumes a sorted descriptor collection and emits the complete manifest once;
there is no default or specially named application slot. Every descriptor is validated before any
wheel is produced, and smoke inspection reconciles the installed manifest, executable files, web
roots, registry listing, and doctor output.

Application bootstraps and other non-web runtime assets must be embedded in the native executable
or explicitly named by the application descriptor and copied into the wheel. A source-checkout
path is never a packaged runtime dependency.

## Live server supervision

`NativeServerSupervisor` owns one local native process per live-session record. The server emits
exactly one bounded readiness document on stdout; later stdout is drained or prohibited so a pipe
cannot block the server. Readiness identity must match the adapter's canonical project target,
application ID, nonce, process ID, and loopback origin before the session is published.

The supervisor's containment boundary owns the native server and descendants until bounded,
idempotent shutdown completes. Errors and lifecycle state are application-neutral. The server owns
its private worker descendants; closing the outer supervisor must still clean the complete tree.

After publishing a verified Realtime session, its adapter requests one runtime load before it
reports the public URL or opens the browser. Opening an interactive application therefore presents
an initialized worker, while later source edits remain explicit reload operations.

## Build and verification direction

Workspace builds before application frontends. Every frontend and native server builds before
staging, and the wheel backend packages only those verified roots. CI trigger and build matrices
cover every registered app. Runtime boundary checks reject undeclared files, missing app assets,
and source-checkout fallbacks.

The repository-local Realtime runner fingerprints the platform, pinned toolchain, package locks,
Workspace and Realtime build inputs, and packaged runtime sources. An installed Realtime runtime
is reused only when its executable and packaged assets remain valid and an atomically written
record matches that fingerprint. The first launch or any mismatch builds a fresh wheel into a
temporary directory and reinstalls the same-version `setta` package into a repository-owned
environment with the package cache disabled. A successful install publishes the new record before
the application opens. This prevents an older unpacked `uv tool run` environment from becoming an
implicit cache while avoiding dependency installation, compilation, wheel creation, and reinstall
when no relevant input changed.

On a Realtime cache miss after the first complete build, the runner rebuilds Realtime and its
Workspace dependency while reusing the installed Python Canvas native and web assets. The resulting
wheel remains complete without rebuilding an unrelated app. Playground project content is not a
build input, so ordinary drawing and callback edits do not invalidate the packaged application.
Installed releases continue to use the ordinary `setta` entry point.

The Realtime playground runner treats the checked-in example as an immutable seed. It creates one
complete working project beneath the repository's ignored `tmp/` tree when absent, validates the
required files as regular non-symlinks, and launches the packaged runtime against that working root.
It never opens the fixture directly. An existing working project is preserved so drawing and live
source edits survive another local launch without becoming repository changes.
Before launch, the runner synchronizes the working project's frozen Python lock into an ignored
project-local environment, excludes the virtual project itself, and rejects source distributions.
This makes declared callback libraries available without treating dependency resolution or build
hooks as part of application startup. A preserved older working copy keeps its own authored source,
layout, and lock until the caller explicitly resets it from the immutable fixture.
Playground wheel builds validate checked-in generated Realtime contracts in check-only mode, and
all Go compilation uses read-only module resolution, so setup cannot rewrite governed source or
module locks.
