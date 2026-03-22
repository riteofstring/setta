import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import React from "react";
import { getExternalProjectChatWindowBindingForSectionInState } from "state/actions/projectChatWindowing";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import { useIsSectionUIActive } from "state/activeSectionUI";
import {
  useLocalStorage,
  useNodeInternals,
  useProjectState,
} from "state/definitions";
import {
  SectionTypeEnum,
  type ChatWindowMode,
  type ChatWindowPlacement,
  type SectionType,
} from "utils/generatedTypes";
import { Tier1DenseParamSectionPreview } from "../Layouts/Tier1DenseParamSectionPreview";
import { SectionAreaSwitch } from "./SectionAreaSwitch";
import {
  getAutoSectionBodyRequestedMode,
  getProjectedNodeSizePx,
  isAutoSectionBodyPreviewCandidate,
  resolveRequestedMode,
  SECTION_BODY_AUTO_MODE_THRESHOLDS,
  type SectionBodyFamily,
  type SectionBodyRequestedMode,
  type SectionBodyResolvedMode,
} from "./sectionBodyModePolicy";
import { SectionWindowPlaceholder } from "./SectionWindowPlaceholder";

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
  previewWarmPriority: number | null;
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

type PreviewOverlayNeighborhoodCache = {
  nodeInternals: ReturnType<typeof useNodeInternals.getState>["x"];
  projectSections: ReturnType<typeof useProjectState.getState>["sections"];
  transformX: number;
  transformY: number;
  zoom: number;
  width: number;
  height: number;
  overviewTrueWidth: number;
  result: string[];
};

let previewOverlayNeighborhoodCache: PreviewOverlayNeighborhoodCache | null =
  null;

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
): sectionTypeName is Extract<
  SectionType,
  "Callable" | "Dict" | "GlobalVariables"
> {
  return (
    sectionTypeName === SectionTypeEnum.Callable ||
    sectionTypeName === SectionTypeEnum.Dict ||
    sectionTypeName === SectionTypeEnum.GlobalVariables
  );
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

function getPreviewNeighborhoodCandidateIds({
  projectState,
  nodeInternals,
  transformX,
  transformY,
  zoom,
  width,
  height,
  overviewTrueWidth,
}: {
  projectState: ReturnType<typeof useProjectState.getState>;
  nodeInternals: ReturnType<typeof useNodeInternals.getState>["x"];
  transformX: number;
  transformY: number;
  zoom: number;
  width: number;
  height: number;
  overviewTrueWidth: number;
}): string[] {
  if (
    previewOverlayNeighborhoodCache?.nodeInternals === nodeInternals &&
    previewOverlayNeighborhoodCache.projectSections === projectState.sections &&
    previewOverlayNeighborhoodCache.transformX === transformX &&
    previewOverlayNeighborhoodCache.transformY === transformY &&
    previewOverlayNeighborhoodCache.zoom === zoom &&
    previewOverlayNeighborhoodCache.width === width &&
    previewOverlayNeighborhoodCache.height === height &&
    previewOverlayNeighborhoodCache.overviewTrueWidth === overviewTrueWidth
  ) {
    return previewOverlayNeighborhoodCache.result;
  }

  const paneRect = resolveCanvasPaneRect({
    transformX,
    transformY,
    zoom,
    width,
    height,
    overviewTrueWidth,
  });
  if (paneRect === null) {
    return [];
  }

  const expandedPaneRect = expandRect(
    paneRect,
    SECTION_BODY_AUTO_MODE_THRESHOLDS.previewOverlayNeighborhoodPaddingFraction,
  );
  const paneCenterX = paneRect.x + paneRect.width / 2;
  const paneCenterY = paneRect.y + paneRect.height / 2;
  const candidates: Array<{ id: string; distanceSq: number }> = [];

  for (const [nodeId, node] of nodeInternals.entries()) {
    if (node.width === null || node.height === null) {
      continue;
    }

    const nodeRect = {
      x: node.position.x,
      y: node.position.y,
      width: node.width,
      height: node.height,
    };
    if (!rectsOverlap(nodeRect, expandedPaneRect)) {
      continue;
    }

    const family = getSectionBodyFamily(
      getCurrEffectiveSectionImpl(projectState, nodeId).type,
    );
    const { projectedWidthPx, projectedHeightPx } = getProjectedNodeSizePx(
      node.width,
      node.height,
      zoom,
    );
    if (
      !isAutoSectionBodyPreviewCandidate({
        ownerKind: "canvas",
        family,
        isActiveSection: false,
        zoom,
        projectedWidthPx,
        projectedHeightPx,
      })
    ) {
      continue;
    }

    const nodeCenterX = node.position.x + node.width / 2;
    const nodeCenterY = node.position.y + node.height / 2;
    const distanceSq =
      (nodeCenterX - paneCenterX) * (nodeCenterX - paneCenterX) +
      (nodeCenterY - paneCenterY) * (nodeCenterY - paneCenterY);
    candidates.push({ id: nodeId, distanceSq });
  }

  candidates.sort(
    (a, b) => a.distanceSq - b.distanceSq || a.id.localeCompare(b.id),
  );

  const result = candidates.map((candidate) => candidate.id);

  previewOverlayNeighborhoodCache = {
    nodeInternals,
    projectSections: projectState.sections,
    transformX,
    transformY,
    zoom,
    width,
    height,
    overviewTrueWidth,
    result,
  };

  return result;
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
  const overviewTrueWidth = useLocalStorage((state) => state.overviewTrueWidth);
  const nodeInternals = useNodeInternals((state) => state.x);
  const previewWarmPhaseActive = usePreviewWarmPhaseActive(
    viewportInteractionActive,
  );

  return useProjectState((state) => {
    const impl = getCurrEffectiveSectionImpl(state, sectionId);
    const node = nodeInternals.get(sectionId) ?? null;
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
    const previewWarmCandidateIds =
      requestedMode === "auto" &&
      owner.kind === "canvas" &&
      previewWarmPhaseActive
        ? getPreviewNeighborhoodCandidateIds({
            projectState: state,
            nodeInternals,
            transformX,
            transformY,
            zoom: effectiveZoom,
            width,
            height,
            overviewTrueWidth,
          })
        : [];
    const previewOverlayCandidateIds =
      requestedMode === "auto" &&
      effectiveViewportInteractionActive &&
      owner.kind === "canvas"
        ? getPreviewNeighborhoodCandidateIds({
            projectState: state,
            nodeInternals,
            transformX,
            transformY,
            zoom: effectiveZoom,
            width,
            height,
            overviewTrueWidth,
          })
        : [];
    const previewWarmPriority =
      requestedMode === "auto"
        ? previewWarmCandidateIds
            .slice(0, SECTION_BODY_AUTO_MODE_THRESHOLDS.previewWarmMaxSections)
            .indexOf(sectionId)
        : 0;
    const previewWarmEligible =
      requestedMode === "auto" ? previewWarmPriority !== -1 : true;
    const previewOverlayEligible =
      requestedMode === "auto"
        ? previewOverlayCandidateIds
            .slice(
              0,
              SECTION_BODY_AUTO_MODE_THRESHOLDS.previewOverlayMaxVisibleSections,
            )
            .includes(sectionId)
        : true;
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
      previewWarmEligible,
      previewWarmPriority:
        previewWarmEligible || requestedMode !== "auto"
          ? previewWarmPriority
          : null,
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
          warmPriority={status.previewWarmPriority}
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
