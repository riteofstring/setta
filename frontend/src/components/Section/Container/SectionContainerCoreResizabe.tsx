import { buildWorkspaceSectionProjectChatSurfaceId } from "components/ChatWindowing/projectChatSurfaceIds";
import { UnifiedChatSurface } from "components/ChatWindowing/UnifiedChatSurface";
import { CustomResizable } from "components/Utils/Resizable/CustomResizable";
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
}: {
  sectionId: string;
  sectionTypeName: SectionType;
  isInOtherProjectConfigs: boolean;
  isUserView: boolean;
  isRoot: boolean;
  hasSectionStyleTheme: boolean;
  chromeMode: SectionChromeMode;
  hideHeader: boolean;
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
      />
      {isRoot ? <Incrementer sectionId={sectionId} isRoot={isRoot} /> : null}
    </>
  );
}

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
    >
      <SectionContainerChrome
        sectionId={sectionId}
        sectionTypeName={sectionTypeName}
        isInOtherProjectConfigs={isInOtherProjectConfigs}
        isUserView={isUserView}
        isRoot={isRoot}
        hasSectionStyleTheme={hasSectionStyleTheme}
        chromeMode={chromeMode}
        hideHeader={hideHeader}
        positionAndSizeLocked={positionAndSizeLocked}
      />
      <CanvasSectionBody
        sectionId={sectionId}
        sectionTypeName={sectionTypeName}
        bgColor={bgColor}
        isMinimized={isMinimized}
        isUserView={isUserView}
      />
    </CustomResizable>
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
}: {
  sectionId: string;
  sectionTypeName: SectionType;
  bgColor: string;
  isMinimized: boolean;
  isUserView: boolean;
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
    <AreaSwitch
      sectionId={sectionId}
      sectionTypeName={sectionTypeName}
      bgColor={bgColor}
      isMinimized={isMinimized}
      isUserView={isUserView}
    />
  );
}

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
