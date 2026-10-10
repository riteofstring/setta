# Setta packaged runtime design rationale

This document owns current non-local rationale for the `setta-runtime` module. Public installation
and command behavior remains in the repository README and application READMEs.

## Application registry

The packaged runtime is a closed multi-application host. Each application adapter owns its command
grammar, project target resolution, native-server arguments, and identity checks. `AppRegistry`
owns exact application IDs and aliases and dispatches without product-specific branches. Generic
command context contains only services every registered application can use; application-specific
tools remain on their owning adapter.

Private adapter support owns only the closed option-token mechanics, packaged-runtime check shape,
native subprocess boundary, regular non-symlink input reads, bounded JSON responses, and exact live
session identity probe used through the same contract by multiple adapters. Each adapter still
declares its accepted flags, commands, byte limits, response error path, environment, application
identity, and schema version. The support module cannot import an application adapter.

Python Canvas, Realtime, Review, and Experiment Lens have distinct IDs, project identities, native
servers, web roots, and live-session records. A session key includes the application ID, so
identical local project paths cannot collide across applications. Compatibility aliases exist only
when explicitly retained by a product contract; the newer applications introduce none.

Experiment Lens uses the project directory containing `experiment.json` as its canonical identity.
Snapshot and mutation commands use the verified live session when one exists, while export remains
a native command so writing a packet to a caller-selected path retains one atomic filesystem owner.
The adapter accepts only the app's closed command grammar, bounds mutation and response bodies,
rejects symlink inputs, and validates the exact server identity before routing to it.

## Closed packaged manifest

The wheel manifest enumerates every packaged application with its executable and web root. Build
and staging code consumes a sorted descriptor collection and emits the complete manifest once;
there is no default or specially named application slot. Every descriptor is validated before any
wheel is produced, and smoke inspection reconciles the installed manifest, executable files, web
roots, registry listing, and doctor output.

Application bootstraps and other non-web runtime assets must be embedded in the native executable
or explicitly named by the application descriptor and copied into the wheel. A source-checkout
path is never a packaged runtime dependency.

`pyproject.toml` is the single checked-in release-version authority. Source-checkout imports read
that value directly; an installed runtime reads the version from its distribution metadata. The
custom wheel backend emits core metadata 2.4 from the same project metadata and preserves project
and third-party license paths beneath the wheel's `.dist-info/licenses` directory.

Frontend notices inventory the complete installed production graph of all four apps, conservatively
including optional and tree-shaken packages. The offline generator reads package metadata and
license files, supplemented by exact, sourced notices where published leaf packages omit their
license. It never downloads or executes dependency code. Generation verification catches missing
notices after a dependency change; wheel tests verify that the resulting notices are shipped.
Separately installed Python distributions retain their own notices. Go's standard-library and
vendored Workspace licenses are included alongside native dependency notices.

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
cover every registered app, including Experiment Lens on every published platform. Installed-wheel
acceptance opens each app from a clean environment; the Lens flow verifies its schema, live
identity and snapshot, selection mutation, packet export, and offline access after shutdown.
Runtime boundary checks reject undeclared files, missing app assets, and source-checkout fallbacks.

Repository-local Linux builds explicitly use `linux_x86_64` or `linux_aarch64`, which makes no
manylinux portability claim. They still validate executable format and architecture. CI release
builds continue to request exact manylinux 2.28 tags and inspect every GLIBC requirement against
that claim. This lets a Linux contributor launch locally without a publication container or a
false compatibility label. Omitted or mismatched Linux tags still fail the packaging boundary.

The repository-local runner records the platform and file paths, sizes, modification times, and
change times for the pinned toolchain, package locks, Workspace, shared local backend, all four
application build inputs, and packaged runtime sources. It compares those ordinary filesystem
values without hashing mutable local state. Additions and deletions invalidate the build as well as
edits. A matching record is reusable only while every packaged app asset and executable remains
valid. A mismatch builds and reinstalls a fresh wheel in the repository-owned environment. Cache
recording failure still launches that successful build and reports that the next launch will
rebuild. Dependency setup is an explicit contributor step, never repeated on an ordinary rebuild.

Playground project content is not a build input, so ordinary experiment, review, drawing, and
callback edits do not invalidate the packaged application. Installed releases continue to use the
ordinary `setta` entry point.

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

The Experiment Lens playground also treats its checked-in battery example as immutable input. Its
launcher validates the complete fixture tree as regular non-symlink content, rejects mutable local
state in the fixture, and copies it atomically into the ignored `tmp/` tree. Later launches preserve
that working project, including Lens selection state, while packaging continues to consume only the
application build outputs.
