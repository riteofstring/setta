import type {
  WorkspaceDocument,
  WorkspaceSection,
  WorkspaceSectionData,
} from "@setta/workspace";

import type { Project } from "../backend/generatedContract";

export type ProjectOperation =
  | { op: "deleteSection"; sectionId: string }
  | { op: "setViewport"; viewport: Project["layout"]["viewport"] }
  | {
      op: "upsertSection";
      section: Project["sections"][string];
      layout: Project["layout"]["topLevelSections"][string] | null;
    };

function projectSection(
  section: Project["sections"][string],
): WorkspaceSection {
  return {
    children: [...section.children],
    data: section.data as WorkspaceSectionData,
    id: section.id,
    isHorizontalOrientation: section.isHorizontalOrientation,
    isMinimized: false,
    kind: section.kind,
    name: section.name,
    overflowMode: section.overflowMode,
    positionAndSizeLocked: section.positionAndSizeLocked,
    size: { height: section.height, width: section.width },
    styleColor: section.styleColor,
    tagColor: section.tagColor,
  };
}

export function projectWorkspaceDocument(project: Project): WorkspaceDocument {
  const sections = Object.fromEntries(
    Object.entries(project.sections).map(([id, section]) => [
      id,
      projectSection(section),
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
    activeIds: [],
    savedViews: null,
    sections,
    topLevelSections,
    viewport: project.layout.viewport,
  };
}

function canonicalSection(
  section: WorkspaceSection,
): Project["sections"][string] {
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
  } as Project["sections"][string];
}

function canonicalLayout(
  document: WorkspaceDocument,
  sectionId: string,
): Project["layout"]["topLevelSections"][string] | null {
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

function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => sameValue(value, right[index]))
    );
  }
  if (
    left === null ||
    right === null ||
    typeof left !== "object" ||
    typeof right !== "object"
  ) {
    return false;
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
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
    section: { ...section, data } as Project["sections"][string],
  };
}
