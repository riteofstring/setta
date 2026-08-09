import type { SectionOrientation, WorkspaceSection } from "./workspace-document-contract.js";
import type { WorkspaceActionRejectionReason } from "./workspace-surface-contract.js";

export type WorkspaceSectionOrientationTransition<TSectionData> =
  | Readonly<{ section: WorkspaceSection<TSectionData>; status: "applied" }>
  | Readonly<{ status: "unchanged" }>
  | Readonly<{ reason: WorkspaceActionRejectionReason; status: "rejected" }>;

export function resolveWorkspaceSectionOrientation(value: unknown): SectionOrientation {
  if (value !== "horizontal" && value !== "vertical") {
    throw new TypeError("Workspace section orientation must be horizontal or vertical.");
  }
  return value;
}

function positiveMeasuredDimension(value: unknown, axis: "height" | "width"): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`Workspace measured ${axis} must be a positive finite number.`);
  }
  return value;
}

export function workspaceSectionOrientationRequiresMeasurement<TSectionData>(
  section: WorkspaceSection<TSectionData>,
  orientation: SectionOrientation,
): boolean {
  if (!section.childLayout || section.childLayout.positioning !== "ordered") {
    return false;
  }
  if (section.childLayout.orientation === orientation) {
    return false;
  }
  if (section.childLayout.overflow !== "scroll") {
    return false;
  }
  const constrainedAxis = orientation === "vertical" ? "height" : "width";
  return section.size[constrainedAxis].mode === "content";
}

function orientationRejection<TSectionData>(
  section: WorkspaceSection<TSectionData>,
  orientation: SectionOrientation,
  measuredSize: Readonly<{ height: number; width: number }> | null,
): WorkspaceActionRejectionReason | null {
  if (!workspaceSectionOrientationRequiresMeasurement(section, orientation)) {
    return null;
  }
  if (section.positionAndSizeLocked) {
    return "section-locked";
  }
  if (section.isMinimized) {
    return "section-minimized";
  }
  return measuredSize ? null : "section-geometry-unavailable";
}

function transitionedSectionSize<TSectionData>(
  section: WorkspaceSection<TSectionData>,
  orientation: SectionOrientation,
  measuredSize: Readonly<{ height: number; width: number }> | null,
) {
  if (!workspaceSectionOrientationRequiresMeasurement(section, orientation)) {
    return section.size;
  }
  const constrainedAxis = orientation === "vertical" ? "height" : "width";
  return {
    ...section.size,
    [constrainedAxis]: {
      mode: "fixed" as const,
      value: positiveMeasuredDimension(measuredSize?.[constrainedAxis], constrainedAxis),
    },
  };
}

export function planWorkspaceSectionOrientationTransition<TSectionData>(
  section: WorkspaceSection<TSectionData>,
  orientationValue: unknown,
  measuredSize: Readonly<{ height: number; width: number }> | null,
): WorkspaceSectionOrientationTransition<TSectionData> {
  const childLayout = section.childLayout;
  if (!childLayout) {
    return { reason: "section-not-container", status: "rejected" };
  }
  if (childLayout.positioning !== "ordered") {
    return { reason: "section-layout-not-ordered", status: "rejected" };
  }
  const orientation = resolveWorkspaceSectionOrientation(orientationValue);
  if (orientation === childLayout.orientation) {
    return { status: "unchanged" };
  }
  const rejection = orientationRejection(section, orientation, measuredSize);
  if (rejection) {
    return { reason: rejection, status: "rejected" };
  }
  return {
    section: {
      ...section,
      childLayout: { ...childLayout, orientation },
      size: transitionedSectionSize(section, orientation, measuredSize),
    },
    status: "applied",
  };
}
