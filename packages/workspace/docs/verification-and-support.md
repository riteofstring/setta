# Verification, performance, and support policy

The current package is private and locally installable. Registry publication, repository hosting,
public licensing, release automation, semantic-version compatibility, and a public support promise
remain separate decisions. This guide records what the current milestone verifies without implying
those later decisions have been made.

## Local verification

Use the exact Node, Corepack, and pnpm versions declared by the repository. From a clean checkout:

```text
corepack pnpm install --frozen-lockfile
corepack pnpm quality
corepack pnpm test:e2e --project=chromium
corepack pnpm consumer:check
corepack pnpm supply-chain:check
```

`quality` selects changed files by default but also runs the deterministic repository boundary,
dependency policy, formatting, lint, file-length, strict type, dead-code, unit, automation, build,
pack-allowlist, and declaration-report gates needed before a source commit. Use `quality:all` only
for a planned full deterministic audit, not routine debugging.

The browser command starts the backend-free playground directly through Node/Vite. Narrow work to
the directly affected spec and selector until stable. The packed-consumer command creates a
temporary tarball, installs it into the unrelated fixture using declared dependencies and exports,
and builds without source aliases. No command publishes the package or mutates another worktree.

`@setta/workspace/testing` exposes package-owned deterministic helpers for consumer tests and
adapter evidence. It is not an internal-source escape and application runtime code should not
depend on it merely to reach upstream XYFlow or dnd-kit contracts.

## Browser policy

The milestone browser gate is the exact-pinned Playwright Chromium project. It covers real pointer,
trusted keyboard, long-press touch, focus, live announcements, automated accessibility, 200% page
scale, 320-CSS-pixel reflow, coarse-pointer emulation where supported, reduced motion, RTL, and
reviewed screenshot baselines through the backend-free playground.

The implementation depends on modern browser APIs and CSS including Pointer Events, ResizeObserver,
DataTransfer, `<dialog>`, `matchMedia`, CSS custom properties, OKLCH, and `color-mix()`. The host must
provide a sized workbench container and may need its normal application transpilation policy around
the package's ESM output.

Firefox, WebKit/Safari, embedded webviews, and older browsers are not current verified support
targets. Test and record them before making a product claim. A failure in an unavailable external
browser or GUI environment is a release-evidence gap, not permission to add a compatibility shim or
browser-specific fallback without a separately reviewed requirement.

## Performance integration guidance

The package separates transient gestures and measurements from canonical React document changes,
reuses unchanged root projection and renderer-data identities, maintains one incremental all-depth
geometry index, and keeps minimap and toolbar subscriptions narrow. Consumers preserve those gains
by following the same ownership shape:

- Keep `sectionDefinitions`, color palettes, toolbar descriptors, overlay renderers, and policy
  callbacks referentially stable when their behavior has not changed.
- Update only the affected section record and payload. Do not deep-clone the complete document or
  every host data object for one field edit.
- Keep item-tree arrays stable outside the parents changed by an accepted `ItemMovePlan`; the public
  application helper already does this.
- Do not persist or call analytics from pointer-move, measurement, collision, `canMove`, or
  `validateSectionMove` preview paths. Persist the single accepted change boundary.
- Avoid broad context subscriptions inside every renderer. Subscribe host bodies to the smallest
  application state slice and memoize expensive bodies independently of package chrome.
- Prefer `grow` only when content should participate in measurement. Use bounded `scroll`
  containers for intentionally large child regions and keep nested wheel ownership explicit.
- Avoid DOM measurement in host render. Use package geometry-backed controller actions for
  selection focus and fit, and `ResizeObserver` only for host-owned geometry the package cannot
  observe.
- Profile representative payloads, inputs, nested depth, item counts, appearance switching, and
  minimize/unmount behavior in the consuming application. Lightweight fixture timing is not a
  substitute for host render counts.

Repository baselines cover 2,000 registered frames, repeated all-depth marquee and combined-bounds
queries, incremental geometry updates, 96-step structural and root movement, and a 96-event viewport
burst. `corepack pnpm perf:milestone` additionally profiles the built public artifact with a
1,024-section recursive document, 512-section sibling lists, a 64-section selected block, 256
collision candidates, 80 smart-placement rectangles, a 2,000-item sibling list, and a 2,048-level
item tree. The append-only Phase 5 report records the environment, totals, checksums, browser
evidence, findings, and limits.

These baselines guard subscription, traversal, planning, identity, and render architecture. They do
not set a cross-machine frame-time budget. Add an elapsed-time gate only after repeated measurements
on a declared runner and a stable representative host payload justify one.

Viewport culling is not part of the initial milestone. Very large host DOMs still require measured
product limits and possibly the deferred culling capability; do not hide whole-tree rerenders behind
an arbitrary timing threshold.

## Package and supply-chain policy

The root and package manifests remain private. Direct external dependencies and peer dependencies
are exact-pinned, the lockfile is loaded with `trustLockfile: false`, external releases are
quarantined for seven days, missing publication times fail strictly, trust downgrades and exotic
transitive sources are blocked, and dependency lifecycle builds are denied unless narrowly
allowlisted.

`corepack pnpm supply-chain:check` performs the deterministic dependency-policy check, a frozen
install with registry-backed loaded-lockfile verification, a high/critical vulnerability audit,
dependency-license allowlist enforcement, and machine-readable license and lockfile inventories.
Lower-severity advisories remain visible for triage. The deterministic `quality` path does not use a
network outage as a code-quality result.

Any release-age, trust, immutable-source, build-script, patch, or vulnerability exception must name
one exact package/version or advisory/source, a rationale, an owner, and an expiry. Patch records
also need a removal condition. Broad package-family, severity, pattern, permanent, or movable-source
exceptions are not allowed.

The packed artifact has an exact file allowlist covering declarations, ESM, source maps, required
CSS, README, these guides, and third-party notices. Application source, tests, secrets, local
configuration, and undeclared entry points must not appear.

## Attribution

`THIRD_PARTY_NOTICES.md` travels in the packed artifact. It records the MIT notice for the
historical dnd-kit-derived collision and sorting kernels and identifies their source snapshot.
Exact-pinned runtime dependencies retain their own license material. The repository license audit
checks all loaded dependencies against the reviewed SPDX allowlist and writes a reviewable report.

Do not remove or narrow attribution merely because the package is private. A future public license
or contribution model is outside this milestone and requires an explicit decision separate from
third-party compliance.

## Deferred capabilities

No current export detaches a section into another browser window. The planned same-origin design
would require an opt-in section definition, a user gesture, a measured canvas placeholder,
preserved React context and document identity, explicit host window-head contributions, predictable
redocking, and clear popup/opener failure states. Cross-window dragging is not implied.

No current export copies or pastes section subtrees. The planned boundary gives the package
selection shortcuts, structural validation, relative placement, and clipboard MIME framing while
the host allocates IDs and clones payloads/domain references. Clipboard input remains untrusted and
must be fully validated before a renderer mounts. A JSON-only adapter may support the playground;
arbitrary payloads are not assumed cloneable.

Also deferred are an optional outline navigator, top-level auto-layout, multiple or cross-list item
trees, filtered-list reconciliation, mixed-parent batch dragging, saved viewport presets, generic
edges and ports, pane registration beyond current extensions, viewport culling, absolute nested
positioning, and complete descendant-subtree collapse.

## Explicit non-goals

The package does not provide a backend, HTTP or WebSocket transport, persistence location,
authentication, file upload/import mapping, CLI, deployment, sharing, public transaction protocol,
AI/agent behavior, MCP, Python execution, generated API client, Setta plugin system, Setta project
compatibility, migration, legacy alias, compatibility shim, transitional adapter, or old/new dual
path. Hosts may layer permanent domain behavior on declared public exports; they may not import
source files or application state to recreate those excluded contracts.
