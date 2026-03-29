import {
  renderDefaultSectionContainerCoreBody,
  renderDefaultSectionContainerNestedSections,
} from "components/Section/Container/sectionContainerDefaultRenderers";
import _ from "lodash";
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
} from "./standaloneProjectSurfacePageTargetState";

export type StandaloneProjectSurfacePageTargetBoundaryProps = Omit<
  ComponentProps<typeof StandaloneProjectSurfacePageStateBoundary>,
  | "projectConfigId"
  | "target"
  | "standaloneWindowSpace"
  | "managedChatAuthorityState"
  | "canUseManagedChat"
  | "projectChatHistoryEntries"
  | "renderCoreBody"
  | "renderNestedSections"
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
  const projectState =
    useProjectState<StandaloneProjectSurfacePageTargetProjectState>(
      (state) =>
        buildStandaloneProjectSurfacePageTargetProjectState({
          projectConfigId: state.projectConfig.id,
          windowSpaces: state.projectConfig.windowSpaces,
          sectionVariantMap: state.projectConfig.sectionVariantMap,
          sections: state.sections,
          sectionVariants: state.sectionVariants,
          sectionImpls: state.sectionImpls,
          parentSectionMap: state.parentSectionMap,
        }),
      _.isEqual,
    );
  const { isDeploymentMode, allowLLM } = useShareSession(
    (state) => ({
      isDeploymentMode: state.isDeploymentMode,
      allowLLM: state.sharePolicy?.allowLLM ?? false,
    }),
    shallow,
  );
  const agentRuns = useAIStore((state) => state.agentRuns);
  const { targetReady, targetState } = useMemo(() => {
    const nextTargetState = buildStandaloneProjectSurfacePageTargetState({
      projectState,
      sectionSlug,
      chatId,
      windowSpaceSlug,
      agentRuns,
      isDeploymentMode,
      allowLLM,
    });
    return {
      targetReady: canRenderStandaloneSurfaceTarget({
        state: projectState,
        target: nextTargetState.target,
      }),
      targetState: nextTargetState,
    };
  }, [
    agentRuns,
    allowLLM,
    chatId,
    isDeploymentMode,
    projectState,
    sectionSlug,
    windowSpaceSlug,
  ]);

  return (
    <StandaloneProjectSurfacePageStateBoundary
      {...stateBoundaryProps}
      {...targetState}
      doneLoading={stateBoundaryProps.doneLoading && targetReady}
      renderCoreBody={renderDefaultSectionContainerCoreBody}
      renderNestedSections={renderDefaultSectionContainerNestedSections}
    />
  );
}

export const StandaloneProjectSurfacePageTargetBoundary =
  _StandaloneProjectSurfacePageTargetBoundary;
