import _ from "lodash";
import type {
  TopLevelSectionLayout,
  WorkspaceDocument,
  WorkspaceItem,
  WorkspaceSection,
  WorkspaceSectionItemTree,
} from "../document/types";
import type { WorkspaceSnapshot } from "../document/workspaceSnapshot";

export function createWorkspaceHistoryReplayDocument({
  live,
  source,
  target,
}: {
  live: WorkspaceDocument;
  source: WorkspaceSnapshot<WorkspaceDocument>;
  target: WorkspaceSnapshot<WorkspaceDocument>;
}): WorkspaceDocument {
  const document = structuredClone(target) as WorkspaceDocument;
  return {
    ...document,
    sections: mergeWorkspaceHistorySections(
      document.sections,
      source.sections,
      live.sections,
    ),
    topLevelSections: mergeWorkspaceHistoryTopLevelSections(
      document.topLevelSections,
      source.topLevelSections,
      live.topLevelSections,
    ),
    savedViews: structuredClone(live.savedViews),
    viewport: structuredClone(live.viewport),
  };
}

function mergeWorkspaceHistorySections(
  target: Record<string, WorkspaceSection>,
  source: WorkspaceSnapshot<Record<string, WorkspaceSection>>,
  live: Record<string, WorkspaceSection>,
): Record<string, WorkspaceSection> {
  const sections: Record<string, WorkspaceSection> = {};
  for (const [sectionId, targetSection] of Object.entries(target)) {
    const sourceSection = source[sectionId];
    const liveSection = live[sectionId];
    sections[sectionId] =
      sourceSection && liveSection
        ? mergeWorkspaceHistorySection(
            targetSection,
            sourceSection,
            liveSection,
          )
        : targetSection;
  }
  return sections;
}

function mergeWorkspaceHistorySection(
  target: WorkspaceSection,
  source: WorkspaceSnapshot<WorkspaceSection>,
  live: WorkspaceSection,
): WorkspaceSection {
  const section: WorkspaceSection = {
    ...target,
    size: {
      height: preserveLiveWorkspaceChange(
        target.size.height,
        source.size.height,
        live.size.height,
      ),
      width: preserveLiveWorkspaceChange(
        target.size.width,
        source.size.width,
        live.size.width,
      ),
    },
  };
  replaceWorkspaceOptionalValue(section, "data", source, live);
  if (target.itemTree && source.itemTree && live.itemTree) {
    section.itemTree = mergeWorkspaceHistoryItemTree(
      target.itemTree,
      source.itemTree,
      live.itemTree,
    );
  }
  return section;
}

function mergeWorkspaceHistoryItemTree(
  target: WorkspaceSectionItemTree,
  source: WorkspaceSnapshot<WorkspaceSectionItemTree>,
  live: WorkspaceSectionItemTree,
): WorkspaceSectionItemTree {
  const items: Record<string, WorkspaceItem> = {};
  for (const [itemId, targetItem] of Object.entries(target.items)) {
    const sourceItem = source.items[itemId];
    const liveItem = live.items[itemId];
    items[itemId] =
      sourceItem && liveItem
        ? mergeWorkspaceHistoryItem(targetItem, sourceItem, liveItem)
        : targetItem;
  }
  const itemTree = {
    ...target,
    items,
  };
  replaceWorkspaceOptionalValue(itemTree, "itemColumnWidth", source, live);
  return itemTree;
}

function mergeWorkspaceHistoryItem(
  target: WorkspaceItem,
  source: WorkspaceSnapshot<WorkspaceItem>,
  live: WorkspaceItem,
): WorkspaceItem {
  const item = { ...target };
  replaceWorkspaceOptionalValue(item, "data", source, live);
  replaceWorkspaceOptionalValue(item, "presentation", source, live);
  return item;
}

function replaceWorkspaceOptionalValue<
  Value extends object,
  Key extends keyof Value,
>(
  target: Value,
  key: Key,
  source: {
    readonly [Property in keyof Value]: WorkspaceSnapshot<Value[Property]>;
  },
  live: Value,
): void {
  const next = preserveLiveWorkspaceChange(target[key], source[key], live[key]);
  if (next === undefined) {
    delete target[key];
    return;
  }
  target[key] = next as Value[Key];
}

function mergeWorkspaceHistoryTopLevelSections(
  target: Record<string, TopLevelSectionLayout>,
  source: WorkspaceSnapshot<Record<string, TopLevelSectionLayout>>,
  live: Record<string, TopLevelSectionLayout>,
): Record<string, TopLevelSectionLayout> {
  const layouts: Record<string, TopLevelSectionLayout> = {};
  for (const [sectionId, targetLayout] of Object.entries(target)) {
    const sourceLayout = source[sectionId];
    const liveLayout = live[sectionId];
    layouts[sectionId] =
      sourceLayout && liveLayout
        ? {
            h: preserveLiveWorkspaceChange(
              targetLayout.h,
              sourceLayout.h,
              liveLayout.h,
            ),
            w: preserveLiveWorkspaceChange(
              targetLayout.w,
              sourceLayout.w,
              liveLayout.w,
            ),
            x: preserveLiveWorkspaceChange(
              targetLayout.x,
              sourceLayout.x,
              liveLayout.x,
            ),
            y: preserveLiveWorkspaceChange(
              targetLayout.y,
              sourceLayout.y,
              liveLayout.y,
            ),
            zIndex: preserveLiveWorkspaceChange(
              targetLayout.zIndex,
              sourceLayout.zIndex,
              liveLayout.zIndex,
            ),
          }
        : targetLayout;
  }
  return layouts;
}

function preserveLiveWorkspaceChange<Value>(
  target: Value,
  source: WorkspaceSnapshot<Value>,
  live: Value,
): Value {
  return _.isEqual(live, source) ? target : structuredClone(live);
}
