import { isGroupSection } from "./documentSelectors";
import type { WorkspaceSection } from "./types";

function isValidOverflowSize(
  value: WorkspaceSection["size"]["width"],
): boolean {
  return (
    value === "auto" ||
    (typeof value === "number" && Number.isFinite(value) && value > 0)
  );
}

export function assertValidSectionOverflowMode(
  sectionId: string,
  section: WorkspaceSection,
): void {
  if (typeof section.overflowMode !== "boolean") {
    throw new Error(`Section ${sectionId} overflow mode must be a boolean.`);
  }
  if (!isGroupSection(section)) {
    if (section.overflowMode) {
      throw new Error(
        `Section ${sectionId} is not a group and cannot enable overflow mode.`,
      );
    }
    return;
  }
  if (
    section.overflowMode &&
    (!isValidOverflowSize(section.size.width) ||
      !isValidOverflowSize(section.size.height))
  ) {
    throw new Error(
      `Group ${sectionId} overflow dimensions must be auto or positive finite numbers.`,
    );
  }
}
