# @setta/workspace

The Setta workspace UI, extracted as a standalone TypeScript/React package. The working name,
public API, and every export are provisional until the Phase 1 parity gate and the Phase 2
boundary work in `docs/plans/setta-workspace-extraction-plan.md` ratify them.

## Peer dependencies

React and React DOM are host-provided peers with the documented compatible range `^19.1.0`:
the frozen product reference runs `react 19.1.1`, and the package uses React 19 ref-as-prop
components, so React 18 and below are not supported. All other runtime dependencies are
exact-pinned under the repository dependency policy.

## Consumption during extraction

Phase 1 consumers (the playground) compile the package source directly through the `exports`
map; Phase 2 ships compiled ESM, declarations, and the compiled scoped stylesheet. The
package is local and unpublished for the duration of the extraction plan.
