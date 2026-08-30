# Standalone workspace section surface

## Outcome

`@setta/workspace` exposes a public `StandaloneWorkspaceSectionSurface` that renders one section and its owned descendant tree outside `WorkspaceCanvas`. A downstream application can use it for a focused route, tab, panel, or secondary window without rebuilding workspace section chrome and nesting behavior.

## Ownership

The workspace package owns:

- section lookup, registered-kind rendering, section header and appearance;
- group and nested-section layout, visibility, focus, and section drag-and-drop;
- host-scoped DOM registration and package interaction boundaries;
- one rendering path shared by standalone surfaces and managed section windows.

The downstream application owns:

- `WorkspaceHost`, document loading, section-kind registration, and product data;
- route or tab resolution from an application identifier to `sectionId`;
- authorization, missing-section/loading/error states, persistence, and synchronization;
- application-specific header actions and navigation between focused and canvas views.

The focused surface is an alternative projection of a section for a host. An application must not mount the same stateful section content twice under one host at the same time.

## Public contract

Add:

```tsx
<StandaloneWorkspaceSectionSurface
  sectionId="research"
  ariaLabel="Research section"
  headerActions={<OpenInCanvasButton />}
/>
```

The component requires an existing `WorkspaceHostProvider`. Its props are:

- `sectionId`: the root section to render;
- `ariaLabel`: optional region label, defaulting from the section name;
- `className`: optional class for downstream layout integration;
- `headerActions`: optional application-owned controls placed in the root header;
- `headerProps`: optional root header DOM props.

The root fills its containing block. A leaf renders its normal content. A group renders its descendants. Any registered section kind allowed to own descendants renders its own body followed by that descendant tree. Saved-view visibility remains authoritative.

## Implementation batches

1. Add a package-internal reusable section surface and the public standalone wrapper. Register the standalone root as a host element and wrap descendant rendering in the package section drag-and-drop boundary.
2. Move managed section windows to the shared renderer, migrate their coverage, and delete the window-only renderer.
3. Export the public component and type, update the public API contract, and add focused surface coverage for leaf, group, nesting-capable, missing, and host-isolation behavior.
4. Add a Playground focused-section mode that consumes the public export and demonstrates a routed downstream-style composition.
5. Document the API, example use case, and ownership boundary in the package README and current workspace design document.

## Verification and completion

The caller requested no test runs. Verify with formatting/static policy checks, the workspace package build, and a live Playground inspection of the focused section in light and dark presentation. Review the emitted geometry and screenshots. Then delete this temporary plan, remove obsolete renderer files and references, and commit the final documentation and cleanup.
