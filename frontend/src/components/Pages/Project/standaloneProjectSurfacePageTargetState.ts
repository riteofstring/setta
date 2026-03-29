import {
  canUseManagedChatLLM,
  type ManagedChatSurfaceAuthorityState,
} from "components/Chat/sharePolicyChatAccess";
import { buildChatHistoryEntries } from "state/actions/chatHistory";
import type { ZustandProjectState } from "state/definitions";
import {
  isBaseParentSectionImpl,
  type BaseSectionImplUnion,
  type WindowSpaceConfig,
} from "utils/generatedTypes";
import { resolveStandaloneSectionSlug } from "utils/sectionSlugPaths";
import { resolveStandaloneWindowSpaceSlug } from "utils/windowSpacePaths";
import type { StandaloneSurfaceTarget } from "./StandaloneProjectSurfaceRouteBoundary";

function normalizeStandaloneChatId(
  chatId: string | null | undefined,
): string | null {
  const normalizedChatId = chatId?.trim() ?? "";
  if (!normalizedChatId) {
    return null;
  }
  return normalizedChatId;
}

export type StandaloneProjectSurfacePageTargetProjectState = Pick<
  ZustandProjectState,
  "sections" | "sectionVariants" | "sectionImpls" | "parentSectionMap"
> & {
  projectConfig: Pick<
    ZustandProjectState["projectConfig"],
    "id" | "windowSpaces" | "sectionVariantMap"
  >;
};

export type StandaloneProjectSurfacePageTargetProjectStateRefs = {
  projectConfigId: ZustandProjectState["projectConfig"]["id"];
  windowSpaces: ZustandProjectState["projectConfig"]["windowSpaces"];
  sectionVariantMap: ZustandProjectState["projectConfig"]["sectionVariantMap"];
  sections: ZustandProjectState["sections"];
  sectionVariants: ZustandProjectState["sectionVariants"];
  sectionImpls: ZustandProjectState["sectionImpls"];
  parentSectionMap: ZustandProjectState["parentSectionMap"];
};

export type StandaloneProjectSurfacePageTargetStateInput = {
  projectState: StandaloneProjectSurfacePageTargetProjectState;
  sectionSlug: string | undefined;
  chatId: string | undefined;
  windowSpaceSlug: string | undefined;
  agentRuns: Parameters<typeof buildChatHistoryEntries>[0];
  isDeploymentMode: boolean;
  allowLLM: boolean;
};

export type StandaloneProjectSurfacePageTargetState = {
  projectConfigId: string;
  target: StandaloneSurfaceTarget;
  standaloneWindowSpace: WindowSpaceConfig | null;
  managedChatAuthorityState: ManagedChatSurfaceAuthorityState;
  canUseManagedChat: boolean;
  projectChatHistoryEntries: ReturnType<typeof buildChatHistoryEntries>;
};

export type StandaloneProjectSurfacePageTargetRenderState = Pick<
  ZustandProjectState,
  "sections" | "sectionVariants" | "sectionImpls"
> & {
  projectConfig: Pick<
    ZustandProjectState["projectConfig"],
    "sectionVariantMap"
  >;
};

function getRenderableStandaloneSectionImpl(
  state: StandaloneProjectSurfacePageTargetRenderState,
  sectionId: string,
): BaseSectionImplUnion | null {
  const variantId = state.projectConfig.sectionVariantMap[sectionId];
  if (variantId === undefined) {
    return null;
  }
  const variant = state.sectionVariants[variantId];
  if (!variant) {
    return null;
  }
  const impl = state.sectionImpls[variant.impl];
  if (!impl) {
    return null;
  }
  const core = state.sections[sectionId];
  if (!core) {
    return null;
  }

  return {
    ...impl,
    ...core.sharedModifier,
    ...variant.modifier,
  } as BaseSectionImplUnion;
}

function canRenderStandaloneSectionSubtree(
  state: StandaloneProjectSurfacePageTargetRenderState,
  sectionId: string,
  visited = new Set<string>(),
): boolean {
  if (visited.has(sectionId)) {
    return true;
  }
  visited.add(sectionId);

  const impl = getRenderableStandaloneSectionImpl(state, sectionId);
  if (!impl) {
    return false;
  }
  if (!isBaseParentSectionImpl(impl)) {
    return true;
  }

  for (const childId of impl.children) {
    if (!canRenderStandaloneSectionSubtree(state, childId, visited)) {
      return false;
    }
  }
  return true;
}

export function buildStandaloneProjectSurfacePageTargetProjectState({
  projectConfigId,
  windowSpaces,
  sectionVariantMap,
  sections,
  sectionVariants,
  sectionImpls,
  parentSectionMap,
}: StandaloneProjectSurfacePageTargetProjectStateRefs): StandaloneProjectSurfacePageTargetProjectState {
  return {
    projectConfig: {
      id: projectConfigId,
      windowSpaces,
      sectionVariantMap,
    },
    sections,
    sectionVariants,
    sectionImpls,
    parentSectionMap,
  };
}

export function canRenderStandaloneSurfaceTarget({
  state,
  target,
}: {
  state: StandaloneProjectSurfacePageTargetRenderState;
  target: StandaloneSurfaceTarget;
}): boolean {
  if (target.kind !== "section") {
    return true;
  }
  return canRenderStandaloneSectionSubtree(state, target.sectionId);
}

export function resolveStandaloneSurfaceTarget(
  state: StandaloneProjectSurfacePageTargetProjectState,
  sectionSlug: string | undefined,
  chatId: string | undefined,
  windowSpaceSlug: string | undefined,
): StandaloneSurfaceTarget {
  const normalizedChatId = normalizeStandaloneChatId(chatId);
  if (normalizedChatId) {
    return {
      kind: "project_chat_thread",
      chatId: normalizedChatId,
    };
  }
  if (chatId !== undefined) {
    return { kind: "project_chat_thread_not_found" };
  }
  if (windowSpaceSlug) {
    const resolution = resolveStandaloneWindowSpaceSlug(state, windowSpaceSlug);
    if (resolution.kind !== "found") {
      return { kind: "window_space_not_found" };
    }
    return {
      kind: "window_space",
      windowSpaceId: resolution.windowSpaceId,
      windowSpaceName: resolution.windowSpace.name,
    };
  }
  if (!sectionSlug) {
    return { kind: "project_chat" };
  }
  const resolution = resolveStandaloneSectionSlug(state, sectionSlug);
  if (resolution.kind !== "found") {
    return { kind: "section_not_found" };
  }
  return {
    kind: "section",
    sectionId: resolution.sectionId,
    sectionName: resolution.sectionName,
    sectionType: resolution.sectionType,
  };
}

export function buildStandaloneProjectSurfacePageTargetState({
  projectState,
  sectionSlug,
  chatId,
  windowSpaceSlug,
  agentRuns,
  isDeploymentMode,
  allowLLM,
}: StandaloneProjectSurfacePageTargetStateInput): StandaloneProjectSurfacePageTargetState {
  const target = resolveStandaloneSurfaceTarget(
    projectState,
    sectionSlug,
    chatId,
    windowSpaceSlug,
  );
  const standaloneWindowSpace =
    target.kind === "window_space"
      ? projectState.projectConfig.windowSpaces[target.windowSpaceId] ?? null
      : null;
  const managedChatAuthorityState: ManagedChatSurfaceAuthorityState = {
    projectConfig: {
      sectionVariantMap: projectState.projectConfig.sectionVariantMap,
    },
    sections: projectState.sections,
    sectionVariants: projectState.sectionVariants,
    sectionImpls: projectState.sectionImpls,
  };

  return {
    projectConfigId: projectState.projectConfig.id,
    target,
    standaloneWindowSpace,
    managedChatAuthorityState,
    canUseManagedChat: canUseManagedChatLLM({
      isDeploymentMode,
      allowLLM,
    }),
    projectChatHistoryEntries: buildChatHistoryEntries(agentRuns, {
      projectConfigId: projectState.projectConfig.id,
      unscopedOnly: true,
    }),
  };
}
