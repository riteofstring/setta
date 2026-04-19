# Settings All Settings section-container resizable local prop-fanout evidence

Date: 2026-04-20
Worktree: `go-rewrite-pixijs`
Canonical target section: `settings-section__browserSectionDefault`

## Question

After runs `044` through `047`, does `SectionContainerCoreResizabe` still have a credible immediate local prop-fanout hotspot worth another product refactor, or has that lane reached diminishing returns?

## Evidence

- Code inspection of [frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx](/home/ubuntu/dev/setta.go-rewrite-pixijs/frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx:260) shows the remaining inputs now split cleanly:
  - `isYouTube`, `useMetaControlStyle`, `hasEmbeddedTerminal`, and the meta-control frame/layout class names are consumed only by the memoized `SectionContainerResizableSurface` wrapper.
  - `isMinimized` and the externalized-window lookup are consumed only by the memoized `CanvasSectionBody`.
  - header and motion-hidden chrome props are already isolated behind the memoized `SectionContainerChrome`.
- The only obvious immediate cross-path left in this file is `positionAndSizeLocked`, which affects the meta-control drag-handle visibility and can still cause the header path to rerender through the shared chrome component. That transition is not part of the measured dense pan/zoom hotspot and is not a credible next whole-scene performance slice by itself.
- The focused regression in [frontend/src/components/Section/Container/SectionContainerCoreResizabe.test.tsx](/home/ubuntu/dev/setta.go-rewrite-pixijs/frontend/src/components/Section/Container/SectionContainerCoreResizabe.test.tsx:884) proves one remaining surface-only snapshot change stays local:
  - flipping `hasEmbeddedTerminal` forces `SectionContainerCoreResizable` and `CustomResizable` to rerender so the resizable shell can update `allowPointerEventsDuringDnd`
  - the section header and code body stay cold, which means the current memo boundaries already stop that local prop from fanning out into chrome/body work

## Conclusion

The immediate `SectionContainerCoreResizabe` prop-fanout lane is effectively exhausted for the current hotspot. Another memo-only or prop-plumbing pass inside this file would likely be churn unless fresh trace evidence shows a different high-frequency prop than the already-removed viewport/active-section motion paths.

## Recommended next step

Stop the current automation lane for human replan instead of reopening `SectionContainerCoreResizabe`, `SectionShellBackdropCanvas`, or `ZoomPane` by inertia. The next product frontier needs a fresh attribution decision outside this now-closed local prop-fanout path.
