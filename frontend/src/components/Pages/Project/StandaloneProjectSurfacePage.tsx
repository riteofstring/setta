import {
  canUseManagedChatLLM,
  type ManagedChatSurfaceAuthorityState,
} from "components/Chat/sharePolicyChatAccess";
import { useCodeMirrorStyleLoader } from "components/Utils/CodeMirror/useCodeMirrorStyleLoader";
import { useAddMouseLocationListener } from "forks/xyflow/core/utils/mouseLocation";
import { usePluginRuntimeBootstrap } from "plugins/runtime";
import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { buildChatHistoryEntries } from "state/actions/chatHistory";
import {
  useAIStore,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { useLoadProjectConfig } from "state/hooks/project";
import { resolveStandaloneSectionSlug } from "utils/sectionSlugPaths";
import { resolveStandaloneWindowSpaceSlug } from "utils/windowSpacePaths";
import { shallow } from "zustand/shallow";
import { StandaloneProjectSurfacePageStateBoundary } from "./StandaloneProjectSurfacePageStateBoundary";
import { type StandaloneSurfaceTarget } from "./StandaloneProjectSurfaceRouteBoundary";

function normalizeStandaloneChatId(
  chatId: string | null | undefined,
): string | null {
  const normalizedChatId = chatId?.trim() ?? "";
  if (!normalizedChatId) {
    return null;
  }
  return normalizedChatId;
}

function resolveStandaloneSurfaceTarget(
  state: Parameters<typeof resolveStandaloneSectionSlug>[0],
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

type StandaloneProjectSurfacePageLoadState = {
  doneLoading: boolean;
  is404: boolean;
};

export function StandaloneProjectSurfacePage() {
  const [doneLoading, is404] = useLoadProjectConfig();
  return (
    <StandaloneProjectSurfacePageWithLoadState
      doneLoading={doneLoading === true}
      is404={is404 === true}
    />
  );
}

export function StandaloneProjectSurfacePageWithLoadState({
  doneLoading,
  is404,
}: StandaloneProjectSurfacePageLoadState) {
  const { projectConfigName, sectionSlug, chatId, windowSpaceSlug } =
    useParams();
  const navigate = useNavigate();
  const target = useProjectState(
    (state) =>
      resolveStandaloneSurfaceTarget(
        state,
        sectionSlug,
        chatId,
        windowSpaceSlug,
      ),
    shallow,
  );
  const projectConfigId = useProjectState((state) => state.projectConfig.id);
  const { sections, sectionVariants, sectionImpls, sectionVariantMap } =
    useProjectState(
      (state) => ({
        sections: state.sections,
        sectionVariants: state.sectionVariants,
        sectionImpls: state.sectionImpls,
        sectionVariantMap: state.projectConfig.sectionVariantMap,
      }),
      shallow,
    );
  const managedChatAuthorityState = useMemo<ManagedChatSurfaceAuthorityState>(
    () => ({
      projectConfig: {
        sectionVariantMap,
      },
      sections,
      sectionVariants,
      sectionImpls,
    }),
    [sectionImpls, sectionVariantMap, sectionVariants, sections],
  );
  const standaloneWindowSpace = useProjectState((state) => {
    if (target.kind !== "window_space") {
      return null;
    }
    return state.projectConfig.windowSpaces[target.windowSpaceId] ?? null;
  }, shallow);
  const { isDeploymentMode, allowLLM } = useShareSession(
    (state) => ({
      isDeploymentMode: state.isDeploymentMode,
      allowLLM: state.sharePolicy?.allowLLM ?? false,
    }),
    shallow,
  );
  const agentRuns = useAIStore((state) => state.agentRuns);
  const projectChatHistoryEntries = useMemo(
    () =>
      buildChatHistoryEntries(agentRuns, {
        projectConfigId,
        unscopedOnly: true,
      }),
    [agentRuns, projectConfigId],
  );
  const resolvedDoneLoading = doneLoading === true;
  const resolvedIs404 = is404 === true;
  const canUseManagedChat = canUseManagedChatLLM({
    isDeploymentMode,
    allowLLM,
  });

  useCodeMirrorStyleLoader(resolvedDoneLoading, resolvedIs404);
  useAddMouseLocationListener();
  usePluginRuntimeBootstrap(resolvedDoneLoading && !resolvedIs404);

  return (
    <StandaloneProjectSurfacePageStateBoundary
      doneLoading={resolvedDoneLoading}
      is404={resolvedIs404}
      projectConfigName={projectConfigName}
      projectConfigId={projectConfigId}
      target={target}
      standaloneWindowSpace={standaloneWindowSpace}
      managedChatAuthorityState={managedChatAuthorityState}
      canUseManagedChat={canUseManagedChat}
      projectChatHistoryEntries={projectChatHistoryEntries}
      navigate={navigate}
    />
  );
}
