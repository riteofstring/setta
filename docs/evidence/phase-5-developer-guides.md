# Phase 5 developer-guide review

## Scope

This review covers the second Phase 5 hardening batch on 2026-08-09. It follows the public API and
onboarding review by turning the remaining developer-documentation bullets into focused guides that
ship inside the locally packed package.

The review used the public entry files, generated declaration closure, runtime option contracts,
controller surface, section registry, document and item-tree validators, keyboard planners,
package-owned controls, exact package manifest, and tarball allowlist. It did not treat internal
XYFlow or dnd-kit types as consumer documentation.

## Packaged guide set

| Guide                                | Phase 5 coverage                                                                                                                                                                                                                                                                    |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/integration.md`                | Versioned document and payload validation, controlled/uncontrolled ownership, persistence example, capabilities/read-only, registry and smart creation, toolbar/overlay extensions, public controller results, selection, grouping, stacking, history, minimap, and external drops. |
| `docs/recursive-sections.md`         | Canonical recursive containment, sort/free interaction ownership, selection blocks, host move policy, grouping, orientation, locking, minimizing, fixed/content sizing, grow/scroll overflow, grid/snapping, chrome, accents, and tags.                                             |
| `docs/sortable-item-trees.md`        | Generic tree invariants, controlled rendering, containment/host policy, selection normalization, mixed-parent fallback, atomic move planning/application, pointer/touch/keyboard geometry, zoom, and payload persistence.                                                           |
| `docs/theming.md`                    | Required package CSS, scoped light/dark/system appearance, every public semantic token and CSS variable, grid styling, chrome variants, accents/tags, contrast ownership, and reduced motion.                                                                                       |
| `docs/accessibility-and-keyboard.md` | Global, section, resize, sortable-item, menu, editor, toolbar, and history keyboard tables; focus and announcement behavior; host responsibilities; 200% zoom, 320-pixel reflow, coarse pointers, RTL, and reduced motion.                                                          |
| `docs/verification-and-support.md`   | Local gates, Chromium browser policy, performance integration guidance, supply-chain and exception policy, exact artifact/attribution boundary, deferred window/clipboard capabilities, and explicit non-goals.                                                                     |

`docs/README.md` provides a task-oriented index and restates the stable ownership boundary. The
package README links every guide before its detailed reference so the locally packed artifact is
navigable without repository-only paths.

## Contract findings

- Guide names match the five declared entry points and the reviewed section/item terminology. No
  compatibility alias, old Setta model, internal store, or upstream event type is documented.
- The document guide keeps canonical placement in `rootSections` and child lists, treats parsed
  payloads as unknown until the host validates them, and keeps persistence outside the library.
- Capability guidance distinguishes package interaction policy from host authorization and
  arbitrary renderer read-only behavior.
- Structural and item movement guidance uses the same immutable, synchronous host policy and
  single accepted-plan boundaries as production code. Shared-parent restrictions, normalized
  roots, cycle rejection, preview/final revalidation, focus restoration, zoom, and RTL behavior are
  explicit.
- Theme guidance documents only public semantic tokens and their scoped CSS variables. Accent and
  tag roles remain separate from focus, selection, invalid, and other semantic states.
- Accessibility guidance records the actual package key ownership rather than promising generic
  drag-and-drop parity. Native controls, discoverable unavailable menu actions, host-local
  shortcuts, minimap alternatives, announcements, reflow, coarse pointers, and reduced motion have
  explicit host expectations.
- Browser support is deliberately evidence-based: Chromium is the current automated milestone
  target, while Firefox, WebKit, webviews, and older browsers require new verification before a
  support claim.

## Artifact boundary

The private manifest now includes `docs` alongside `dist`, README, and third-party notices. The
exact tarball allowlist enumerates all seven guide files. Package verification also resolves every
relative Markdown link against the tarball, rejects links that escape the package, and fails for a
missing target. It still rejects every undeclared artifact file.

## Verification

- Exact Node 24.18.1, repository-local Corepack 0.35.0, and pnpm 11.19.0 formatted and checked all
  changed Markdown, JSON, and package-artifact source.
- The focused dependency-policy check passed all four manifests. The focused pack workflow built
  the package, included all seven guide files, resolved their local links, and matched the exact
  artifact allowlist.
- Changed-file quality passed for 12 project files: repository and import boundaries across 265
  files, all four dependency manifests, formatting and file length, strict package/playground/root
  types, dead-code analysis, 35 unit files with 389 tests, six boundary tests, plan-loop automation,
  package and playground builds, exact packed contents with documentation-link validation, and the
  regenerated declaration report.
- No runtime component or CSS changed, so browser and CDP visual verification do not apply. No
  dependency version or lockfile input changed, so the registry-backed supply-chain and
  vulnerability gate is not duplicated for this documentation batch.

## Remaining Phase 5 work

This batch completes the repository-actionable developer-guide set, not Phase 5. The milestone
performance report, final focused browser/accessibility/performance verification, packed-consumer
milestone workflow, current dependency/source-license and supply-chain audit record, complete
playground gate, and Phase 5 audit remain separately actionable.
