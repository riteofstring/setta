import { type ComponentProps, useMemo } from "react";
import {
  useAIStore,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { shallow } from "zustand/shallow";
import { StandaloneProjectSurfacePageStateBoundary } from "./StandaloneProjectSurfacePageStateBoundary";
import {
  buildStandaloneProjectSurfacePageTargetProjectState,
  buildStandaloneProjectSurfacePageTargetState,
  canRenderStandaloneSurfaceTarget,
  type StandaloneProjectSurfacePageTargetProjectState,
  type StandaloneProjectSurfacePageTargetProjectStateRefs,
  type StandaloneProjectSurfacePageTargetRenderState,
} from "./standaloneProjectSurfacePageTargetState";

export type StandaloneProjectSurfacePageTargetBoundaryProps = Omit<
  ComponentProps<typeof StandaloneProjectSurfacePageStateBoundary>,
  | "projectConfigId"
  | "target"
  | "standaloneWindowSpace"
  | "managedChatAuthorityState"
  | "canUseManagedChat"
  | "projectChatHistoryEntries"
> & {
  sectionSlug: string | undefined;
  chatId: string | undefined;
  windowSpaceSlug: string | undefined;
};

function _StandaloneProjectSurfacePageTargetBoundary({
  sectionSlug,
  chatId,
  windowSpaceSlug,
  ...stateBoundaryProps
}: StandaloneProjectSurfacePageTargetBoundaryProps) {
  const projectStateRefs =
    useProjectState<StandaloneProjectSurfacePageTargetProjectStateRefs>(
      (state) =>
        ({
          projectConfigId: state.projectConfig.id,
          windowSpaces: state.projectConfig.windowSpaces,
          sectionVariantMap: state.projectConfig.sectionVariantMap,
          sections: state.sections,
          sectionVariants: state.sectionVariants,
          sectionImpls: state.sectionImpls,
          parentSectionMap: state.parentSectionMap,
        }) satisfies StandaloneProjectSurfacePageTargetProjectStateRefs,
      shallow,
    );
  const projectState = useMemo<StandaloneProjectSurfacePageTargetProjectState>(
    () => buildStandaloneProjectSurfacePageTargetProjectState(projectStateRefs),
    [projectStateRefs],
  );
  const { isDeploymentMode, allowLLM } = useShareSession(
    (state) => ({
      isDeploymentMode: state.isDeploymentMode,
      allowLLM: state.sharePolicy?.allowLLM ?? false,
    }),
    shallow,
  );
  const agentRuns = useAIStore((state) => state.agentRuns);
  const targetState = useMemo(
    () =>
      buildStandaloneProjectSurfacePageTargetState({
        projectState,
        sectionSlug,
        chatId,
        windowSpaceSlug,
        agentRuns,
        isDeploymentMode,
        allowLLM,
      }),
    [
      agentRuns,
      allowLLM,
      chatId,
      isDeploymentMode,
      projectState,
      sectionSlug,
      windowSpaceSlug,
    ],
  );
  const targetReady = useProjectState(
    (state) =>
      canRenderStandaloneSurfaceTarget({
        state: {
          projectConfig: {
            sectionVariantMap: state.projectConfig.sectionVariantMap,
          },
          sections: state.sections,
          sectionVariants: state.sectionVariants,
          sectionImpls: state.sectionImpls,
        } satisfies StandaloneProjectSurfacePageTargetRenderState,
        target: targetState.target,
      }),
    Object.is,
  );

  return (
    <StandaloneProjectSurfacePageStateBoundary
      {...stateBoundaryProps}
      {...targetState}
      doneLoading={stateBoundaryProps.doneLoading && targetReady}
    />
  );
}

export const StandaloneProjectSurfacePageTargetBoundary =
  _StandaloneProjectSurfacePageTargetBoundary;
