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

The repository-local runner always builds a fresh wheel into a temporary directory and reinstalls
the same-version `setta` package into a repository-owned environment with the package cache
disabled. This keeps release versions deterministic while ensuring a local playground launch
cannot reuse an older unpacked `uv tool run` environment. After the first complete build, a
Realtime launch rebuilds Realtime and its Workspace dependency while reusing the installed Python
Canvas native and web assets. The resulting wheel remains complete without rebuilding an unrelated
app on every Realtime playground launch. Installed releases continue to use the ordinary `setta`
entry point.
