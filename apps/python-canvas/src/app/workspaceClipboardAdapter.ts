import type {
  JsonValue,
  WorkspaceClipboardPasteRequest,
} from "@riteofstring/setta";

import type {
  CopyProjectClipboardRequestV2,
  ProjectClipboardPayloadV1,
  ProjectSnapshotV2,
} from "../api/generatedContract";
import {
  CALLABLE_SECTION_KIND,
  LIST_SECTION_KIND,
  PARAMETER_DICTIONARY_SECTION_KIND,
} from "./workspaceProjection";
import { parameterDictionarySectionID } from "./workspaceProjectionDictionary";
import { callableSectionID, listSectionID } from "./workspaceProjectionIds";
import type {
  ProjectRootLayoutOverride,
  ProjectSectionPresentationOverride,
} from "./workspaceClipboardProjection";

type ClipboardSectionKind = "callable" | "dictionary" | "list";

type WorkspaceClipboardSection =
  WorkspaceClipboardPasteRequest["fragment"]["sections"][string];

type ClipboardSectionDescriptor = Readonly<{
  canonicalId: string;
  childCanonicalIds: ReadonlyArray<string>;
  kind: ClipboardSectionKind;
  workspaceId: string;
  workspaceKind: string;
}>;

export function createProjectClipboardCopyRequest(
  snapshot: ProjectSnapshotV2,
  workspaceRootIds: ReadonlyArray<string>,
): CopyProjectClipboardRequestV2 {
  return {
    observedRevision: snapshot.project.revision,
    projectId: snapshot.project.id,
    rootSectionIds: workspaceRootIds.map((workspaceRootId) =>
      canonicalProjectSectionIDFromWorkspaceSectionID(
        snapshot,
        workspaceRootId,
      ),
    ),
  };
}

export function canCopyProjectClipboardSelection(
  snapshot: ProjectSnapshotV2 | null,
  workspaceRootIds: ReadonlyArray<string>,
): boolean {
  if (snapshot === null || workspaceRootIds.length === 0) {
    return false;
  }
  const authoredWorkspaceIds = new Set([
    ...snapshot.callables.map((callable) => callableSectionID(callable.id)),
    ...snapshot.parameterDictionaries.map((dictionary) =>
      parameterDictionarySectionID(dictionary.id),
    ),
    ...snapshot.lists.map((list) => listSectionID(list.id)),
  ]);
  return workspaceRootIds.every((workspaceId) =>
    authoredWorkspaceIds.has(workspaceId),
  );
}

export function projectClipboardPayloadJsonValue(
  payload: ProjectClipboardPayloadV1,
): JsonValue {
  return payload as unknown as JsonValue;
}

export function createClipboardRootLayoutOverrides(
  request: WorkspaceClipboardPasteRequest,
  pastedRootSectionIds: ReadonlyArray<string>,
): ReadonlyMap<string, ProjectRootLayoutOverride> {
  if (
    request.rootIds.length !== request.fragment.roots.length ||
    request.rootIds.some(
      (rootId, index) => rootId !== request.fragment.roots[index],
    )
  ) {
    throw new Error(
      "Workspace clipboard roots do not match the copied fragment.",
    );
  }
  if (pastedRootSectionIds.length !== request.rootIds.length) {
    throw new Error(
      "Python Canvas clipboard paste did not return every copied root.",
    );
  }
  const overrides = new Map<string, ProjectRootLayoutOverride>();
  for (const [index, sourceRootId] of request.rootIds.entries()) {
    const pastedRootId = pastedRootSectionIds[index];
    const relativeLayout = request.fragment.topLevelLayouts[sourceRootId];
    if (pastedRootId === undefined || relativeLayout === undefined) {
      throw new Error(
        "Workspace clipboard paste is missing a copied root layout.",
      );
    }
    overrides.set(pastedRootId, {
      h: relativeLayout.h,
      w: relativeLayout.w,
      x: request.placement.x + relativeLayout.x,
      y: request.placement.y + relativeLayout.y,
    });
  }
  return overrides;
}

export function projectClipboardPastedWorkspaceRootIds(
  snapshot: ProjectSnapshotV2,
  pastedRootSectionIds: ReadonlyArray<string>,
): string[] {
  return pastedRootSectionIds.map((canonicalId) =>
    workspaceSectionIDFromCanonicalProjectSectionID(snapshot, canonicalId),
  );
}

export function createClipboardSectionPresentationOverrides(
  request: WorkspaceClipboardPasteRequest,
  payload: ProjectClipboardPayloadV1,
  snapshot: ProjectSnapshotV2,
  pastedRootSectionIds: ReadonlyArray<string>,
): ReadonlyMap<string, ProjectSectionPresentationOverride> {
  const sourceDescriptors = clipboardSectionDescriptors(payload);
  const destinationDescriptors = clipboardSectionDescriptors(snapshot);
  const sourceRootWorkspaceIds = payload.rootSectionIds.map(
    (canonicalId) =>
      requireClipboardSectionDescriptor(sourceDescriptors, canonicalId)
        .workspaceId,
  );
  if (
    !sameStringList(request.rootIds, request.fragment.roots) ||
    !sameStringList(request.rootIds, sourceRootWorkspaceIds)
  ) {
    throw new Error(
      "Workspace clipboard roots do not match the copied payload.",
    );
  }
  if (pastedRootSectionIds.length !== payload.rootSectionIds.length) {
    throw new Error(
      "Python Canvas clipboard paste did not return every payload root.",
    );
  }
  assertClipboardFragmentSections(request, sourceDescriptors);
  const pairedSourceIds = new Set<string>();
  const pairedDestinationIds = new Set<string>();
  const overrides = new Map<string, ProjectSectionPresentationOverride>();
  const pairSection = (
    sourceCanonicalId: string,
    destinationCanonicalId: string,
  ): void => {
    if (pairedSourceIds.has(sourceCanonicalId)) {
      throw new Error(
        `Python Canvas clipboard payload duplicates ${sourceCanonicalId}.`,
      );
    }
    if (pairedDestinationIds.has(destinationCanonicalId)) {
      throw new Error(
        `Python Canvas clipboard response duplicates ${destinationCanonicalId}.`,
      );
    }
    const source = requireClipboardSectionDescriptor(
      sourceDescriptors,
      sourceCanonicalId,
    );
    const destination = requireClipboardSectionDescriptor(
      destinationDescriptors,
      destinationCanonicalId,
    );
    if (source.kind !== destination.kind) {
      throw new Error(
        `Python Canvas clipboard response changed ${sourceCanonicalId} section kind.`,
      );
    }
    const sourceSection = request.fragment.sections[source.workspaceId];
    if (sourceSection === undefined) {
      throw new Error(
        `Workspace clipboard fragment is missing ${source.workspaceId}.`,
      );
    }
    pairedSourceIds.add(sourceCanonicalId);
    pairedDestinationIds.add(destinationCanonicalId);
    overrides.set(
      destinationCanonicalId,
      clipboardSectionPresentationOverride(sourceSection),
    );
    if (
      source.childCanonicalIds.length !== destination.childCanonicalIds.length
    ) {
      throw new Error(
        `Python Canvas clipboard response changed ${sourceCanonicalId} child count.`,
      );
    }
    for (const [index, sourceChildId] of source.childCanonicalIds.entries()) {
      const destinationChildId = destination.childCanonicalIds[index];
      if (destinationChildId === undefined) {
        throw new Error(
          `Python Canvas clipboard response is missing ${sourceChildId}.`,
        );
      }
      pairSection(sourceChildId, destinationChildId);
    }
  };
  for (const [index, sourceRootId] of payload.rootSectionIds.entries()) {
    const destinationRootId = pastedRootSectionIds[index];
    if (destinationRootId === undefined) {
      throw new Error(
        `Python Canvas clipboard response is missing ${sourceRootId}.`,
      );
    }
    pairSection(sourceRootId, destinationRootId);
  }
  if (pairedSourceIds.size !== sourceDescriptors.size) {
    throw new Error("Workspace clipboard payload has unreachable sections.");
  }
  return overrides;
}

function canonicalProjectSectionIDFromWorkspaceSectionID(
  snapshot: ProjectSnapshotV2,
  workspaceId: string,
): string {
  const callable = snapshot.callables.find(
    (candidate) => callableSectionID(candidate.id) === workspaceId,
  );
  if (callable !== undefined) {
    return callable.id;
  }
  const dictionary = snapshot.parameterDictionaries.find(
    (candidate) => parameterDictionarySectionID(candidate.id) === workspaceId,
  );
  if (dictionary !== undefined) {
    return dictionary.id;
  }
  const list = snapshot.lists.find(
    (candidate) => listSectionID(candidate.id) === workspaceId,
  );
  if (list !== undefined) {
    return list.id;
  }
  throw new Error(
    `Python Canvas clipboard section ${workspaceId} is not authored project content.`,
  );
}

function clipboardSectionDescriptors(
  snapshot: Pick<
    ProjectSnapshotV2,
    "callables" | "lists" | "parameterDictionaries"
  >,
): ReadonlyMap<string, ClipboardSectionDescriptor> {
  const descriptors = new Map<string, ClipboardSectionDescriptor>();
  const add = (descriptor: ClipboardSectionDescriptor): void => {
    if (descriptors.has(descriptor.canonicalId)) {
      throw new Error(
        `Python Canvas clipboard has duplicate ${descriptor.canonicalId}.`,
      );
    }
    descriptors.set(descriptor.canonicalId, descriptor);
  };
  for (const callable of snapshot.callables) {
    add({
      canonicalId: callable.id,
      childCanonicalIds: [],
      kind: "callable",
      workspaceId: callableSectionID(callable.id),
      workspaceKind: CALLABLE_SECTION_KIND,
    });
  }
  for (const dictionary of snapshot.parameterDictionaries) {
    add({
      canonicalId: dictionary.id,
      childCanonicalIds: [],
      kind: "dictionary",
      workspaceId: parameterDictionarySectionID(dictionary.id),
      workspaceKind: PARAMETER_DICTIONARY_SECTION_KIND,
    });
  }
  for (const list of snapshot.lists) {
    add({
      canonicalId: list.id,
      childCanonicalIds: list.childSectionIds,
      kind: "list",
      workspaceId: listSectionID(list.id),
      workspaceKind: LIST_SECTION_KIND,
    });
  }
  return descriptors;
}

function assertClipboardFragmentSections(
  request: WorkspaceClipboardPasteRequest,
  sourceDescriptors: ReadonlyMap<string, ClipboardSectionDescriptor>,
): void {
  const expectedWorkspaceIds = new Set(
    [...sourceDescriptors.values()].map((descriptor) => descriptor.workspaceId),
  );
  const fragmentWorkspaceIds = Object.keys(request.fragment.sections);
  if (
    fragmentWorkspaceIds.length !== expectedWorkspaceIds.size ||
    fragmentWorkspaceIds.some(
      (workspaceId) => !expectedWorkspaceIds.has(workspaceId),
    )
  ) {
    throw new Error(
      "Workspace clipboard fragment does not match the copied payload sections.",
    );
  }
  for (const source of sourceDescriptors.values()) {
    const section = request.fragment.sections[source.workspaceId];
    if (section === undefined || section.id !== source.workspaceId) {
      throw new Error(
        `Workspace clipboard fragment is missing ${source.workspaceId}.`,
      );
    }
    if (section.kind !== source.workspaceKind) {
      throw new Error(
        `Workspace clipboard fragment kind does not match ${source.workspaceId}.`,
      );
    }
    const expectedChildWorkspaceIds = source.childCanonicalIds.map(
      (canonicalId) =>
        requireClipboardSectionDescriptor(sourceDescriptors, canonicalId)
          .workspaceId,
    );
    if (!sameStringList(section.children, expectedChildWorkspaceIds)) {
      throw new Error(
        `Workspace clipboard fragment children do not match ${source.workspaceId}.`,
      );
    }
  }
}

function requireClipboardSectionDescriptor(
  descriptors: ReadonlyMap<string, ClipboardSectionDescriptor>,
  canonicalId: string,
): ClipboardSectionDescriptor {
  const descriptor = descriptors.get(canonicalId);
  if (descriptor === undefined) {
    throw new Error(
      `Python Canvas clipboard payload is missing ${canonicalId}.`,
    );
  }
  return descriptor;
}

function clipboardSectionPresentationOverride(
  section: WorkspaceClipboardSection,
): ProjectSectionPresentationOverride {
  return {
    isHorizontalOrientation: section.isHorizontalOrientation,
    isMinimized: section.isMinimized,
    overflowMode: section.overflowMode,
    positionAndSizeLocked: section.positionAndSizeLocked,
    size: { ...section.size },
    styleColor: section.styleColor,
    tagColor: section.tagColor,
  };
}

function sameStringList(
  left: ReadonlyArray<string>,
  right: ReadonlyArray<string>,
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function workspaceSectionIDFromCanonicalProjectSectionID(
  snapshot: ProjectSnapshotV2,
  canonicalId: string,
): string {
  if (snapshot.callables.some((candidate) => candidate.id === canonicalId)) {
    return callableSectionID(canonicalId);
  }
  if (
    snapshot.parameterDictionaries.some(
      (candidate) => candidate.id === canonicalId,
    )
  ) {
    return parameterDictionarySectionID(canonicalId);
  }
  if (snapshot.lists.some((candidate) => candidate.id === canonicalId)) {
    return listSectionID(canonicalId);
  }
  throw new Error(
    `Python Canvas clipboard response is missing ${canonicalId}.`,
  );
}
