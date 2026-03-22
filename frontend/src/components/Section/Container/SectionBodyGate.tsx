import _ from "lodash";
import { useReactFlow } from "forks/xyflow/core/store";
import type { Node } from "forks/xyflow/core/types";
import React from "react";
import { getExternalProjectChatWindowBindingForSectionInState } from "state/actions/projectChatWindowing";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import { useIsSectionUIActive } from "state/activeSectionUI";
import { useLocalStorage, useNodeInternals, useProjectState } from "state/definitions";
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
  SECTION_BODY_AUTO_MODE_THRESHOLDS,
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
  previewWarmEligible: boolean;
  previewOverlayEligible: boolean;
};

type SectionBodyGateProps = {
  sectionId: string;
  owner: SectionBodyOwner;
  requestedMode?: SectionBodyRequestedMode;
};

type FlowRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type PreviewLocality = "visible" | "warm" | "far";

function usePreviewWarmPhaseActive(
  viewportInteractionActive: boolean,
): boolean {
  const [previewWarmPhaseActive, setPreviewWarmPhaseActive] = React.useState(
    viewportInteractionActive,
  );

  React.useEffect(() => {
    if (viewportInteractionActive) {
      setPreviewWarmPhaseActive(true);
      return;
    }

    const timeout = window.setTimeout(() => {
      setPreviewWarmPhaseActive(false);
    }, SECTION_BODY_AUTO_MODE_THRESHOLDS.previewWarmCooldownMs);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [viewportInteractionActive]);

  return previewWarmPhaseActive;
}

function resolveCanvasPaneRect({
  transformX,
  transformY,
  zoom,
  width,
  height,
  overviewTrueWidth,
}: {
  transformX: number;
  transformY: number;
  zoom: number;
  width: number;
  height: number;
  overviewTrueWidth: number;
}): FlowRect | null {
  if (!Number.isFinite(zoom) || zoom <= 0 || width <= 0 || height <= 0) {
    return null;
  }

  return {
    x: (-transformX + overviewTrueWidth) / zoom,
    y: -transformY / zoom,
    width: width / zoom,
    height: height / zoom,
  };
}

function expandRect(rect: FlowRect, paddingFraction: number): FlowRect {
  const paddingX = rect.width * paddingFraction;
  const paddingY = rect.height * paddingFraction;

  return {
    x: rect.x - paddingX,
    y: rect.y - paddingY,
    width: rect.width + paddingX * 2,
    height: rect.height + paddingY * 2,
  };
}

function rectsOverlap(a: FlowRect, b: FlowRect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function resolvePreviewLocality({
  node,
  paneRect,
  previewWarmPhaseActive,
}: {
  node: Node | null;
  paneRect: FlowRect | null;
  previewWarmPhaseActive: boolean;
}): PreviewLocality {
  if (
    paneRect === null ||
    node === null ||
    node.width === null ||
    node.height === null ||
    node.width <= 0 ||
    node.height <= 0
  ) {
    return "far";
  }

  const nodeRect = {
    x: node.position.x,
    y: node.position.y,
    width: node.width,
    height: node.height,
  };

  if (rectsOverlap(nodeRect, paneRect)) {
    return "visible";
  }

  if (!previewWarmPhaseActive) {
    return "far";
  }

  const warmPaneRect = expandRect(
    paneRect,
    SECTION_BODY_AUTO_MODE_THRESHOLDS.previewWarmNeighborhoodPaddingFraction,
  );

  return rectsOverlap(nodeRect, warmPaneRect) ? "warm" : "far";
}

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
  const {
    viewportInteractionActive,
    transformX,
    transformY,
    zoom,
    width,
    height,
  } = useReactFlow(
    (state) => ({
      viewportInteractionActive: state.viewportInteractionActive,
      transformX: state.transform[0],
      transformY: state.transform[1],
      zoom: state.transform[2],
      width: state.width,
      height: state.height,
    }),
    _.isEqual,
  );
  const node = useNodeInternals((state) => state.x.get(sectionId), _.isEqual);
  const overviewTrueWidth = useLocalStorage((state) => state.overviewTrueWidth);
  const previewWarmPhaseActive = usePreviewWarmPhaseActive(
    owner.kind === "canvas" ? viewportInteractionActive : false,
  );
  const paneRect =
    owner.kind === "canvas"
      ? resolveCanvasPaneRect({
          transformX,
          transformY,
          zoom,
          width,
          height,
          overviewTrueWidth,
        })
      : null;
  const previewLocality =
    owner.kind === "canvas"
      ? resolvePreviewLocality({
          node: node ?? null,
          paneRect,
          previewWarmPhaseActive,
        })
      : "far";

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
    const previewWarmEligible =
      requestedMode === "auto"
        ? previewLocality !== "far"
        : nextRequestedMode === "preview";
    const previewOverlayEligible =
      requestedMode === "auto" ? previewLocality === "visible" : true;

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
      previewWarmEligible,
      previewOverlayEligible,
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

  if (owner.kind === "canvas") {
    const sectionArea = (
      <SectionAreaSwitch
        sectionId={sectionId}
        sectionTypeName={status.sectionTypeName}
        bgColor={owner.bgColor}
        isMinimized={status.isMinimized}
        isUserView={owner.isUserView}
      />
    );

    if (isTier1DenseParamSectionType(status.sectionTypeName)) {
      return (
        <Tier1DenseParamSectionPreview
          sectionId={sectionId}
          isActiveSection={status.isActiveSection}
          shouldWarmPreview={status.previewWarmEligible}
          showPreview={
            status.resolvedMode === "preview" && status.previewOverlayEligible
          }
        >
          {sectionArea}
        </Tier1DenseParamSectionPreview>
      );
    }

    return sectionArea;
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
