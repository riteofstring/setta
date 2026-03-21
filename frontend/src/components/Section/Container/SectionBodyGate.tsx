import _ from "lodash";
import { useReactFlow } from "forks/xyflow/core/store";
import React from "react";
import { getExternalProjectChatWindowBindingForSectionInState } from "state/actions/projectChatWindowing";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import { useIsSectionUIActive } from "state/activeSectionUI";
import { useNodeInternals, useProjectState } from "state/definitions";
import {
  SectionTypeEnum,
  type ChatWindowMode,
  type ChatWindowPlacement,
  type SectionType,
} from "utils/generatedTypes";
import {
  getAutoSectionBodyRequestedMode,
  getProjectedNodeSizePx,
  resolveRequestedMode,
  type SectionBodyFamily,
  type SectionBodyRequestedMode,
  type SectionBodyResolvedMode,
} from "./sectionBodyModePolicy";
import { SectionAreaSwitch } from "./SectionAreaSwitch";
import { SectionWindowPlaceholder } from "./SectionWindowPlaceholder";
import { Tier1DenseParamSectionPreview } from "../Layouts/Tier1DenseParamSectionPreview";

export type SectionBodyOwner =
  | {
      kind: "canvas";
      bgColor: string;
      isUserView: boolean;
    }
  | {
      kind: "window";
      bgColor: string;
      chatHost: ChatWindowPlacement | "standalone_page";
      chatModeOverride?: ChatWindowMode | undefined;
      projectChatSurfaceId?: string | undefined;
      projectChatId?: string | null | undefined;
      setProjectChatId?: (
        next: React.SetStateAction<string | null | undefined>,
      ) => void;
      onProjectChatBlockedErrorCodeChange?:
        | ((errorCode: string | null) => void)
        | undefined;
    };

export type ResolvedSectionBodyStatus = {
  sectionTypeName: SectionType;
  family: SectionBodyFamily;
  requestedMode: SectionBodyRequestedMode;
  resolvedMode: SectionBodyResolvedMode;
  isMinimized: boolean;
  externalizedWindowId: string | null;
  isActiveSection: boolean;
  viewportInteractionActive: boolean;
  zoom: number;
  projectedWidthPx: number | null;
  projectedHeightPx: number | null;
};

type SectionBodyGateProps = {
  sectionId: string;
  owner: SectionBodyOwner;
  requestedMode?: SectionBodyRequestedMode;
};

export function getSectionBodyFamily(
  sectionTypeName: SectionType,
): SectionBodyFamily {
  switch (sectionTypeName) {
    case SectionTypeEnum.Callable:
    case SectionTypeEnum.Dict:
    case SectionTypeEnum.GlobalVariables:
      return "tier1-dense-params";
    case SectionTypeEnum.Code:
    case SectionTypeEnum.GenPythonCode:
    case SectionTypeEnum.GenPythonMetadata:
      return "tier2-code";
    case SectionTypeEnum.Chat:
      return "chat";
    case SectionTypeEnum.Browser:
    case SectionTypeEnum.Draw:
    case SectionTypeEnum.Chart:
    case SectionTypeEnum.Prompt:
    case SectionTypeEnum.TextBlock:
      return "sparse-local";
    default:
      return "generic";
  }
}

function isTier1DenseParamSectionType(
  sectionTypeName: SectionType,
): sectionTypeName is Extract<SectionType, "Callable" | "Dict" | "GlobalVariables"> {
  return (
    sectionTypeName === SectionTypeEnum.Callable ||
    sectionTypeName === SectionTypeEnum.Dict ||
    sectionTypeName === SectionTypeEnum.GlobalVariables
  );
}

export function useResolvedSectionBodyStatus({
  sectionId,
  owner,
  requestedMode = "auto",
}: SectionBodyGateProps): ResolvedSectionBodyStatus {
  const isActiveSection = useIsSectionUIActive(sectionId);
  const { viewportInteractionActive, zoom } = useReactFlow(
    (state) => ({
      viewportInteractionActive: state.viewportInteractionActive,
      zoom: state.transform[2],
    }),
    _.isEqual,
  );
  const node = useNodeInternals((state) => state.x.get(sectionId), _.isEqual);

  return useProjectState((state) => {
    const impl = getCurrEffectiveSectionImpl(state, sectionId);
    const externalizedWindowId =
      owner.kind === "canvas" && impl.type !== SectionTypeEnum.Chat
        ? getExternalProjectChatWindowBindingForSectionInState(
            state.projectChatWindowing,
            sectionId,
          )?.instanceId ?? null
        : null;
    const family = getSectionBodyFamily(impl.type);
    const effectiveViewportInteractionActive =
      owner.kind === "canvas" ? viewportInteractionActive : false;
    const effectiveZoom = owner.kind === "canvas" ? zoom : 1;
    const { projectedWidthPx, projectedHeightPx } = getProjectedNodeSizePx(
      node?.width ?? null,
      node?.height ?? null,
      effectiveZoom,
    );
    const nextRequestedMode =
      requestedMode === "auto"
        ? getAutoSectionBodyRequestedMode({
            ownerKind: owner.kind,
            family,
            isActiveSection,
            viewportInteractionActive: effectiveViewportInteractionActive,
            zoom: effectiveZoom,
            projectedWidthPx,
            projectedHeightPx,
          })
        : requestedMode;

    return {
      sectionTypeName: impl.type,
      family,
      requestedMode: nextRequestedMode,
      resolvedMode: resolveRequestedMode(nextRequestedMode, impl.isMinimized),
      isMinimized: impl.isMinimized,
      externalizedWindowId,
      isActiveSection,
      viewportInteractionActive: effectiveViewportInteractionActive,
      zoom: effectiveZoom,
      projectedWidthPx,
      projectedHeightPx,
    };
  }, _.isEqual);
}

export const SectionBodyGate = React.memo(function SectionBodyGate({
  sectionId,
  owner,
  requestedMode = "auto",
}: SectionBodyGateProps) {
  const status = useResolvedSectionBodyStatus({
    sectionId,
    owner,
    requestedMode,
  });

  if (status.externalizedWindowId) {
    return (
      <SectionWindowPlaceholder
        instanceId={status.externalizedWindowId}
        sectionId={sectionId}
        dataTestId="section-canvas-window-placeholder"
      />
    );
  }

  if (status.resolvedMode === "skip") {
    return null;
  }

  if (
    status.resolvedMode === "preview" &&
    isTier1DenseParamSectionType(status.sectionTypeName)
  ) {
    return (
      <Tier1DenseParamSectionPreview
        sectionId={sectionId}
        sectionTypeName={status.sectionTypeName}
      />
    );
  }

  if (owner.kind === "canvas") {
    return (
      <SectionAreaSwitch
        sectionId={sectionId}
        sectionTypeName={status.sectionTypeName}
        bgColor={owner.bgColor}
        isMinimized={status.isMinimized}
        isUserView={owner.isUserView}
      />
    );
  }

  return (
    <SectionAreaSwitch
      sectionId={sectionId}
      sectionTypeName={status.sectionTypeName}
      bgColor={owner.bgColor}
      isMinimized={status.isMinimized}
      isUserView={false}
      chatHost={owner.chatHost}
      {...(owner.chatModeOverride === undefined
        ? {}
        : { chatModeOverride: owner.chatModeOverride })}
      {...(owner.projectChatSurfaceId === undefined
        ? {}
        : { projectChatSurfaceId: owner.projectChatSurfaceId })}
      {...(owner.projectChatId === undefined
        ? {}
        : { projectChatId: owner.projectChatId })}
      {...(owner.setProjectChatId === undefined
        ? {}
        : { setProjectChatId: owner.setProjectChatId })}
      {...(owner.onProjectChatBlockedErrorCodeChange === undefined
        ? {}
        : {
            onProjectChatBlockedErrorCodeChange:
              owner.onProjectChatBlockedErrorCodeChange,
          })}
    />
  );
});
