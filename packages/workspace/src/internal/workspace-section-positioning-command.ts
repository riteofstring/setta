import { isEnumerableDataProperty, optionOverridesAt } from "./runtime-option-validation.js";
import type {
  WorkspaceChildLayout,
  WorkspaceChildLayoutPositioningChange,
  WorkspacePoint,
  WorkspaceSection,
  WorkspaceSectionSize,
} from "./workspace-document-contract.js";
import type { WorkspaceActionRejectionReason } from "./workspace-surface-contract.js";

export type WorkspaceSectionPositioningTransition<TSectionData> =
  | Readonly<{ section: WorkspaceSection<TSectionData>; status: "applied" }>
  | Readonly<{ status: "unchanged" }>
  | Readonly<{ reason: WorkspaceActionRejectionReason; status: "rejected" }>;

const changeKeys = ["orientation", "positioning", "positions"] as const;
const pointKeys = ["x", "y"] as const;

function exactChangeFields(change: Record<string, unknown>, expected: readonly string[]): void {
  const missing = expected.find((key) => !Object.hasOwn(change, key));
  if (missing) {
    throw new TypeError(`Workspace child positioning change must provide ${missing}.`);
  }
  const unexpected = Object.keys(change).find((key) => !expected.includes(key));
  if (unexpected) {
    throw new TypeError(`Unknown workspace child positioning change field ${unexpected}.`);
  }
}

function nonNegativeCoordinate(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${label} must be a finite non-negative number.`);
  }
  return value;
}

function pointAt(value: unknown, sectionId: string): WorkspacePoint {
  const label = `Workspace freeform position for ${JSON.stringify(sectionId)}`;
  const point = optionOverridesAt(value, pointKeys, label, "workspace freeform position field");
  exactChangeFields(point, pointKeys);
  return Object.freeze({
    x: nonNegativeCoordinate(point.x, `${label} x`),
    y: nonNegativeCoordinate(point.y, `${label} y`),
  });
}

function positionsAt(value: unknown): Readonly<Record<string, WorkspacePoint>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Workspace freeform positions must be a plain object.");
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Workspace freeform positions must be a plain object.");
  }
  const positions = value as Record<string, unknown>;
  const entries = Reflect.ownKeys(positions).map((key) => {
    if (
      typeof key !== "string" ||
      key.trim().length === 0 ||
      !isEnumerableDataProperty(positions, key)
    ) {
      throw new TypeError(`Invalid workspace freeform position field ${String(key)}.`);
    }
    return [key, pointAt(positions[key], key)] as const;
  });
  return Object.freeze(Object.fromEntries(entries));
}

export function resolveWorkspaceChildLayoutPositioningChange(
  value: WorkspaceChildLayoutPositioningChange,
): WorkspaceChildLayoutPositioningChange {
  const change = optionOverridesAt(
    value,
    changeKeys,
    "Workspace child positioning change",
    "workspace child positioning change field",
  );
  if (change.positioning === "ordered") {
    exactChangeFields(change, ["orientation", "positioning"]);
    if (change.orientation !== "horizontal" && change.orientation !== "vertical") {
      throw new TypeError("Workspace ordered child positioning must provide an orientation.");
    }
    return Object.freeze({ orientation: change.orientation, positioning: "ordered" });
  }
  if (change.positioning !== "freeform") {
    throw new TypeError("Workspace child positioning must be ordered or freeform.");
  }
  exactChangeFields(change, ["positioning", "positions"]);
  return Object.freeze({ positioning: "freeform", positions: positionsAt(change.positions) });
}

function positionsMatchChildren(
  positions: Readonly<Record<string, WorkspacePoint>>,
  sectionIds: readonly string[],
): boolean {
  const positionIds = Object.keys(positions);
  const sectionIdSet = new Set(sectionIds);
  return (
    positionIds.length === sectionIds.length &&
    positionIds.every((sectionId) => sectionIdSet.has(sectionId))
  );
}

function positiveMeasuredDimension(value: unknown, axis: "height" | "width"): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`Workspace measured ${axis} must be a positive finite number.`);
  }
  return value;
}

export function workspaceSectionPositioningRequiresMeasurement<TSectionData>(
  section: WorkspaceSection<TSectionData>,
  change: WorkspaceChildLayoutPositioningChange,
): boolean {
  return (
    section.childLayout?.overflow === "scroll" &&
    change.positioning === "freeform" &&
    (section.size.height.mode === "content" || section.size.width.mode === "content")
  );
}

function transitionedSize<TSectionData>(
  section: WorkspaceSection<TSectionData>,
  change: WorkspaceChildLayoutPositioningChange,
  measuredSize: Readonly<{ height: number; width: number }> | null,
): WorkspaceSectionSize {
  if (!workspaceSectionPositioningRequiresMeasurement(section, change)) {
    return section.size;
  }
  return {
    height:
      section.size.height.mode === "fixed"
        ? section.size.height
        : {
            mode: "fixed",
            value: positiveMeasuredDimension(measuredSize?.height, "height"),
          },
    width:
      section.size.width.mode === "fixed"
        ? section.size.width
        : {
            mode: "fixed",
            value: positiveMeasuredDimension(measuredSize?.width, "width"),
          },
  };
}

function requireCompleteFreeformPositions(
  change: WorkspaceChildLayoutPositioningChange,
  sectionIds: readonly string[],
): void {
  if (change.positioning === "freeform" && !positionsMatchChildren(change.positions, sectionIds)) {
    throw new TypeError(
      "Workspace freeform positions must match the direct child sections exactly.",
    );
  }
}

function positioningRejection<TSectionData>(
  section: WorkspaceSection<TSectionData>,
  change: WorkspaceChildLayoutPositioningChange,
  measuredSize: Readonly<{ height: number; width: number }> | null,
): WorkspaceActionRejectionReason | null {
  if (section.positionAndSizeLocked) {
    return "section-locked";
  }
  if (section.isMinimized) {
    return "section-minimized";
  }
  return workspaceSectionPositioningRequiresMeasurement(section, change) && !measuredSize
    ? "section-geometry-unavailable"
    : null;
}

function transitionedChildLayout(
  childLayout: WorkspaceChildLayout,
  change: WorkspaceChildLayoutPositioningChange,
): WorkspaceChildLayout {
  return change.positioning === "ordered"
    ? {
        orientation: change.orientation,
        overflow: childLayout.overflow,
        positioning: "ordered",
        sectionIds: childLayout.sectionIds,
      }
    : {
        overflow: childLayout.overflow,
        positioning: "freeform",
        positions: change.positions,
        sectionIds: childLayout.sectionIds,
      };
}

export function planWorkspaceSectionPositioningTransition<TSectionData>(
  section: WorkspaceSection<TSectionData>,
  changeValue: WorkspaceChildLayoutPositioningChange,
  measuredSize: Readonly<{ height: number; width: number }> | null,
): WorkspaceSectionPositioningTransition<TSectionData> {
  const childLayout = section.childLayout;
  if (!childLayout) {
    return { reason: "section-not-container", status: "rejected" };
  }
  const change = resolveWorkspaceChildLayoutPositioningChange(changeValue);
  requireCompleteFreeformPositions(change, childLayout.sectionIds);
  if (change.positioning === childLayout.positioning) {
    return { status: "unchanged" };
  }
  const rejection = positioningRejection(section, change, measuredSize);
  if (rejection) {
    return { reason: rejection, status: "rejected" };
  }
  return {
    section: {
      ...section,
      childLayout: transitionedChildLayout(childLayout, change),
      size: transitionedSize(section, change, measuredSize),
    },
    status: "applied",
  };
}
