import { getWorkspaceCapabilitiesStore } from "../document/capabilities";
import { notifyWorkspaceDocumentChange } from "../document/documentChangeCallback";
import {
  getSectionOrThrow,
  isGroupSection,
} from "../document/documentSelectors";
import { assertValidSectionOverflowMode } from "../document/groupOverflow";
import { getWorkspaceDocumentStore } from "../document/stores";
import type { SectionSize } from "../document/types";
import { getSectionRefsStore } from "./sectionRefs";
import type { WorkspaceHost } from "../workspaceHost";

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
    throw new Error(
      `Cannot enable bounded overflow for unmeasured group ${sectionId}.`,
    );
  }
  return rounded;
}

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
    throw new Error(
      `Section ${sectionId} is not a group and has no overflow mode.`,
    );
  }
  if (section.positionAndSizeLocked) {
    throw new Error(
      `Group ${sectionId} is locked and cannot change overflow mode.`,
    );
  }
}

function measureAutoGroupSize(
  host: WorkspaceHost,
  sectionId: string,
  size: SectionSize,
): MeasuredGroupSize | null {
  if (size.width !== "auto" && size.height !== "auto") {
    return null;
  }
  return (
    getSectionRefsStore(host)
      .getState()
      .withNested[sectionId]?.getBoundingClientRect() ?? null
  );
}

function getNextGroupSize(
  host: WorkspaceHost,
  sectionId: string,
  size: SectionSize,
  overflowMode: boolean,
): SectionSize {
  if (!overflowMode) {
    return size;
  }
  return (
    getBoundedGroupSize(
      sectionId,
      size,
      measureAutoGroupSize(host, sectionId, size),
    ) ?? size
  );
}

export function setGroupOverflowMode(
  host: WorkspaceHost,
  sectionId: string,
  overflowMode: boolean,
): void {
  if (typeof overflowMode !== "boolean") {
    throw new Error("Group overflow mode must be a boolean.");
  }
  if (!getWorkspaceCapabilitiesStore(host).getState().canEditLayout) {
    throw new Error(
      "Changing group overflow requires permission to edit workspace layout.",
    );
  }
  const documentStore = getWorkspaceDocumentStore(host);
  const documentState = documentStore.getState();
  const section = getSectionOrThrow(documentState, sectionId);
  assertGroupCanChangeOverflow(sectionId, section);
  if (section.overflowMode === overflowMode) {
    return;
  }

  const nextSection = {
    ...section,
    overflowMode,
    size: getNextGroupSize(host, sectionId, section.size, overflowMode),
  };
  assertValidSectionOverflowMode(sectionId, nextSection);
  documentStore.setState({
    sections: {
      ...documentState.sections,
      [sectionId]: nextSection,
    },
  });
  notifyWorkspaceDocumentChange(host, "section-layout");
}
