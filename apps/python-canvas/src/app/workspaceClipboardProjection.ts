import type {
  TopLevelSectionLayout,
  WorkspaceDocument,
  WorkspaceSection,
} from "@riteofstring/setta";

export type ProjectRootLayoutOverride = Readonly<{
  h: number | null;
  w: number | null;
  x: number;
  y: number;
}>;

export type ProjectSectionPresentationOverride = Readonly<{
  isHorizontalOrientation: boolean;
  isMinimized: boolean;
  overflowMode: boolean;
  positionAndSizeLocked: boolean;
  size: WorkspaceSection["size"];
  styleColor: string | null;
  tagColor: string | null;
}>;

export type ProjectClipboardProjectionOptions = Readonly<{
  activeSectionIds?: ReadonlyArray<string>;
  canonicalRootLayoutOverrides?: ReadonlyMap<string, ProjectRootLayoutOverride>;
  canonicalSectionPresentationOverrides?: ReadonlyMap<
    string,
    ProjectSectionPresentationOverride
  >;
}>;

type ProjectClipboardTopLevelLayoutInput = Readonly<{
  canonicalId: string;
  current: Pick<WorkspaceDocument, "topLevelSections">;
  override: ProjectRootLayoutOverride | undefined;
  pendingSectionId: string | undefined;
  projected: Pick<WorkspaceDocument, "topLevelSections">;
  workspaceId: string;
  zIndex: number | undefined;
}>;

export function projectClipboardTopLevelLayout(
  input: ProjectClipboardTopLevelLayoutInput,
): TopLevelSectionLayout {
  const retainedLayout =
    input.current.topLevelSections[input.workspaceId] ??
    (input.pendingSectionId === undefined
      ? undefined
      : input.current.topLevelSections[input.pendingSectionId]) ??
    input.projected.topLevelSections[input.workspaceId];
  if (retainedLayout === undefined) {
    throw new Error(
      `Python Canvas projection is missing top-level layout ${input.workspaceId}.`,
    );
  }
  if (input.override === undefined) {
    return retainedLayout;
  }
  if (input.zIndex === undefined) {
    throw new Error(
      `Python Canvas projection is missing clipboard z-index ${input.canonicalId}.`,
    );
  }
  return {
    ...retainedLayout,
    h: input.override.h,
    w: input.override.w,
    x: input.override.x,
    y: input.override.y,
    zIndex: input.zIndex,
  };
}

export function frontmostClipboardRootLayoutZIndexes(
  overrides: ReadonlyMap<string, ProjectRootLayoutOverride> | undefined,
  current: Pick<WorkspaceDocument, "topLevelSections">,
  projected: Pick<WorkspaceDocument, "topLevelSections">,
): ReadonlyMap<string, number> {
  const zIndexes = new Map<string, number>();
  let nextZIndex =
    Math.max(
      -1,
      ...Object.values(current.topLevelSections).map((layout) => layout.zIndex),
      ...Object.values(projected.topLevelSections).map(
        (layout) => layout.zIndex,
      ),
    ) + 1;
  for (const canonicalId of overrides?.keys() ?? []) {
    zIndexes.set(canonicalId, nextZIndex);
    nextZIndex += 1;
  }
  return zIndexes;
}

export function projectClipboardActiveSectionIds(
  activeIds: ReadonlyArray<string>,
  sections: WorkspaceDocument["sections"],
): string[] {
  const projected: string[] = [];
  for (const activeId of activeIds) {
    if (sections[activeId] === undefined) {
      throw new Error(
        `Python Canvas projection cannot select missing section ${activeId}.`,
      );
    }
    if (!projected.includes(activeId)) {
      projected.push(activeId);
    }
  }
  return projected;
}

export function projectClipboardSectionPresentation(
  section: WorkspaceSection,
  override: ProjectSectionPresentationOverride | undefined,
): WorkspaceSection {
  if (override === undefined) {
    return section;
  }
  return {
    ...section,
    isHorizontalOrientation: override.isHorizontalOrientation,
    isMinimized: override.isMinimized,
    overflowMode: override.overflowMode,
    positionAndSizeLocked: override.positionAndSizeLocked,
    size: { ...override.size },
    styleColor: override.styleColor,
    tagColor: override.tagColor,
  };
}
