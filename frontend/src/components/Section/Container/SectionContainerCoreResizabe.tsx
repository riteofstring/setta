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
import { useProjectState } from "state/definitions";
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
import {
  resolveSectionChromeSurfaceDecorations,
  type SectionChromeBodySurface,
} from "./sectionChrome";
import { SectionWindowPlaceholder } from "./SectionWindowPlaceholder";
import { TextBlockMetaControlMenuButton } from "./TextBlockMetaControlMenuButton";
import { getBgColor } from "./utils";

export type SectionContainerHeaderRenderProps = {
  hasSectionStyleTheme: boolean;
  isInOtherProjectConfigs: boolean;
  isRoot: boolean;
  isUserView: boolean;
  sectionId: string;
  sectionTypeName: SectionType;
};

type SectionContainerHeaderRenderer =
  React.ComponentType<SectionContainerHeaderRenderProps>;

type SectionContainerCoreResizableProps = {
  bodySurfaceOverride?: SectionChromeBodySurface | undefined;
  forceTransparentBackground?: boolean;
  headerRenderer?: SectionContainerHeaderRenderer | undefined;
  sectionId: string;
  sectionTypeName: SectionType;
  isInOtherProjectConfigs: boolean;
  isUserView: boolean;
  positionAndSizeLocked: boolean;
  hasSectionStyleTheme: boolean;
  hideHeader?: boolean;
  forceHideTopDragHandle?: boolean;
};

function DefaultSectionContainerHeaderDomAdapter({
  hasSectionStyleTheme,
  isInOtherProjectConfigs,
  isRoot,
  isUserView,
  sectionId,
  sectionTypeName,
}: SectionContainerHeaderRenderProps) {
  return (
    <SectionHeader
      sectionId={sectionId}
      sectionTypeName={sectionTypeName}
      isInOtherProjectConfigs={isInOtherProjectConfigs}
      isUserView={isUserView}
      isRoot={isRoot}
      hasSectionStyleTheme={hasSectionStyleTheme}
      extraControls={
        !isUserView ? (
          <SectionWindowToggleButton
            sectionId={sectionId}
            sectionTypeName={sectionTypeName}
            isRoot={isRoot}
            hasSectionStyleTheme={hasSectionStyleTheme}
          />
        ) : null
      }
    />
  );
}

function _SectionContainerCoreResizable({
  bodySurfaceOverride,
  forceTransparentBackground = false,
  headerRenderer,
  sectionId,
  sectionTypeName,
  isInOtherProjectConfigs,
  isUserView,
  positionAndSizeLocked,
  hasSectionStyleTheme,
  hideHeader = false,
  forceHideTopDragHandle = false,
}: SectionContainerCoreResizableProps) {
  const {
    isMinimized,
    isYouTube,
    textBlockMetaControlStyle,
    hasEmbeddedTerminal,
  } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    const embeddedTerminal = getEmbeddedAttachedTerminalForCodeSection(
      x,
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
  }, _.isEqual);

  const isMetaControl = sectionTypeName === SectionTypeEnum.MetaControl;
  const isRoot = getIsRoot(sectionTypeName);
  const useMetaControlStyle = isMetaControl || textBlockMetaControlStyle;
  const defaultBgColor = useMetaControlStyle
    ? "bg-transparent"
    : getBgColor(sectionTypeName);
  const shouldRenderMetaMenu = isMetaControl && !isUserView;
  const shouldRenderTextBlockMetaMenu =
    textBlockMetaControlStyle && !isUserView;
  const defaultSurfaceDecorations = resolveSectionChromeSurfaceDecorations({
    useMetaControlStyle,
    isMetaControlSection: isMetaControl,
    isUserView,
    positionAndSizeLocked,
  });
  const bodySurface = bodySurfaceOverride ?? {
    bgColor: defaultBgColor,
    surfaceDecorations: defaultSurfaceDecorations,
  };
  const headerRenderProps: SectionContainerHeaderRenderProps = {
    hasSectionStyleTheme,
    isInOtherProjectConfigs,
    isRoot,
    isUserView,
    sectionId,
    sectionTypeName,
  };
  const HeaderRenderer =
    headerRenderer ?? DefaultSectionContainerHeaderDomAdapter;

  return (
    <CustomResizable
      sectionId={sectionId}
      as="section"
      bgColor={bodySurface.bgColor}
      forceTransparentBackground={forceTransparentBackground}
      isYouTube={isYouTube}
      surfaceDecorations={bodySurface.surfaceDecorations}
      positionAndSizeLocked={positionAndSizeLocked}
      hasSectionStyleTheme={hasSectionStyleTheme}
      allowPointerEventsDuringDnd={hasEmbeddedTerminal}
    >
      {bodySurface.surfaceDecorations.showTopDragHandle &&
        !forceHideTopDragHandle && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-0 z-20 flex h-3 w-12 -translate-x-1/2 -translate-y-1/2 cursor-move items-center justify-center opacity-0 transition-opacity group-hover/card-section:pointer-events-auto group-hover/card-section:opacity-100"
            data-testid="section-top-drag-handle"
          >
            <div className="h-1 w-8 rounded-full bg-setta-300/70 dark:bg-setta-600/70" />
          </div>
        )}
      {isMetaControl ? (
        shouldRenderMetaMenu && (
          <div className="absolute left-0 top-1/2 z-[200] -translate-x-full -translate-y-1/2">
            <div className="flex h-12 w-10 items-center justify-end">
              <MetaControlMenuButton
                sectionId={sectionId}
                sectionTypeName={sectionTypeName}
                isInOtherProjectConfigs={isInOtherProjectConfigs}
              />
            </div>
          </div>
        )
      ) : textBlockMetaControlStyle ? (
        shouldRenderTextBlockMetaMenu && (
          <div className="absolute left-0 top-1/2 z-[200] -translate-x-full -translate-y-1/2">
            <div className="flex h-12 w-10 items-center justify-end">
              <TextBlockMetaControlMenuButton
                sectionId={sectionId}
                sectionTypeName={sectionTypeName}
                isInOtherProjectConfigs={isInOtherProjectConfigs}
                isRoot={isRoot}
              />
            </div>
          </div>
        )
      ) : !hideHeader ? (
        <HeaderRenderer {...headerRenderProps} />
      ) : null}
      {isRoot && <Incrementer sectionId={sectionId} isRoot={isRoot} />}
      <CanvasSectionBody
        sectionId={sectionId}
        sectionTypeName={sectionTypeName}
        bgColor={bodySurface.bgColor}
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
}: {
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
}) {
  if (isMinimized) {
    return null;
  }
  switch (sectionTypeName) {
    case SectionTypeEnum.Callable:
      return (
        <CallableArea
          sectionId={sectionId}
          bgColor={bgColor}
          isMinimized={isMinimized}
        />
      );
    case SectionTypeEnum.Dict:
      return <DictArea sectionId={sectionId} bgColor={bgColor} />;
    case SectionTypeEnum.Image:
      return <ImageArea sectionId={sectionId} />;
    case SectionTypeEnum.Chart:
      return <ChartArea sectionId={sectionId} />;
    case SectionTypeEnum.Draw:
      return <DrawArea sectionId={sectionId} />;
    case SectionTypeEnum.Social:
      return <SocialArea sectionId={sectionId} />;
    case SectionTypeEnum.TextBlock:
      return <TextBlock sectionId={sectionId} />;
    case SectionTypeEnum.Prompt:
      return <PromptArea sectionId={sectionId} />;
    case SectionTypeEnum.MetaControl:
      return <MetaControlArea sectionId={sectionId} />;
    case SectionTypeEnum.GlobalVariables:
      return <GlobalVariablesArea sectionId={sectionId} bgColor={bgColor} />;
    case SectionTypeEnum.Code:
      return <CodeArea sectionId={sectionId} />;
    case SectionTypeEnum.GenPythonCode:
      return <GenPythonCodeArea sectionId={sectionId} />;
    case SectionTypeEnum.GenPythonMetadata:
      return <GenPythonMetadataArea sectionId={sectionId} />;
    case SectionTypeEnum.Terminal:
      return <TerminalArea sectionId={sectionId} host={chatHost} />;
    case SectionTypeEnum.IFrame:
      return <IframeArea sectionId={sectionId} />;
    case SectionTypeEnum.Chat:
      return (
        <ChatSectionArea
          sectionId={sectionId}
          host={chatHost}
          {...(chatModeOverride !== undefined
            ? { modeOverride: chatModeOverride }
            : {})}
          {...(projectChatId !== undefined ? { projectChatId } : {})}
          {...(setProjectChatId !== undefined ? { setProjectChatId } : {})}
          {...(projectChatSurfaceId !== undefined
            ? { surfaceId: projectChatSurfaceId }
            : {})}
          {...(onProjectChatBlockedErrorCodeChange !== undefined
            ? { onProjectChatBlockedErrorCodeChange }
            : {})}
        />
      );
    case SectionTypeEnum.Browser:
      return <BrowserArea sectionId={sectionId} />;
    case SectionTypeEnum.Plugin:
      return <PluginArea sectionId={sectionId} isUserView={isUserView} />;
    case SectionTypeEnum.TaskBoard:
      return <TaskBoardArea sectionId={sectionId} />;
    case SectionTypeEnum.Spreadsheet:
      return <SpreadsheetArea sectionId={sectionId} />;
    case SectionTypeEnum.StateMachineStart:
    case SectionTypeEnum.StateMachineGate:
    case SectionTypeEnum.StateMachineEnd:
      return <StateMachineNodeArea sectionId={sectionId} />;
    case SectionTypeEnum.ListRoot:
    case SectionTypeEnum.Group:
      return null;
    default:
      return sectionTypeName satisfies never;
  }
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
      {...(projectChatId !== undefined ? { projectChatId } : {})}
      {...(setProjectChatId !== undefined ? { setProjectChatId } : {})}
      {...(onProjectChatBlockedErrorCodeChange !== undefined
        ? { onProjectChatBlockedErrorCodeChange }
        : {})}
    />
  );
}
