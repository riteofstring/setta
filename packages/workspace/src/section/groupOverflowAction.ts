import { useWorkspaceCapabilities } from "../document/capabilities";
import { notifyWorkspaceDocumentChange } from "../document/documentChangeCallback";
import { getSectionOrThrow, isGroupSection } from "../document/documentSelectors";
import { assertValidSectionOverflowMode } from "../document/groupOverflow";
import { useWorkspaceDocument } from "../document/stores";
import type { SectionSize } from "../document/types";
import { useSectionRefs } from "./sectionRefs";

type MeasuredGroupSize = Pick<DOMRect, "height" | "width">;

function resolveBoundedDimension(
  sectionId: string,
  current: SectionSize["width"],
  measured: number,
): number {
  if (current !== "auto") {
    return current;
  }
  const rounded = Math.round(measured);
  if (!Number.isFinite(rounded) || rounded <= 0) {
    throw new Error(`Cannot enable bounded overflow for unmeasured group ${sectionId}.`);
  }
  return rounded;
}

// Frozen main promotes only auto dimensions when bounded overflow is first enabled. The group
// root uses border-box sizing, so the outer rectangle is also the numeric size that preserves the
// currently visible group geometry when the fixed bounds take effect.
export function getBoundedGroupSize(
  sectionId: string,
  size: SectionSize,
  measured: MeasuredGroupSize | null,
): SectionSize | null {
  if (size.width !== "auto" && size.height !== "auto") {
    return null;
  }
  if (!measured) {
    throw new Error(
      `Cannot enable bounded overflow for group ${sectionId} before its auto-sized surface is mounted.`,
    );
  }
  return {
    width: resolveBoundedDimension(sectionId, size.width, measured.width),
    height: resolveBoundedDimension(sectionId, size.height, measured.height),
  };
}

function assertGroupCanChangeOverflow(
  sectionId: string,
  section: ReturnType<typeof getSectionOrThrow>,
): void {
  if (!isGroupSection(section)) {
    throw new Error(`Section ${sectionId} is not a group and has no overflow mode.`);
  }
  if (section.positionAndSizeLocked) {
    throw new Error(`Group ${sectionId} is locked and cannot change overflow mode.`);
  }
}

function measureAutoGroupSize(sectionId: string, size: SectionSize): MeasuredGroupSize | null {
  if (size.width !== "auto" && size.height !== "auto") {
    return null;
  }
  return useSectionRefs.getState().withNested[sectionId]?.getBoundingClientRect() ?? null;
}

function getNextGroupSize(
  sectionId: string,
  size: SectionSize,
  overflowMode: boolean,
): SectionSize {
  if (!overflowMode) {
    return size;
  }
  return getBoundedGroupSize(sectionId, size, measureAutoGroupSize(sectionId, size)) ?? size;
}

// One public action owns capability/section validation, measured auto-size promotion, the atomic
// mode-and-size write, and the single host notification. A3 routes the package action surfaces
// through this same operation.
export function setGroupOverflowMode(sectionId: string, overflowMode: boolean): void {
  if (typeof overflowMode !== "boolean") {
    throw new Error("Group overflow mode must be a boolean.");
  }
  if (!useWorkspaceCapabilities.getState().canEditLayout) {
    throw new Error("Changing group overflow requires permission to edit workspace layout.");
  }
  const documentState = useWorkspaceDocument.getState();
  const section = getSectionOrThrow(documentState, sectionId);
  assertGroupCanChangeOverflow(sectionId, section);
  if (section.overflowMode === overflowMode) {
    return;
  }

  const nextSection = {
    ...section,
    overflowMode,
    size: getNextGroupSize(sectionId, section.size, overflowMode),
  };
  assertValidSectionOverflowMode(sectionId, nextSection);
  useWorkspaceDocument.setState({
    sections: {
      ...documentState.sections,
      [sectionId]: nextSection,
    },
  });
  notifyWorkspaceDocumentChange();
}
