import type { RefObject } from "react";

import type {
  SectionOrientation,
  SectionOverflow,
  WorkspaceActionResult,
  WorkspaceSection,
} from "../core.js";
import { WorkspaceSectionOrientationControl } from "./workspace-section-orientation.js";
import { WorkspaceSectionOverflowControl } from "./workspace-section-overflow.js";
import { WorkspaceSectionPositioningControl } from "./workspace-section-positioning.js";

function focusControlWithoutScroll(ref: RefObject<HTMLButtonElement | null>): void {
  const control = ref.current;
  if (!control) {
    return;
  }
  const view = control.ownerDocument.defaultView;
  if (view) {
    view.requestAnimationFrame(() => ref.current?.focus({ preventScroll: true }));
  } else {
    control.focus({ preventScroll: true });
  }
}

export function WorkspaceSectionLayoutControls({
  layoutEditable,
  onOrientationCommit,
  onOverflowCommit,
  onPositioningRequest,
  orientationControlRef,
  overflowControlRef,
  section,
}: Readonly<{
  layoutEditable: boolean;
  onOrientationCommit(sectionId: string, orientation: SectionOrientation): WorkspaceActionResult;
  onOverflowCommit(sectionId: string, overflow: SectionOverflow): WorkspaceActionResult;
  onPositioningRequest(sectionId: string, trigger: HTMLButtonElement): void;
  orientationControlRef: RefObject<HTMLButtonElement | null>;
  overflowControlRef: RefObject<HTMLButtonElement | null>;
  section: WorkspaceSection<unknown>;
}>) {
  return (
    <>
      <WorkspaceSectionPositioningControl
        layoutEditable={layoutEditable}
        onRequest={onPositioningRequest}
        section={section}
      />
      <WorkspaceSectionOrientationControl
        controlRef={orientationControlRef}
        layoutEditable={layoutEditable}
        onCommit={(sectionId, orientation) => {
          const result = onOrientationCommit(sectionId, orientation);
          focusControlWithoutScroll(orientationControlRef);
          return result;
        }}
        section={section}
      />
      <WorkspaceSectionOverflowControl
        controlRef={overflowControlRef}
        layoutEditable={layoutEditable}
        onCommit={(sectionId, overflow) => {
          const result = onOverflowCommit(sectionId, overflow);
          focusControlWithoutScroll(overflowControlRef);
          return result;
        }}
        section={section}
      />
    </>
  );
}
