import {
  cloneFrozenWorkspaceClipboardJsonValue,
  cloneWorkspaceClipboardJsonValue,
} from "./json";
import { WORKSPACE_CLIPBOARD_MAX_ITEM_COUNT } from "./types";
import type {
  JsonValue,
  WorkspaceClipboardCaptureInput,
  WorkspaceClipboardCapturedSelection,
  WorkspaceClipboardFragment,
  WorkspaceClipboardLocalSectionContent,
  WorkspaceClipboardSection,
  WorkspaceClipboardSource,
  WorkspaceClipboardTopLevelLayout,
  WorkspaceLocalClipboardPayload,
} from "./types";
import type {
  TopLevelSectionLayout,
  WorkspaceSection,
  WorkspaceSectionData,
  WorkspaceSectionItemTree,
} from "../document/types";
import type { WorkspaceSnapshot } from "../document/workspaceSnapshot";

const NESTED_ROOT_LAYOUT_CASCADE_OFFSET = 40;

type ResolvedRootLayout = Readonly<{
  layout: TopLevelSectionLayout;
  topLevelSectionId: string;
}>;

type WorkspaceClipboardItemCountSource = Readonly<{
  itemTree?: Readonly<{ items: Readonly<Record<string, unknown>> }>;
}>;

export class WorkspaceClipboardItemCountLimitError extends Error {
  constructor() {
    super(
      `Clipboard selection exceeds the ${WORKSPACE_CLIPBOARD_MAX_ITEM_COUNT} item limit.`,
    );
  }
}

function assertStableIdentifier(value: string, role: string): void {
  if (value.trim() === "" || value !== value.trim()) {
    throw new Error(`${role} must be a nonblank trimmed identifier.`);
  }
}

function assertKnownSection(
  sections: Readonly<Record<string, WorkspaceSection>>,
  sectionId: string,
): WorkspaceSection {
  const section = sections[sectionId];
  if (!section) {
    throw new Error(
      `Clipboard capture references unknown section ${sectionId}.`,
    );
  }
  if (section.id !== sectionId) {
    throw new Error(
      `Clipboard capture section record ${sectionId} does not match section id ${section.id}.`,
    );
  }
  return section;
}

function normalizeWorkspaceClipboardRootSelection(
  input: Pick<
    WorkspaceClipboardCaptureInput,
    "activeIds" | "parentSectionMap" | "sections"
  >,
): Array<string> {
  const selectedIds: Array<string> = [];
  const selectedSet = new Set<string>();
  for (const sectionId of input.activeIds) {
    assertStableIdentifier(sectionId, "Clipboard selected section id");
    assertKnownSection(input.sections, sectionId);
    if (!selectedSet.has(sectionId)) {
      selectedSet.add(sectionId);
      selectedIds.push(sectionId);
    }
  }
  return selectedIds.filter((sectionId) => {
    const ancestors = new Set<string>([sectionId]);
    let parentId = input.parentSectionMap[sectionId] ?? null;
    while (parentId !== null) {
      assertKnownSection(input.sections, parentId);
      if (ancestors.has(parentId)) {
        throw new Error(
          `Clipboard capture section ${sectionId} has a cyclic parent chain.`,
        );
      }
      if (selectedSet.has(parentId)) {
        return false;
      }
      ancestors.add(parentId);
      parentId = input.parentSectionMap[parentId] ?? null;
    }
    return true;
  });
}

export function getWorkspaceClipboardSelectionRootIds(
  input: Pick<
    WorkspaceClipboardCaptureInput,
    "activeIds" | "parentSectionMap" | "sections"
  >,
): ReadonlyArray<string> {
  return Object.freeze(normalizeWorkspaceClipboardRootSelection(input));
}

function addSectionItemCount(
  section: WorkspaceClipboardItemCountSource,
  itemCount: { value: number },
): void {
  itemCount.value += Object.keys(section.itemTree?.items ?? {}).length;
  if (itemCount.value > WORKSPACE_CLIPBOARD_MAX_ITEM_COUNT) {
    throw new WorkspaceClipboardItemCountLimitError();
  }
}

export function assertWorkspaceClipboardLocalItemCount(
  input: WorkspaceClipboardCaptureInput,
): void {
  const rootIds = getWorkspaceClipboardSelectionRootIds(input);
  const capturedIds = new Set<string>();
  const itemCount = { value: 0 };
  const visit = (sectionId: string): void => {
    if (capturedIds.has(sectionId)) {
      throw new Error(
        `Clipboard capture section ${sectionId} is claimed more than once.`,
      );
    }
    const section = assertKnownSection(input.sections, sectionId);
    capturedIds.add(sectionId);
    addSectionItemCount(section, itemCount);
    for (const childId of section.children) {
      visit(childId);
    }
  };
  for (const rootId of rootIds) {
    visit(rootId);
  }
}

function toClipboardSection(
  section: WorkspaceSection,
): WorkspaceClipboardSection {
  return {
    children: [...section.children],
    id: section.id,
    isHorizontalOrientation: section.isHorizontalOrientation,
    isMinimized: section.isMinimized,
    kind: section.kind,
    name: section.name,
    overflowMode: section.overflowMode,
    positionAndSizeLocked: section.positionAndSizeLocked,
    size: { ...section.size },
    styleColor: section.styleColor,
    tagColor: section.tagColor,
  };
}

function cloneSourceSection(
  section: WorkspaceSection,
): WorkspaceSnapshot<WorkspaceSection> {
  return cloneFrozenWorkspaceClipboardJsonValue(
    section as unknown as JsonValue,
  ) as unknown as WorkspaceSnapshot<WorkspaceSection>;
}

function resolveRootLayout(
  input: WorkspaceClipboardCaptureInput,
  sectionId: string,
): ResolvedRootLayout {
  const visited = new Set<string>();
  let currentId: string | null = sectionId;
  while (currentId !== null) {
    if (visited.has(currentId)) {
      throw new Error(
        `Clipboard capture section ${sectionId} has a cyclic parent chain.`,
      );
    }
    visited.add(currentId);
    const layout = input.topLevelSections[currentId];
    if (layout) {
      return { layout, topLevelSectionId: currentId };
    }
    const parentId: string | null = input.parentSectionMap[currentId] ?? null;
    if (parentId !== null) {
      assertKnownSection(input.sections, parentId);
    }
    currentId = parentId;
  }
  throw new Error(
    `Clipboard capture root ${sectionId} has no top-level source layout.`,
  );
}

function resolveRootLayoutDimensions(
  input: WorkspaceClipboardCaptureInput,
  rootId: string,
  resolved: ResolvedRootLayout,
): Pick<WorkspaceClipboardTopLevelLayout, "h" | "w"> {
  if (rootId === resolved.topLevelSectionId) {
    return { h: resolved.layout.h, w: resolved.layout.w };
  }
  const section = assertKnownSection(input.sections, rootId);
  return {
    h: section.size.height === "auto" ? null : section.size.height,
    w: section.size.width === "auto" ? null : section.size.width,
  };
}

function normalizeRootLayouts(
  input: WorkspaceClipboardCaptureInput,
  rootIds: ReadonlyArray<string>,
): Record<string, WorkspaceClipboardTopLevelLayout> {
  const sourceLayouts = rootIds.map((rootId) => {
    const resolved = resolveRootLayout(input, rootId);
    return [rootId, resolved] as const;
  });
  const nestedRootCountByTopLevelId = new Map<string, number>();
  const unnormalizedLayouts: Record<string, WorkspaceClipboardTopLevelLayout> =
    Object.create(null) as Record<string, WorkspaceClipboardTopLevelLayout>;
  for (const [rootId, resolved] of sourceLayouts) {
    const nestedRootIndex =
      rootId === resolved.topLevelSectionId
        ? 0
        : (nestedRootCountByTopLevelId.get(resolved.topLevelSectionId) ?? 0);
    if (rootId !== resolved.topLevelSectionId) {
      nestedRootCountByTopLevelId.set(
        resolved.topLevelSectionId,
        nestedRootIndex + 1,
      );
    }
    const dimensions = resolveRootLayoutDimensions(input, rootId, resolved);
    unnormalizedLayouts[rootId] = {
      ...dimensions,
      x:
        resolved.layout.x + nestedRootIndex * NESTED_ROOT_LAYOUT_CASCADE_OFFSET,
      y:
        resolved.layout.y + nestedRootIndex * NESTED_ROOT_LAYOUT_CASCADE_OFFSET,
      zIndex: resolved.layout.zIndex,
    };
  }
  const minimumX = Math.min(
    ...Object.values(unnormalizedLayouts).map((layout) => layout.x),
  );
  const minimumY = Math.min(
    ...Object.values(unnormalizedLayouts).map((layout) => layout.y),
  );
  const layouts: Record<string, WorkspaceClipboardTopLevelLayout> =
    Object.create(null) as Record<string, WorkspaceClipboardTopLevelLayout>;
  for (const rootId of rootIds) {
    const layout = unnormalizedLayouts[rootId];
    if (!layout) {
      throw new Error(`Clipboard capture root ${rootId} has no layout.`);
    }
    layouts[rootId] = {
      h: layout.h,
      w: layout.w,
      x: layout.x - minimumX,
      y: layout.y - minimumY,
      zIndex: layout.zIndex,
    };
  }
  return layouts;
}

function cloneFrozenClipboardFragment(
  fragment: WorkspaceClipboardFragment,
): WorkspaceClipboardFragment {
  return cloneFrozenWorkspaceClipboardJsonValue(
    fragment as unknown as JsonValue,
  ) as unknown as WorkspaceClipboardFragment;
}

function cloneFrozenClipboardSource(
  source: WorkspaceClipboardSource,
): WorkspaceClipboardSource {
  return cloneFrozenWorkspaceClipboardJsonValue(
    source as unknown as JsonValue,
  ) as unknown as WorkspaceClipboardSource;
}

export function captureWorkspaceClipboardSelection(
  input: WorkspaceClipboardCaptureInput,
): WorkspaceClipboardCapturedSelection {
  const rootIds = getWorkspaceClipboardSelectionRootIds(input);
  if (rootIds.length === 0) {
    throw new Error(
      "Clipboard capture requires at least one selected section.",
    );
  }
  const sections: Record<string, WorkspaceClipboardSection> = Object.create(
    null,
  ) as Record<string, WorkspaceClipboardSection>;
  const sourceSections: Record<
    string,
    WorkspaceSnapshot<WorkspaceSection>
  > = Object.create(null) as Record<
    string,
    WorkspaceSnapshot<WorkspaceSection>
  >;
  const capturedIds = new Set<string>();
  const visit = (sectionId: string): void => {
    if (capturedIds.has(sectionId)) {
      throw new Error(
        `Clipboard capture section ${sectionId} is claimed more than once.`,
      );
    }
    const section = assertKnownSection(input.sections, sectionId);
    capturedIds.add(sectionId);
    sections[sectionId] = toClipboardSection(section);
    sourceSections[sectionId] = cloneSourceSection(section);
    for (const childId of section.children) {
      visit(childId);
    }
  };
  for (const rootId of rootIds) {
    visit(rootId);
  }
  const fragment: WorkspaceClipboardFragment = {
    roots: rootIds,
    sections,
    topLevelLayouts: normalizeRootLayouts(input, rootIds),
  };
  const source: WorkspaceClipboardSource = { sections: sourceSections };
  return {
    fragment: cloneFrozenClipboardFragment(fragment),
    source: cloneFrozenClipboardSource(source),
  };
}

function cloneOptionalSectionData(
  value: WorkspaceSectionData | undefined,
): WorkspaceSectionData | undefined {
  if (value === undefined) {
    return undefined;
  }
  return cloneWorkspaceClipboardJsonValue(value);
}

function cloneOptionalItemTree(
  value: WorkspaceSectionItemTree | undefined,
): WorkspaceSectionItemTree | undefined {
  if (value === undefined) {
    return undefined;
  }
  return cloneWorkspaceClipboardJsonValue(
    value as unknown as JsonValue,
  ) as WorkspaceSectionItemTree;
}

function assertCapturedLocalPayloadItemCount(
  captured: WorkspaceClipboardCapturedSelection,
): void {
  const itemCount = { value: 0 };
  for (const section of Object.values(captured.source.sections)) {
    addSectionItemCount(section, itemCount);
  }
}

export function createWorkspaceLocalClipboardPayload(
  captured: WorkspaceClipboardCapturedSelection,
): WorkspaceLocalClipboardPayload {
  assertCapturedLocalPayloadItemCount(captured);
  const sections: Record<string, WorkspaceClipboardLocalSectionContent> =
    Object.create(null) as Record<
      string,
      WorkspaceClipboardLocalSectionContent
    >;
  for (const sectionId of Object.keys(captured.fragment.sections)) {
    const source = captured.source.sections[sectionId];
    if (!source) {
      throw new Error(
        `Clipboard local payload is missing source section ${sectionId}.`,
      );
    }
    const data = cloneOptionalSectionData(
      source.data as WorkspaceSectionData | undefined,
    );
    const itemTree = cloneOptionalItemTree(
      source.itemTree as WorkspaceSectionItemTree | undefined,
    );
    sections[sectionId] = {
      ...(data === undefined ? {} : { data }),
      ...(itemTree === undefined ? {} : { itemTree }),
    };
  }
  return { sections };
}
