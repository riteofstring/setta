import type {
  SectionOverflow,
  WorkspaceChildLayout,
  WorkspaceSection,
  WorkspaceSectionSize,
} from "./workspace-document-contract.js";
import type { WorkspaceActionRejectionReason } from "./workspace-surface-contract.js";

export type WorkspaceSectionOverflowTransition<TSectionData> =
  | Readonly<{ section: WorkspaceSection<TSectionData>; status: "applied" }>
  | Readonly<{ status: "unchanged" }>
  | Readonly<{ reason: WorkspaceActionRejectionReason; status: "rejected" }>;

function resolveWorkspaceSectionOverflow(value: unknown): SectionOverflow {
  if (value !== "grow" && value !== "scroll") {
    throw new TypeError("Workspace section overflow must be grow or scroll.");
  }
  return value;
}

function positiveMeasuredDimension(value: unknown, axis: "height" | "width"): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`Workspace measured ${axis} must be a positive finite number.`);
  }
  return value;
}

type WorkspaceContentSizing = Readonly<{ height: boolean; width: boolean }>;
type WorkspaceSectionAxis = "height" | "width";

function overflowDimension<TSectionData>(
  section: WorkspaceSection<TSectionData>,
  axis: WorkspaceSectionAxis,
  overflow: SectionOverflow,
  measuredSize: Readonly<{ height: number; width: number }> | null,
  growWithContentSizing: WorkspaceContentSizing,
): WorkspaceSectionSize["height"] {
  const currentDimension = section.size[axis];
  if (overflow === "grow") {
    return growWithContentSizing[axis]
      ? { ...currentDimension, mode: "content" }
      : currentDimension;
  }
  return {
    mode: "fixed",
    value: measuredSize
      ? positiveMeasuredDimension(measuredSize[axis], axis)
      : currentDimension.value,
  };
}

function overflowAxes(layout: WorkspaceChildLayout): readonly WorkspaceSectionAxis[] {
  if (layout.positioning === "freeform") {
    return ["height", "width"];
  }
  return [layout.orientation === "vertical" ? "height" : "width"];
}

export function planWorkspaceSectionOverflowTransition<TSectionData>(
  section: WorkspaceSection<TSectionData>,
  overflowValue: unknown,
  measuredSize: Readonly<{ height: number; width: number }> | null,
  growWithContentSizing: WorkspaceContentSizing,
): WorkspaceSectionOverflowTransition<TSectionData> {
  const childLayout = section.childLayout;
  if (!childLayout) {
    return { reason: "section-not-container", status: "rejected" };
  }
  const overflow = resolveWorkspaceSectionOverflow(overflowValue);
  if (overflow === childLayout.overflow) {
    return { status: "unchanged" };
  }
  if (section.positionAndSizeLocked) {
    return { reason: "section-locked", status: "rejected" };
  }
  if (section.isMinimized) {
    return { reason: "section-minimized", status: "rejected" };
  }
  const axes = overflowAxes(childLayout);
  if (
    overflow === "scroll" &&
    axes.some((axis) => section.size[axis].mode === "content") &&
    !measuredSize
  ) {
    return { reason: "section-geometry-unavailable", status: "rejected" };
  }
  const size = axes.reduce<WorkspaceSectionSize>(
    (nextSize, axis) => ({
      ...nextSize,
      [axis]: overflowDimension(section, axis, overflow, measuredSize, growWithContentSizing),
    }),
    section.size,
  );
  return {
    section: {
      ...section,
      childLayout: { ...childLayout, overflow },
      size,
    },
    status: "applied",
  };
}
