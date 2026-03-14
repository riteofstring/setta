import { canUseManagedChatLLM } from "components/Chat/sharePolicyChatAccess";
import { useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { buildChatHistoryEntries } from "state/actions/chatHistory";
import { useProjectState, useShareSession } from "state/definitions";
import { useLoadProjectConfig } from "state/hooks/project";
import { useAIStore } from "state/stores/aiStore";
import { shallow } from "zustand/shallow";
import { LoadingSpinner } from "../LoadingSpinner";
import { NotFound } from "../NotFound/NotFound";
import { StandaloneProjectSurfaceRenderer } from "./StandaloneProjectSurfaceRenderer";
import { useStandaloneProjectSurfaceController } from "./standaloneProjectSurfaceController";
import {
  buildStandaloneSurfaceOwnerKey,
  resolveStandaloneDocumentTitle,
  resolveStandaloneSurfaceTarget,
} from "./standaloneProjectSurfaceRouting";
import {
  buildStandaloneManagedChatAuthorityState,
  resolveStandaloneManagedChatGuardState,
  resolveStandaloneProjectChatThreadTitle,
} from "./standaloneProjectSurfaceViewModel";

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
  const managedChatAuthorityState = useMemo(
    () =>
      buildStandaloneManagedChatAuthorityState({
        sections,
        sectionVariants,
        sectionImpls,
        sectionVariantMap,
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
  const projectChatThreadTitle = useMemo(
    () =>
      resolveStandaloneProjectChatThreadTitle({
        target,
        projectChatHistoryEntries,
      }),
    [projectChatHistoryEntries, target],
  );
  const resolvedDoneLoading = doneLoading === true;
  const resolvedIs404 = is404 === true;
  const canUseManagedChat = canUseManagedChatLLM({
    isDeploymentMode,
    allowLLM,
  });
  const standaloneSurfaceOwnerKey = buildStandaloneSurfaceOwnerKey(
    projectConfigId,
    target,
  );
  const routeStandaloneProjectChatId =
    target.kind === "project_chat_thread" ? target.chatId : null;
  const {
    standaloneSurfaceErrorState,
    setStandaloneSurfaceErrorCode,
    setStandaloneProjectChatId,
  } = useStandaloneProjectSurfaceController({
    projectConfigName,
    doneLoading: resolvedDoneLoading,
    is404: resolvedIs404,
    canUseManagedChat,
    standaloneSurfaceOwnerKey,
    standaloneProjectChatId: routeStandaloneProjectChatId,
    navigate,
  });
  const {
    standaloneProjectChatId,
    standaloneProjectChatThreadRouteInvalid,
    standaloneProjectChatThreadMissing,
    shouldBlockStandaloneManagedChat,
  } = useMemo(
    () =>
      resolveStandaloneManagedChatGuardState({
        target,
        standaloneSurfaceErrorState,
        standaloneSurfaceOwnerKey,
        managedChatAuthorityState,
        standaloneWindowSpace,
        canUseManagedChat,
      }),
    [
      canUseManagedChat,
      managedChatAuthorityState,
      standaloneSurfaceErrorState,
      standaloneSurfaceOwnerKey,
      standaloneWindowSpace,
      target,
    ],
  );

  useEffect(() => {
    document.title = resolveStandaloneDocumentTitle(
      projectConfigName,
      target,
      resolvedIs404,
      standaloneProjectChatThreadMissing
        ? "Thread Not Found"
        : projectChatThreadTitle,
    );
  }, [
    projectConfigName,
    projectChatThreadTitle,
    resolvedIs404,
    standaloneProjectChatThreadMissing,
    target,
  ]);

  if (!resolvedDoneLoading) {
    return <LoadingSpinner />;
  }

  if (resolvedIs404) {
    return <NotFound />;
  }

  return (
    <StandaloneProjectSurfaceRenderer
      target={target}
      projectConfigId={projectConfigId}
      standaloneProjectChatId={standaloneProjectChatId}
      standaloneProjectChatThreadRouteInvalid={
        standaloneProjectChatThreadRouteInvalid
      }
      standaloneProjectChatThreadMissing={standaloneProjectChatThreadMissing}
      shouldBlockStandaloneManagedChat={shouldBlockStandaloneManagedChat}
      standaloneWindowSpace={standaloneWindowSpace}
      canUseManagedChat={canUseManagedChat}
      managedChatAuthorityState={managedChatAuthorityState}
      setStandaloneProjectChatId={setStandaloneProjectChatId}
      setStandaloneSurfaceErrorCode={setStandaloneSurfaceErrorCode}
    />
  );
}
