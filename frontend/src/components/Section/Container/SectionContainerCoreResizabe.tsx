import { buildWorkspaceSectionProjectChatSurfaceId } from "components/ChatWindowing/projectChatSurfaceIds";
import { UnifiedChatSurface } from "components/ChatWindowing/UnifiedChatSurface";
import { CustomResizable } from "components/Utils/Resizable/CustomResizable";
import { useGraphSurfaceImplementation } from "forks/xyflow/core/container/graphSurfaceImplementation";
import { isCanvasOwnedSectionMotionHiddenBody } from "forks/xyflow/core/container/sectionShellCanvasOwnership";
import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import type { SetStateAction } from "react";
import React from "react";
import {
  getExternalProjectChatWindowBindingForSectionInState,
  getProjectChatWindowModeForSectionInState,
} from "state/actions/projectChatWindowing";
import {
  getCurrEffectiveSectionImpl,
  getEmbeddedAttachedTerminalForCodeSection,
} from "state/actions/sectionInfos";
import { useActiveSectionUI } from "state/activeSectionUI";
import { getIsRoot } from "state/actions/uiTypes/utils";
import { useProjectState, type ZustandProjectState } from "state/definitions";
import {
  ChatWindowModeEnum,
  SectionTypeEnum,
  type ChatWindowMode,
  type ChatWindowPlacement,
  type SectionType,
} from "utils/generatedTypes";
import { SectionHeader } from "../Header/SectionHeader";
import { SectionWindowToggleButton } from "../Header/SectionWindowToggleButton";
import { BrowserArea } from "../Layouts/BrowserArea";
import { CallableArea } from "../Layouts/CallableArea";
import { ChartArea } from "../Layouts/ChartArea/ChartArea";
import {
  CodeArea,
  GenPythonCodeArea,
  GenPythonMetadataArea,
} from "../Layouts/CodeArea";
import { DictArea } from "../Layouts/DictArea";
import { DrawArea } from "../Layouts/DrawArea/DrawArea";
import { GlobalVariablesArea } from "../Layouts/GlobalVariablesArea";
import { IframeArea } from "../Layouts/IframeArea";
import { ImageArea } from "../Layouts/ImageArea";
import { MetaControlArea } from "../Layouts/MetaControlArea";
import { PluginArea } from "../Layouts/PluginArea";
import { PromptArea } from "../Layouts/PromptArea";
import { SocialArea } from "../Layouts/SocialArea";
import { SpreadsheetArea } from "../Layouts/SpreadsheetArea";
import { StateMachineNodeArea } from "../Layouts/StateMachineNodeArea";
import { TaskBoardArea } from "../Layouts/TaskBoardArea";
import { TerminalArea } from "../Layouts/TerminalArea";
import { TextBlock } from "../Layouts/TextBlock";
import { Incrementer } from "../SectionParts/Incrementer";
import "./dndline.css";
import { MetaControlMenuButton } from "./MetaControlMenuButton";
import { SectionWindowPlaceholder } from "./SectionWindowPlaceholder";
import { TextBlockMetaControlMenuButton } from "./TextBlockMetaControlMenuButton";
import { getBgColor } from "./utils";

type SectionContainerCoreResizableProps = {
  sectionId: string;
  sectionTypeName: SectionType;
  isInOtherProjectConfigs: boolean;
  isUserView: boolean;
  positionAndSizeLocked: boolean;
  hasSectionStyleTheme: boolean;
  hideHeader?: boolean;
};

type SectionContainerResizableSnapshot = {
  isMinimized: boolean;
  isYouTube: boolean;
  textBlockMetaControlStyle: boolean;
  hasEmbeddedTerminal: boolean;
};

type AreaSwitchProps = {
  sectionId: string;
  sectionTypeName: SectionType;
  bgColor: string;
  isMinimized: boolean;
  isUserView: boolean;
  chatHost?: ChatWindowPlacement | "section_layout" | "standalone_page";
  chatModeOverride?: ChatWindowMode;
  projectChatId?: string | null;
  setProjectChatId?: (next: SetStateAction<string | null | undefined>) => void;
  projectChatSurfaceId?: string;
  onProjectChatBlockedErrorCodeChange?: (errorCode: string | null) => void;
};

type SectionChromeMode = "header" | "meta-control" | "text-block-meta";

type SectionAreaRenderer = (props: AreaSwitchProps) => React.ReactNode;

function resolveMotionHiddenCanvasState({
  graphSurfaceImplementation,
  isSectionUIActive,
  sectionId,
  viewportInteractionActive,
}: {
  graphSurfaceImplementation: "legacy-dom" | "canvas-shell-underlay";
  isSectionUIActive: boolean;
  sectionId: string;
  viewportInteractionActive: boolean;
}) {
  const motionHiddenRoot =
    graphSurfaceImplementation === "canvas-shell-underlay" &&
    isCanvasOwnedSectionMotionHiddenBody(sectionId);
  const motionHidden =
    motionHiddenRoot && viewportInteractionActive && !isSectionUIActive;
  return {
    motionHidden,
    motionHiddenRoot,
  };
}

function setBooleanDataAttribute(
  node: Element | null,
  name: string,
  enabled: boolean,
) {
  if (!node) {
    return;
  }
  if (enabled) {
    node.setAttribute(name, "true");
    return;
  }
  node.removeAttribute(name);
}

function applyMotionHiddenCanvasDomState({
  motionHidden,
  motionHiddenRoot,
  sectionId,
}: {
  motionHidden: boolean;
  motionHiddenRoot: boolean;
  sectionId: string;
}) {
  if (typeof document === "undefined") {
    return;
  }
  const sectionRoot = document.getElementById(`${sectionId}-CustomResizable`);
  if (!(sectionRoot instanceof HTMLElement)) {
    return;
  }

  setBooleanDataAttribute(
    sectionRoot,
    "data-canvas-owned-motion-shell-hidden",
    motionHiddenRoot && motionHidden,
  );
  setBooleanDataAttribute(
    sectionRoot,
    "data-canvas-owned-motion-resize-handles-hidden",
    motionHiddenRoot && motionHidden,
  );

  sectionRoot
    .querySelectorAll('[data-canvas-owned-motion-body-root="true"]')
    .forEach((node) => {
      setBooleanDataAttribute(
        node,
        "data-canvas-owned-motion-body-hidden",
        motionHidden,
      );
    });

  sectionRoot
    .querySelectorAll('[data-canvas-owned-motion-header-controls-root="true"]')
    .forEach((node) => {
      setBooleanDataAttribute(
        node,
        "data-canvas-owned-motion-header-controls-hidden",
        motionHidden,
      );
    });

  sectionRoot
    .querySelectorAll('[data-canvas-owned-lightweight-menu-trigger="true"]')
    .forEach((node) => {
      setBooleanDataAttribute(
        node,
        "data-canvas-owned-motion-menu-trigger-hidden",
        motionHidden,
      );
    });

  sectionRoot
    .querySelectorAll(
      '.section-resize-handle,[data-setta-motion-hidden-resize-handle="true"]',
    )
    .forEach((node) => {
      if (!(node instanceof HTMLElement)) {
        return;
      }
      if (motionHidden) {
        if (node.classList.contains("section-resize-handle")) {
          node.classList.remove("section-resize-handle");
          node.setAttribute("data-setta-motion-hidden-resize-handle", "true");
        }
        return;
      }
      if (node.getAttribute("data-setta-motion-hidden-resize-handle") !== "true") {
        return;
      }
      node.classList.add("section-resize-handle");
      node.removeAttribute("data-setta-motion-hidden-resize-handle");
  });
}

function getIsSectionUIActiveFromState(sectionId: string) {
  return useActiveSectionUI.getState().activeIds.includes(sectionId);
}

function useSyncMotionHiddenCanvasDomState({
  motionHiddenRoot,
  sectionId,
}: {
  motionHiddenRoot: boolean;
  sectionId: string;
}) {
  React.useLayoutEffect(() => {
    const applyMotionState = () => {
      applyMotionHiddenCanvasDomState({
        sectionId,
        motionHiddenRoot,
        motionHidden:
          motionHiddenRoot &&
          useReactFlow.getState().viewportInteractionActive &&
          !getIsSectionUIActiveFromState(sectionId),
      });
    };

    applyMotionState();

    if (!motionHiddenRoot) {
      return;
    }

    const unsubscribeViewportInteractionActive = useReactFlow.subscribe(
      (state) => state.viewportInteractionActive,
      (nextViewportInteractionActive, previousViewportInteractionActive) => {
        if (nextViewportInteractionActive === previousViewportInteractionActive) {
          return;
        }
        applyMotionState();
      },
    );
    const unsubscribeSectionUIActive = useActiveSectionUI.subscribe(
      (state) => state.activeIds.includes(sectionId),
      (nextIsSectionUIActive, previousIsSectionUIActive) => {
        if (nextIsSectionUIActive === previousIsSectionUIActive) {
          return;
        }
        applyMotionState();
      },
    );

    return () => {
      unsubscribeViewportInteractionActive();
      unsubscribeSectionUIActive();
      applyMotionHiddenCanvasDomState({
        sectionId,
        motionHiddenRoot,
        motionHidden: false,
      });
    };
  }, [motionHiddenRoot, sectionId]);
}

function getSectionContainerResizableSnapshot(
  state: ZustandProjectState,
  sectionId: string,
): SectionContainerResizableSnapshot {
  const impl = getCurrEffectiveSectionImpl(state, sectionId);
  const embeddedTerminal = getEmbeddedAttachedTerminalForCodeSection(
    state,
    sectionId,
  );
  return {
    isMinimized: impl.isMinimized,
    isYouTube: false,
    textBlockMetaControlStyle:
      impl.type === SectionTypeEnum.TextBlock ? impl.metaControlStyle : false,
    hasEmbeddedTerminal:
      embeddedTerminal !== null && !embeddedTerminal.isTerminalMinimized,
  };
}

function getSectionChromeMode(
  sectionTypeName: SectionType,
  textBlockMetaControlStyle: boolean,
): SectionChromeMode {
  if (sectionTypeName === SectionTypeEnum.MetaControl) {
    return "meta-control";
  }
  if (textBlockMetaControlStyle) {
    return "text-block-meta";
  }
  return "header";
}

function FloatingMenuSlot({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute left-0 top-1/2 z-[200] -translate-x-full -translate-y-1/2">
      <div className="flex h-12 w-10 items-center justify-end">{children}</div>
    </div>
  );
}

function SectionHeaderExtraControls({
  hasSectionStyleTheme,
  isRoot,
  isUserView,
  sectionId,
  sectionTypeName,
}: {
  hasSectionStyleTheme: boolean;
  isRoot: boolean;
  isUserView: boolean;
  sectionId: string;
  sectionTypeName: SectionType;
}) {
  if (isUserView) {
    return null;
  }
  return (
    <SectionWindowToggleButton
      sectionId={sectionId}
      sectionTypeName={sectionTypeName}
      isRoot={isRoot}
      hasSectionStyleTheme={hasSectionStyleTheme}
    />
  );
}

function SectionPrimaryChrome({
  sectionId,
  sectionTypeName,
  isInOtherProjectConfigs,
  isUserView,
  isRoot,
  hasSectionStyleTheme,
  chromeMode,
  hideHeader,
  motionHiddenInteractionActive,
}: {
  sectionId: string;
  sectionTypeName: SectionType;
  isInOtherProjectConfigs: boolean;
  isUserView: boolean;
  isRoot: boolean;
  hasSectionStyleTheme: boolean;
  chromeMode: SectionChromeMode;
  hideHeader: boolean;
  motionHiddenInteractionActive: boolean;
}) {
  if (chromeMode === "meta-control" && !isUserView) {
    return (
      <FloatingMenuSlot>
        <MetaControlMenuButton
          sectionId={sectionId}
          sectionTypeName={sectionTypeName}
          isInOtherProjectConfigs={isInOtherProjectConfigs}
        />
      </FloatingMenuSlot>
    );
  }
  if (chromeMode === "text-block-meta" && !isUserView) {
    return (
      <FloatingMenuSlot>
        <TextBlockMetaControlMenuButton
          sectionId={sectionId}
          sectionTypeName={sectionTypeName}
          isInOtherProjectConfigs={isInOtherProjectConfigs}
          isRoot={isRoot}
        />
      </FloatingMenuSlot>
    );
  }
  if (chromeMode !== "header" || hideHeader) {
    return null;
  }
  return (
    <SectionHeader
      sectionId={sectionId}
      sectionTypeName={sectionTypeName}
      isInOtherProjectConfigs={isInOtherProjectConfigs}
      isUserView={isUserView}
      isRoot={isRoot}
      hasSectionStyleTheme={hasSectionStyleTheme}
      motionHiddenInteractionActive={motionHiddenInteractionActive}
      extraControls={
        <SectionHeaderExtraControls
          sectionId={sectionId}
          sectionTypeName={sectionTypeName}
          isRoot={isRoot}
          isUserView={isUserView}
          hasSectionStyleTheme={hasSectionStyleTheme}
        />
      }
    />
  );
}

function shouldShowMetaControlDragHandle(
  chromeMode: SectionChromeMode,
  isUserView: boolean,
  positionAndSizeLocked: boolean,
) {
  return chromeMode !== "header" && !isUserView && !positionAndSizeLocked;
}

function SectionContainerChrome({
  sectionId,
  sectionTypeName,
  isInOtherProjectConfigs,
  isUserView,
  isRoot,
  hasSectionStyleTheme,
  chromeMode,
  hideHeader,
  positionAndSizeLocked,
  motionHiddenInteractionActive,
}: {
  sectionId: string;
  sectionTypeName: SectionType;
  isInOtherProjectConfigs: boolean;
  isUserView: boolean;
  isRoot: boolean;
  hasSectionStyleTheme: boolean;
  chromeMode: SectionChromeMode;
  hideHeader: boolean;
  positionAndSizeLocked: boolean;
  motionHiddenInteractionActive: boolean;
}) {
  const showMetaControlDragHandle = shouldShowMetaControlDragHandle(
    chromeMode,
    isUserView,
    positionAndSizeLocked,
  );

  return (
    <>
      {showMetaControlDragHandle ? (
        <div className="pointer-events-none absolute left-1/2 top-0 z-20 flex h-3 w-12 -translate-x-1/2 -translate-y-1/2 cursor-move items-center justify-center opacity-0 transition-opacity group-hover/card-section:pointer-events-auto group-hover/card-section:opacity-100">
          <div className="h-1 w-8 rounded-full bg-setta-300/70 dark:bg-setta-600/70" />
        </div>
      ) : null}
      <SectionPrimaryChrome
        sectionId={sectionId}
        sectionTypeName={sectionTypeName}
        isInOtherProjectConfigs={isInOtherProjectConfigs}
        isUserView={isUserView}
        isRoot={isRoot}
        hasSectionStyleTheme={hasSectionStyleTheme}
        chromeMode={chromeMode}
        hideHeader={hideHeader}
        motionHiddenInteractionActive={motionHiddenInteractionActive}
      />
      {isRoot ? <Incrementer sectionId={sectionId} isRoot={isRoot} /> : null}
    </>
  );
}

const MemoizedSectionContainerChrome = React.memo(SectionContainerChrome);

type SectionContainerResizableSurfaceProps = {
  sectionId: string;
  bgColor: string;
  isYouTube: boolean;
  useMetaControlStyle: boolean;
  positionAndSizeLocked: boolean;
  hasSectionStyleTheme: boolean;
  hasEmbeddedTerminal: boolean;
  metaControlFrameClassName?: string;
  metaControlLayoutClassName?: string;
  motionHidden: boolean;
  motionHiddenRoot: boolean;
  children: React.ReactNode;
};

function SectionContainerResizableSurface({
  sectionId,
  bgColor,
  isYouTube,
  useMetaControlStyle,
  positionAndSizeLocked,
  hasSectionStyleTheme,
  hasEmbeddedTerminal,
  metaControlFrameClassName,
  metaControlLayoutClassName,
  motionHidden,
  motionHiddenRoot,
  children,
}: SectionContainerResizableSurfaceProps) {
  return (
    <CustomResizable
      sectionId={sectionId}
      as="section"
      bgColor={bgColor}
      isYouTube={isYouTube}
      isMetaControl={useMetaControlStyle}
      positionAndSizeLocked={positionAndSizeLocked}
      hasSectionStyleTheme={hasSectionStyleTheme}
      allowPointerEventsDuringDnd={hasEmbeddedTerminal}
      frameClassName={metaControlFrameClassName}
      layoutClassName={metaControlLayoutClassName}
      motionCanvasOwnedShell={motionHidden}
      motionCanvasOwnedShellRoot={motionHiddenRoot}
    >
      {children}
    </CustomResizable>
  );
}

const MemoizedSectionContainerResizableSurface = React.memo(
  SectionContainerResizableSurface,
);

const SECTION_AREA_RENDERERS = {
  [SectionTypeEnum.Callable]: ({ sectionId, bgColor, isMinimized }) => (
    <CallableArea
      sectionId={sectionId}
      bgColor={bgColor}
      isMinimized={isMinimized}
    />
  ),
  [SectionTypeEnum.Dict]: ({ sectionId, bgColor }) => (
    <DictArea sectionId={sectionId} bgColor={bgColor} />
  ),
  [SectionTypeEnum.Image]: ({ sectionId }) => (
    <ImageArea sectionId={sectionId} />
  ),
  [SectionTypeEnum.Chart]: ({ sectionId }) => (
    <ChartArea sectionId={sectionId} />
  ),
  [SectionTypeEnum.Draw]: ({ sectionId }) => <DrawArea sectionId={sectionId} />,
  [SectionTypeEnum.Social]: ({ sectionId }) => (
    <SocialArea sectionId={sectionId} />
  ),
  [SectionTypeEnum.TextBlock]: ({ sectionId }) => (
    <TextBlock sectionId={sectionId} />
  ),
  [SectionTypeEnum.Prompt]: ({ sectionId }) => (
    <PromptArea sectionId={sectionId} />
  ),
  [SectionTypeEnum.MetaControl]: ({ sectionId }) => (
    <MetaControlArea sectionId={sectionId} />
  ),
  [SectionTypeEnum.GlobalVariables]: ({ sectionId, bgColor }) => (
    <GlobalVariablesArea sectionId={sectionId} bgColor={bgColor} />
  ),
  [SectionTypeEnum.Code]: ({ sectionId }) => <CodeArea sectionId={sectionId} />,
  [SectionTypeEnum.GenPythonCode]: ({ sectionId }) => (
    <GenPythonCodeArea sectionId={sectionId} />
  ),
  [SectionTypeEnum.GenPythonMetadata]: ({ sectionId }) => (
    <GenPythonMetadataArea sectionId={sectionId} />
  ),
  [SectionTypeEnum.Terminal]: ({ sectionId, chatHost = "section_layout" }) => (
    <TerminalArea sectionId={sectionId} host={chatHost} />
  ),
  [SectionTypeEnum.IFrame]: ({ sectionId }) => (
    <IframeArea sectionId={sectionId} />
  ),
  [SectionTypeEnum.Chat]: ({
    sectionId,
    chatHost = "section_layout",
    chatModeOverride,
    projectChatId,
    setProjectChatId,
    projectChatSurfaceId,
    onProjectChatBlockedErrorCodeChange,
  }) => (
    <ChatSectionArea
      sectionId={sectionId}
      host={chatHost}
      modeOverride={chatModeOverride}
      projectChatId={projectChatId}
      setProjectChatId={setProjectChatId}
      surfaceId={projectChatSurfaceId}
      onProjectChatBlockedErrorCodeChange={onProjectChatBlockedErrorCodeChange}
    />
  ),
  [SectionTypeEnum.Browser]: ({ sectionId }) => (
    <BrowserArea sectionId={sectionId} />
  ),
  [SectionTypeEnum.Plugin]: ({ sectionId, isUserView }) => (
    <PluginArea sectionId={sectionId} isUserView={isUserView} />
  ),
  [SectionTypeEnum.TaskBoard]: ({ sectionId }) => (
    <TaskBoardArea sectionId={sectionId} />
  ),
  [SectionTypeEnum.Spreadsheet]: ({ sectionId }) => (
    <SpreadsheetArea sectionId={sectionId} />
  ),
  [SectionTypeEnum.StateMachineStart]: ({ sectionId }) => (
    <StateMachineNodeArea sectionId={sectionId} />
  ),
  [SectionTypeEnum.StateMachineGate]: ({ sectionId }) => (
    <StateMachineNodeArea sectionId={sectionId} />
  ),
  [SectionTypeEnum.StateMachineEnd]: ({ sectionId }) => (
    <StateMachineNodeArea sectionId={sectionId} />
  ),
  [SectionTypeEnum.ListRoot]: () => null,
  [SectionTypeEnum.Group]: () => null,
} satisfies Record<SectionType, SectionAreaRenderer>;

function _SectionContainerCoreResizable({
  sectionId,
  sectionTypeName,
  isInOtherProjectConfigs,
  isUserView,
  positionAndSizeLocked,
  hasSectionStyleTheme,
  hideHeader = false,
}: SectionContainerCoreResizableProps) {
  const {
    isMinimized,
    isYouTube,
    textBlockMetaControlStyle,
    hasEmbeddedTerminal,
  } = useProjectState(
    (x) => getSectionContainerResizableSnapshot(x, sectionId),
    _.isEqual,
  );

  const isRoot = getIsRoot(sectionTypeName);
  const chromeMode = getSectionChromeMode(
    sectionTypeName,
    textBlockMetaControlStyle,
  );
  const useMetaControlStyle = chromeMode !== "header";
  const bgColor = useMetaControlStyle
    ? "bg-transparent"
    : getBgColor(sectionTypeName);
  const metaControlFrameClassName = useMetaControlStyle
    ? "before:!border-transparent dark:before:!border-transparent group-hover/card-section:before:!border-setta-400/60 dark:group-hover/card-section:before:!border-setta-700/60"
    : undefined;
  const metaControlLayoutClassName =
    chromeMode === "meta-control" ? "grid-cols-1 grid-rows-1" : undefined;
  const graphSurfaceImplementation = useGraphSurfaceImplementation();
  const isSectionUIActive = getIsSectionUIActiveFromState(sectionId);
  const { motionHidden, motionHiddenRoot } = resolveMotionHiddenCanvasState({
    graphSurfaceImplementation,
    isSectionUIActive,
    sectionId,
    viewportInteractionActive: useReactFlow.getState().viewportInteractionActive,
  });
  useSyncMotionHiddenCanvasDomState({
    sectionId,
    motionHiddenRoot,
  });

  const resizableChildren = React.useMemo(
    () => (
      <>
        <MemoizedSectionContainerChrome
          sectionId={sectionId}
          sectionTypeName={sectionTypeName}
          isInOtherProjectConfigs={isInOtherProjectConfigs}
          isUserView={isUserView}
          isRoot={isRoot}
          hasSectionStyleTheme={hasSectionStyleTheme}
          chromeMode={chromeMode}
          hideHeader={hideHeader}
          positionAndSizeLocked={positionAndSizeLocked}
          motionHiddenInteractionActive={motionHidden}
        />
        <MemoizedCanvasSectionBody
          sectionId={sectionId}
          sectionTypeName={sectionTypeName}
          bgColor={bgColor}
          isMinimized={isMinimized}
          isUserView={isUserView}
          motionHiddenBody={motionHidden}
          motionHiddenBodyRoot={motionHiddenRoot}
        />
      </>
    ),
    [
      bgColor,
      chromeMode,
      hasSectionStyleTheme,
      hideHeader,
      isInOtherProjectConfigs,
      isMinimized,
      isRoot,
      isUserView,
      motionHidden,
      motionHiddenRoot,
      positionAndSizeLocked,
      sectionId,
      sectionTypeName,
    ],
  );

  return (
    <MemoizedSectionContainerResizableSurface
      sectionId={sectionId}
      bgColor={bgColor}
      isYouTube={isYouTube}
      useMetaControlStyle={useMetaControlStyle}
      positionAndSizeLocked={positionAndSizeLocked}
      hasSectionStyleTheme={hasSectionStyleTheme}
      hasEmbeddedTerminal={hasEmbeddedTerminal}
      metaControlFrameClassName={metaControlFrameClassName}
      metaControlLayoutClassName={metaControlLayoutClassName}
      motionHidden={motionHidden}
      motionHiddenRoot={motionHiddenRoot}
    >
      {resizableChildren}
    </MemoizedSectionContainerResizableSurface>
  );
}

export const SectionContainerCoreResizable = React.memo(
  _SectionContainerCoreResizable,
);

export function AreaSwitch({
  sectionId,
  sectionTypeName,
  bgColor,
  isMinimized,
  isUserView,
  chatHost = "section_layout",
  chatModeOverride,
  projectChatId,
  setProjectChatId,
  projectChatSurfaceId,
  onProjectChatBlockedErrorCodeChange,
}: AreaSwitchProps) {
  if (isMinimized) {
    return null;
  }
  return SECTION_AREA_RENDERERS[sectionTypeName]({
    sectionId,
    sectionTypeName,
    bgColor,
    isMinimized,
    isUserView,
    chatHost,
    chatModeOverride,
    projectChatId,
    setProjectChatId,
    projectChatSurfaceId,
    onProjectChatBlockedErrorCodeChange,
  });
}

function CanvasSectionBody({
  sectionId,
  sectionTypeName,
  bgColor,
  isMinimized,
  isUserView,
  motionHiddenBody,
  motionHiddenBodyRoot,
}: {
  sectionId: string;
  sectionTypeName: SectionType;
  bgColor: string;
  isMinimized: boolean;
  isUserView: boolean;
  motionHiddenBody: boolean;
  motionHiddenBodyRoot: boolean;
}) {
  const externalizedWindowId = useProjectState((state) => {
    if (sectionTypeName === SectionTypeEnum.Chat) {
      return null;
    }
    return (
      getExternalProjectChatWindowBindingForSectionInState(
        state.projectChatWindowing,
        sectionId,
      )?.instanceId ?? null
    );
  });

  if (externalizedWindowId) {
    return (
      <SectionWindowPlaceholder
        instanceId={externalizedWindowId}
        sectionId={sectionId}
        dataTestId="section-canvas-window-placeholder"
      />
    );
  }
  if (isMinimized) {
    return null;
  }

  return (
    <div
      data-canvas-owned-motion-body-hidden={
        motionHiddenBody ? "true" : undefined
      }
      data-canvas-owned-motion-body-root={
        motionHiddenBodyRoot ? "true" : undefined
      }
    >
      <AreaSwitch
        sectionId={sectionId}
        sectionTypeName={sectionTypeName}
        bgColor={bgColor}
        isMinimized={isMinimized}
        isUserView={isUserView}
      />
    </div>
  );
}

const MemoizedCanvasSectionBody = React.memo(CanvasSectionBody);

function ChatSectionArea({
  sectionId,
  host,
  modeOverride,
  projectChatId,
  setProjectChatId,
  surfaceId,
  onProjectChatBlockedErrorCodeChange,
}: {
  sectionId: string;
  host: ChatWindowPlacement | "section_layout" | "standalone_page";
  modeOverride?: ChatWindowMode;
  projectChatId?: string | null;
  setProjectChatId?: (next: SetStateAction<string | null | undefined>) => void;
  surfaceId?: string;
  onProjectChatBlockedErrorCodeChange?: (errorCode: string | null) => void;
}) {
  const derivedMode = useProjectState((state) =>
    modeOverride === undefined
      ? getProjectChatWindowModeForSectionInState(
          state.projectChatWindowing,
          sectionId,
        )
      : null,
  );
  const projectConfigId = useProjectState((state) => state.projectConfig.id);
  const mode = modeOverride ?? derivedMode ?? ChatWindowModeEnum.section_mode;
  return (
    <UnifiedChatSurface
      mode={mode}
      host={host}
      sectionId={sectionId}
      surfaceId={
        surfaceId ??
        buildWorkspaceSectionProjectChatSurfaceId(projectConfigId, sectionId)
      }
      projectChatId={projectChatId}
      setProjectChatId={setProjectChatId}
      onProjectChatBlockedErrorCodeChange={onProjectChatBlockedErrorCodeChange}
    />
  );
}
