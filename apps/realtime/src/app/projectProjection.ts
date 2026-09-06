import type {
  WorkspaceDocument,
  WorkspaceSection,
  WorkspaceSectionData,
} from "@setta/workspace";

import type {
  Project,
  ProjectOperation,
  Section,
  TopLevelSectionLayout,
  Viewport,
} from "../backend/generatedContract";

export type { ProjectOperation } from "../backend/generatedContract";

function projectSection(
  section: Section,
  previous: WorkspaceSection | undefined,
): WorkspaceSection {
  return {
    children: [...section.children],
    data: section.data as WorkspaceSectionData,
    id: section.id,
    isHorizontalOrientation: section.isHorizontalOrientation,
    isMinimized: previous?.isMinimized ?? false,
    kind: section.kind,
    name: section.name,
    overflowMode: section.overflowMode,
    positionAndSizeLocked: section.positionAndSizeLocked,
    size: { height: section.height, width: section.width },
    styleColor: section.styleColor,
    tagColor: section.tagColor,
  };
}

export function projectWorkspaceDocument(
  project: Project,
  previous?: WorkspaceDocument,
): WorkspaceDocument {
  const sections = Object.fromEntries(
    Object.entries(project.sections).map(([id, section]) => [
      id,
      projectSection(section, previous?.sections[id]),
    ]),
  );
  const topLevelSections = Object.fromEntries(
    Object.entries(project.layout.topLevelSections).map(([id, layout]) => [
      id,
      {
        h: layout.height,
        w: layout.width,
        x: layout.x,
        y: layout.y,
        zIndex: layout.zIndex,
      },
    ]),
  );
  return {
    activeIds:
      previous?.activeIds.filter(
        (sectionId) => sections[sectionId] !== undefined,
      ) ?? [],
    savedViews: null,
    sections,
    topLevelSections,
    viewport: project.layout.viewport,
  };
}

function canonicalSection(section: WorkspaceSection): Section {
  return {
    children: [...section.children],
    data: section.data ?? null,
    height: section.size.height,
    id: section.id,
    isHorizontalOrientation: section.isHorizontalOrientation,
    kind: section.kind,
    name: section.name,
    overflowMode: section.overflowMode,
    positionAndSizeLocked: section.positionAndSizeLocked,
    styleColor: section.styleColor,
    tagColor: section.tagColor,
    width: section.size.width,
  } as Section;
}

function canonicalLayout(
  document: WorkspaceDocument,
  sectionId: string,
): TopLevelSectionLayout | null {
  const layout = document.topLevelSections[sectionId];
  if (layout === undefined) {
    return null;
  }
  return {
    height: layout.h,
    width: layout.w,
    x: layout.x,
    y: layout.y,
    zIndex: layout.zIndex,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sameArray(left: unknown[], right: unknown[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => sameValue(value, right[index]))
  );
}

function sameRecord(
  leftRecord: Record<string, unknown>,
  rightRecord: Record<string, unknown>,
): boolean {
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.hasOwn(rightRecord, key) &&
        sameValue(leftRecord[key], rightRecord[key]),
    )
  );
}

function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return sameArray(left, right);
  }
  return isRecord(left) && isRecord(right) && sameRecord(left, right);
}

export function workspaceDocumentOperations(
  project: Project,
  document: WorkspaceDocument,
): ProjectOperation[] {
  const operations: ProjectOperation[] = [];
  if (!sameValue(project.layout.viewport, document.viewport)) {
    operations.push({ op: "setViewport", viewport: document.viewport });
  }
  for (const sectionId of Object.keys(project.sections)) {
    if (document.sections[sectionId] === undefined) {
      operations.push({ op: "deleteSection", sectionId });
    }
  }
  for (const [sectionId, workspaceSection] of Object.entries(
    document.sections,
  )) {
    const section = canonicalSection(workspaceSection);
    const layout = canonicalLayout(document, sectionId);
    const currentSection = project.sections[sectionId];
    const currentLayout = project.layout.topLevelSections[sectionId] ?? null;
    if (
      currentSection === undefined ||
      !sameValue(currentSection, section) ||
      !sameValue(currentLayout, layout)
    ) {
      operations.push({ layout, op: "upsertSection", section });
    }
  }
  return operations;
}

export function replaceSectionDataOperation(
  project: Project,
  sectionId: string,
  data: WorkspaceSectionData,
): ProjectOperation {
  const section = project.sections[sectionId];
  if (section === undefined) {
    throw new Error(`Realtime section ${sectionId} is not in the project.`);
  }
  return {
    layout: project.layout.topLevelSections[sectionId] ?? null,
    op: "upsertSection",
    section: { ...section, data } as Section,
  };
}
