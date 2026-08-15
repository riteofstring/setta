import { isGroupSection } from "./documentSelectors";
import type { WorkspaceSection } from "./types";

function isPositiveFiniteSize(value: WorkspaceSection["size"]["width"]): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

// One document-layer validator owns the serialized group overflow invariant. Bounded groups need
// two concrete dimensions so loading the same document reproduces the same viewport and minimap
// bounds; intrinsic groups may retain either authored numeric values or auto dimensions.
export function assertValidSectionOverflowMode(sectionId: string, section: WorkspaceSection): void {
  if (typeof section.overflowMode !== "boolean") {
    throw new Error(`Section ${sectionId} overflow mode must be a boolean.`);
  }
  if (!isGroupSection(section)) {
    if (section.overflowMode) {
      throw new Error(`Section ${sectionId} is not a group and cannot enable overflow mode.`);
    }
    return;
  }
  if (
    section.overflowMode &&
    (!isPositiveFiniteSize(section.size.width) || !isPositiveFiniteSize(section.size.height))
  ) {
    throw new Error(`Bounded group ${sectionId} requires positive numeric width and height.`);
  }
}
