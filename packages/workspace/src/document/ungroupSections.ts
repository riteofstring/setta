import { getSectionOrThrow, isGroupSection } from "./documentSelectors";
import type { ActiveSectionsState, WorkspaceDocumentState } from "./stores";
import type { WorkspaceSection } from "./types";

export type PreparedUngroupSections = {
  activeSections: ActiveSectionsState;
  document: WorkspaceDocumentState;
  focusTargetByGroupId: ReadonlyMap<string, string | null>;
  groupIds: Array<string>;
};

export type UngroupPromotedSectionMeasurement = {
  height: number;
  width: number;
};

export type ResolveUngroupPromotedSectionMeasurement = (
  sectionId: string,
) => UngroupPromotedSectionMeasurement | null;

function getParentId(state: WorkspaceDocumentState, sectionId: string): string | null {
  return state.parentSectionMap[sectionId] ?? null;
}

function isStructurallyUngroupable(state: WorkspaceDocumentState, groupId: string): boolean {
  const group = state.sections[groupId];
  if (!group || !isGroupSection(group) || group.positionAndSizeLocked) {
    return false;
  }
  const parentId = getParentId(state, groupId);
  if (parentId === null) {
    if (!state.topLevelSections[groupId]) {
      return false;
    }
  } else {
    const parent = state.sections[parentId];
    if (!parent || parent.children.filter((childId) => childId === groupId).length !== 1) {
      return false;
    }
  }
  return group.children.every(
    (childId) =>
      state.sections[childId] !== undefined && state.parentSectionMap[childId] === groupId,
  );
}

export function canUngroupWorkspaceSections(
  state: WorkspaceDocumentState,
  sections: ReadonlyArray<WorkspaceSection>,
): boolean {
  if (
    sections.length === 0 ||
    new Set(sections.map((section) => section.id)).size !== sections.length
  ) {
    return false;
  }
  return sections.every(
    (section) =>
      isGroupSection(section) &&
      !section.positionAndSizeLocked &&
      isStructurallyUngroupable(state, section.id),
  );
}

function normalizeGroupIds(groupIds: ReadonlyArray<string>): Array<string> {
  if (!Array.isArray(groupIds) || groupIds.length === 0) {
    throw new Error("Ungrouping requires at least one group id.");
  }
  const normalized: Array<string> = [];
  const seen = new Set<string>();
  for (const rawGroupId of groupIds) {
    if (typeof rawGroupId !== "string" || rawGroupId.trim() === "") {
      throw new Error("Ungrouping requires every group id to be a nonblank string.");
    }
    const groupId = rawGroupId.trim();
    if (!seen.has(groupId)) {
      normalized.push(groupId);
      seen.add(groupId);
    }
  }
  return normalized;
}

function validateGroup(state: WorkspaceDocumentState, groupId: string): void {
  const group = getSectionOrThrow(state, groupId);
  if (!isGroupSection(group)) {
    throw new Error(`Cannot ungroup non-group section ${groupId}.`);
  }
  if (group.positionAndSizeLocked) {
    throw new Error(`Cannot ungroup locked group ${groupId}.`);
  }
  const parentId = getParentId(state, groupId);
  if (parentId === null) {
    if (!state.topLevelSections[groupId]) {
      throw new Error(`Top-level group ${groupId} is missing its layout.`);
    }
  } else {
    const parent = getSectionOrThrow(state, parentId);
    if (parent.children.filter((childId) => childId === groupId).length !== 1) {
      throw new Error(`Group ${groupId} is not listed exactly once by parent ${parentId}.`);
    }
  }
  for (const childId of group.children) {
    getSectionOrThrow(state, childId);
    if (state.parentSectionMap[childId] !== groupId) {
      throw new Error(`Group ${groupId} does not own child ${childId} in the parent map.`);
    }
  }
}

function expandRemovedGroups(
  state: WorkspaceDocumentState,
  sectionIds: ReadonlyArray<string>,
  removedGroupIds: ReadonlySet<string>,
): Array<string> {
  const expanded: Array<string> = [];
  for (const sectionId of sectionIds) {
    if (!removedGroupIds.has(sectionId)) {
      expanded.push(sectionId);
      continue;
    }
    const group = getSectionOrThrow(state, sectionId);
    expanded.push(...expandRemovedGroups(state, group.children, removedGroupIds));
  }
  return expanded;
}

function arraysEqual(left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function buildSections(
  state: WorkspaceDocumentState,
  removedGroupIds: ReadonlySet<string>,
): Record<string, WorkspaceSection> {
  const sections: Record<string, WorkspaceSection> = {};
  for (const [sectionId, section] of Object.entries(state.sections)) {
    if (removedGroupIds.has(sectionId)) {
      continue;
    }
    const children = expandRemovedGroups(state, section.children, removedGroupIds);
    sections[sectionId] = arraysEqual(children, section.children)
      ? section
      : { ...section, children };
  }
  return sections;
}

function buildParentSectionMap(
  sections: Readonly<Record<string, WorkspaceSection>>,
): Record<string, string> {
  const parentSectionMap: Record<string, string> = {};
  for (const [parentId, section] of Object.entries(sections)) {
    for (const childId of section.children) {
      if (!sections[childId]) {
        throw new Error(`Ungrouping left parent ${parentId} with unknown child ${childId}.`);
      }
      const existingParentId = parentSectionMap[childId];
      if (existingParentId !== undefined) {
        throw new Error(
          `Ungrouping would make section ${childId} a child of ${existingParentId} and ${parentId}.`,
        );
      }
      parentSectionMap[childId] = parentId;
    }
  }
  return parentSectionMap;
}

function getMaximumTopLevelZIndex(state: WorkspaceDocumentState): number {
  return Object.values(state.topLevelSections).reduce(
    (maximum, layout) => Math.max(maximum, layout.zIndex),
    -1,
  );
}

function getReplacementIds(
  replacementIdsByGroupId: ReadonlyMap<string, Array<string>>,
  groupId: string,
): Array<string> {
  const replacementIds = replacementIdsByGroupId.get(groupId);
  if (!replacementIds) {
    throw new Error(`Ungrouping is missing replacements for group ${groupId}.`);
  }
  return replacementIds;
}

function getTopLevelGroupIds(
  state: WorkspaceDocumentState,
  groupIds: ReadonlyArray<string>,
): Array<string> {
  return groupIds.filter((groupId) => getParentId(state, groupId) === null);
}

function getPromotedTopLevelIds(
  topLevelGroupIds: ReadonlyArray<string>,
  replacementIdsByGroupId: ReadonlyMap<string, Array<string>>,
): Set<string> {
  const promotedIds = new Set<string>();
  for (const groupId of topLevelGroupIds) {
    for (const sectionId of getReplacementIds(replacementIdsByGroupId, groupId)) {
      promotedIds.add(sectionId);
    }
  }
  return promotedIds;
}

function copySurvivingTopLevelSections(
  state: WorkspaceDocumentState,
  removedGroupIds: ReadonlySet<string>,
  promotedIds: ReadonlySet<string>,
): WorkspaceDocumentState["topLevelSections"] {
  const topLevelSections: WorkspaceDocumentState["topLevelSections"] = {};
  for (const [sectionId, layout] of Object.entries(state.topLevelSections)) {
    if (removedGroupIds.has(sectionId)) {
      continue;
    }
    if (promotedIds.has(sectionId)) {
      continue;
    }
    topLevelSections[sectionId] = layout;
  }
  return topLevelSections;
}

function resolvePromotedTopLevelDimensions(
  sectionId: string,
  resolvePromotedSectionMeasurement: ResolveUngroupPromotedSectionMeasurement,
): { h: number | null; w: number | null } {
  const measurement = resolvePromotedSectionMeasurement(sectionId);
  if (measurement === null) {
    return { w: null, h: null };
  }
  if (
    !Number.isFinite(measurement.width) ||
    measurement.width <= 0 ||
    !Number.isFinite(measurement.height) ||
    measurement.height <= 0
  ) {
    throw new Error(
      `Promoted section ${sectionId} measurement must have positive finite dimensions.`,
    );
  }
  return { w: Math.round(measurement.width), h: Math.round(measurement.height) };
}

function appendPromotedTopLevelSections(
  state: WorkspaceDocumentState,
  topLevelSections: WorkspaceDocumentState["topLevelSections"],
  topLevelGroupIds: ReadonlyArray<string>,
  replacementIdsByGroupId: ReadonlyMap<string, Array<string>>,
  resolvePromotedSectionMeasurement: ResolveUngroupPromotedSectionMeasurement,
): void {
  let nextZIndex = getMaximumTopLevelZIndex(state) + 1;
  for (const groupId of topLevelGroupIds) {
    const groupLayout = state.topLevelSections[groupId];
    if (!groupLayout) {
      throw new Error(`Top-level group ${groupId} is missing its layout.`);
    }
    for (const sectionId of getReplacementIds(replacementIdsByGroupId, groupId)) {
      topLevelSections[sectionId] = {
        x: groupLayout.x,
        y: groupLayout.y,
        ...resolvePromotedTopLevelDimensions(sectionId, resolvePromotedSectionMeasurement),
        zIndex: nextZIndex,
      };
      nextZIndex += 1;
    }
  }
}

function buildTopLevelSections(
  state: WorkspaceDocumentState,
  groupIds: ReadonlyArray<string>,
  removedGroupIds: ReadonlySet<string>,
  replacementIdsByGroupId: ReadonlyMap<string, Array<string>>,
  resolvePromotedSectionMeasurement: ResolveUngroupPromotedSectionMeasurement,
): WorkspaceDocumentState["topLevelSections"] {
  const topLevelGroupIds = getTopLevelGroupIds(state, groupIds);
  const promotedIds = getPromotedTopLevelIds(topLevelGroupIds, replacementIdsByGroupId);
  const topLevelSections = copySurvivingTopLevelSections(state, removedGroupIds, promotedIds);
  appendPromotedTopLevelSections(
    state,
    topLevelSections,
    topLevelGroupIds,
    replacementIdsByGroupId,
    resolvePromotedSectionMeasurement,
  );
  return topLevelSections;
}

function getOriginalSiblingIds(state: WorkspaceDocumentState, sectionId: string): Array<string> {
  const parentId = getParentId(state, sectionId);
  if (parentId !== null) {
    return getSectionOrThrow(state, parentId).children;
  }
  return Object.keys(state.topLevelSections).filter(
    (candidateId) => getParentId(state, candidateId) === null,
  );
}

function getSurvivingReplacement(
  sectionId: string,
  removedGroupIds: ReadonlySet<string>,
  replacementIdsByGroupId: ReadonlyMap<string, Array<string>>,
): Array<string> {
  return removedGroupIds.has(sectionId)
    ? (replacementIdsByGroupId.get(sectionId) ?? [])
    : [sectionId];
}

type UngroupFocusContext = {
  nextState: WorkspaceDocumentState;
  removedGroupIds: ReadonlySet<string>;
  replacementIdsByGroupId: ReadonlyMap<string, Array<string>>;
  state: WorkspaceDocumentState;
};

function findFirstExistingSection(
  state: WorkspaceDocumentState,
  sectionIds: ReadonlyArray<string>,
): string | null {
  for (const sectionId of sectionIds) {
    if (state.sections[sectionId]) {
      return sectionId;
    }
  }
  return null;
}

function findLastExistingSection(
  state: WorkspaceDocumentState,
  sectionIds: ReadonlyArray<string>,
): string | null {
  for (let index = sectionIds.length - 1; index >= 0; index -= 1) {
    const sectionId = sectionIds[index];
    if (sectionId && state.sections[sectionId]) {
      return sectionId;
    }
  }
  return null;
}

function getSiblingFocusTarget(context: UngroupFocusContext, groupId: string): string | null {
  const siblings = getOriginalSiblingIds(context.state, groupId);
  const groupIndex = siblings.indexOf(groupId);
  if (groupIndex < 0) {
    throw new Error(`Group ${groupId} is missing from its rendered sibling order.`);
  }
  const before = siblings
    .slice(0, groupIndex)
    .flatMap((sectionId) =>
      getSurvivingReplacement(sectionId, context.removedGroupIds, context.replacementIdsByGroupId),
    );
  const after = siblings
    .slice(groupIndex + 1)
    .flatMap((sectionId) =>
      getSurvivingReplacement(sectionId, context.removedGroupIds, context.replacementIdsByGroupId),
    );
  return (
    findFirstExistingSection(context.nextState, after) ??
    findLastExistingSection(context.nextState, before)
  );
}

function resolveUngroupFocusTarget(
  context: UngroupFocusContext,
  groupId: string,
  resolving = new Set<string>(),
): string | null {
  const ownReplacement = getReplacementIds(context.replacementIdsByGroupId, groupId);
  if (ownReplacement[0]) {
    return ownReplacement[0];
  }
  if (resolving.has(groupId)) {
    throw new Error(`Ungroup focus resolution encountered a cycle at ${groupId}.`);
  }
  resolving.add(groupId);
  const siblingTarget = getSiblingFocusTarget(context, groupId);
  if (siblingTarget) {
    return siblingTarget;
  }

  const parentId = getParentId(context.state, groupId);
  if (parentId === null) {
    return null;
  }
  if (context.nextState.sections[parentId]) {
    return parentId;
  }
  return resolveUngroupFocusTarget(context, parentId, resolving);
}

export function prepareUngroupSections(
  state: WorkspaceDocumentState,
  activeSections: ActiveSectionsState,
  requestedGroupIds: ReadonlyArray<string>,
  resolvePromotedSectionMeasurement: ResolveUngroupPromotedSectionMeasurement,
): PreparedUngroupSections {
  const groupIds = normalizeGroupIds(requestedGroupIds);
  for (const groupId of groupIds) {
    validateGroup(state, groupId);
  }

  const removedGroupIds = new Set(groupIds);
  const replacementIdsByGroupId = new Map<string, Array<string>>();
  for (const groupId of groupIds) {
    replacementIdsByGroupId.set(
      groupId,
      expandRemovedGroups(state, getSectionOrThrow(state, groupId).children, removedGroupIds),
    );
  }
  const sections = buildSections(state, removedGroupIds);
  const nextDocument: WorkspaceDocumentState = {
    sections,
    topLevelSections: buildTopLevelSections(
      state,
      groupIds,
      removedGroupIds,
      replacementIdsByGroupId,
      resolvePromotedSectionMeasurement,
    ),
    viewport: state.viewport,
    parentSectionMap: buildParentSectionMap(sections),
  };
  const focusContext: UngroupFocusContext = {
    state,
    nextState: nextDocument,
    removedGroupIds,
    replacementIdsByGroupId,
  };
  const focusTargetByGroupId = new Map<string, string | null>();
  for (const groupId of groupIds) {
    focusTargetByGroupId.set(groupId, resolveUngroupFocusTarget(focusContext, groupId));
  }
  return {
    document: nextDocument,
    activeSections: {
      activeIds: activeSections.activeIds.filter((sectionId) => !removedGroupIds.has(sectionId)),
    },
    focusTargetByGroupId,
    groupIds,
  };
}
