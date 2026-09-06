import {
  WORKSPACE_CODE_SECTION_KIND,
  createWorkspaceCodeSectionData,
  type WorkspaceDocument,
  type WorkspaceSection,
  type WorkspaceSectionData,
} from "@setta/workspace";

import type {
  Project,
  ProjectOperation,
  RuntimeSourceDocument,
  Section,
  TopLevelSectionLayout,
  Viewport,
} from "../backend/generatedContract";

export type { ProjectOperation } from "../backend/generatedContract";

function projectSection(
  section: Section,
  previous: WorkspaceSection | undefined,
  source: RuntimeSourceDocument | null,
  preserveSourceDraft: boolean,
): WorkspaceSection {
  const content = projectSectionContent(
    section,
    previous,
    source,
    preserveSourceDraft,
  );
  return {
    children: [...section.children],
    data: content.data,
    id: section.id,
    isHorizontalOrientation: section.isHorizontalOrientation,
    isMinimized: previous?.isMinimized ?? false,
    kind: content.kind,
    name: section.name,
    overflowMode: section.overflowMode,
    positionAndSizeLocked: section.positionAndSizeLocked,
    size: { height: section.height, width: section.width },
    styleColor: section.styleColor,
    tagColor: section.tagColor,
  };
}

function projectSectionContent(
  section: Section,
  previous: WorkspaceSection | undefined,
  source: RuntimeSourceDocument | null,
  preserveSourceDraft: boolean,
): { data: WorkspaceSectionData; kind: string } {
  if (section.kind !== "code") {
    return { data: section.data as WorkspaceSectionData, kind: section.kind };
  }
  if (preserveSourceDraft && previous?.kind === WORKSPACE_CODE_SECTION_KIND) {
    return {
      data: previous.data ?? projectCodeSectionData(source, section.id),
      kind: WORKSPACE_CODE_SECTION_KIND,
    };
  }
  return {
    data: projectCodeSectionData(source, section.id),
    kind: WORKSPACE_CODE_SECTION_KIND,
  };
}

function projectCodeSectionData(
  source: RuntimeSourceDocument | null,
  sectionId: string,
): WorkspaceSectionData {
  if (source === null) {
    throw new Error(
      `Realtime code section ${sectionId} requires its runtime source document.`,
    );
  }
  return createWorkspaceCodeSectionData({
    code: source.source,
    language: "python",
    mode: "editable",
  });
}

export function projectWorkspaceDocument(
  project: Project,
  previous?: WorkspaceDocument,
  source: RuntimeSourceDocument | null = null,
  preserveSourceDraft = true,
): WorkspaceDocument {
  if (
    source !== null &&
    (source.projectId !== project.id ||
      source.entrypoint !== project.runtime.entrypoint)
  ) {
    throw new Error("Realtime received source for another project entrypoint.");
  }
  const sections = Object.fromEntries(
    Object.entries(project.sections).map(([id, section]) => [
      id,
      projectSection(
        section,
        previous?.sections[id],
        source,
        preserveSourceDraft,
      ),
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

function canonicalSection(
  section: WorkspaceSection,
  current: Section | undefined,
): Section {
  if (
    section.kind === WORKSPACE_CODE_SECTION_KIND &&
    current?.kind !== "code"
  ) {
    throw new Error(
      `Realtime cannot persist local code section ${section.id} as project data.`,
    );
  }
  const codeSection = current?.kind === "code";
  return {
    children: [...section.children],
    data: codeSection ? current.data : (section.data ?? null),
    height: section.size.height,
    id: section.id,
    isHorizontalOrientation: section.isHorizontalOrientation,
    kind: codeSection ? "code" : section.kind,
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
    const currentSection = project.sections[sectionId];
    const section = canonicalSection(workspaceSection, currentSection);
    const layout = canonicalLayout(document, sectionId);
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
  if (section.kind === "code") {
    throw new Error(
      `Realtime code section ${sectionId} must use the runtime source boundary.`,
    );
  }
  return {
    layout: project.layout.topLevelSections[sectionId] ?? null,
    op: "upsertSection",
    section: { ...section, data } as Section,
  };
}
