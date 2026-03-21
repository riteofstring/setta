import { buildWorkspaceSectionProjectChatSurfaceId } from "components/ChatWindowing/projectChatSurfaceIds";
import { UnifiedChatSurface } from "components/ChatWindowing/UnifiedChatSurface";
import type { SetStateAction } from "react";
import { getProjectChatWindowModeForSectionInState } from "state/actions/projectChatWindowing";
import { useProjectState } from "state/definitions";
import {
  ChatWindowModeEnum,
  SectionTypeEnum,
  type ChatWindowMode,
  type ChatWindowPlacement,
  type SectionType,
} from "utils/generatedTypes";
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

type SectionAreaSwitchProps = {
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

export function SectionAreaSwitch({
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
}: SectionAreaSwitchProps) {
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
          modeOverride={chatModeOverride}
          projectChatId={projectChatId}
          setProjectChatId={setProjectChatId}
          surfaceId={projectChatSurfaceId}
          onProjectChatBlockedErrorCodeChange={
            onProjectChatBlockedErrorCodeChange
          }
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
