import { buildWorkspaceSectionProjectChatSurfaceId } from "components/ChatWindowing/projectChatSurfaceIds";
import { UnifiedChatSurface } from "components/ChatWindowing/UnifiedChatSurface";
import type { SetStateAction } from "react";
import React from "react";
import { getProjectChatWindowModeForSectionInState } from "state/actions/projectChatWindowing";
import { useProjectState } from "state/definitions";
import {
  ChatWindowModeEnum,
  type ChatWindowMode,
  type ChatWindowPlacement,
} from "utils/generatedTypes";
import { BrowserArea } from "../Layouts/BrowserArea";
import { CallableArea } from "../Layouts/CallableArea";
import { ChartArea } from "../Layouts/ChartArea/ChartArea";
import {
  CodeArea,
  GenPythonCodeArea,
  GenPythonMetadataArea,
} from "../Layouts/CodeArea";
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
import {
  buildSectionContainerAreaView,
  type SectionContainerAreaProps,
} from "./sectionContainerAreaView";
import { SectionContainerDictArea } from "./SectionContainerDictArea";

function _SectionContainerArea(props: SectionContainerAreaProps) {
  const view = buildSectionContainerAreaView(props);

  switch (view.kind) {
    case "callable":
      return <CallableArea {...view.props} />;
    case "dict":
      return <SectionContainerDictArea {...view.props} />;
    case "image":
      return <ImageArea {...view.props} />;
    case "chart":
      return <ChartArea {...view.props} />;
    case "draw":
      return <DrawArea {...view.props} />;
    case "social":
      return <SocialArea {...view.props} />;
    case "textBlock":
      return <TextBlock {...view.props} />;
    case "prompt":
      return <PromptArea {...view.props} />;
    case "metaControl":
      return <MetaControlArea {...view.props} />;
    case "globalVariables":
      return <GlobalVariablesArea {...view.props} />;
    case "code":
      return <CodeArea {...view.props} />;
    case "genPythonCode":
      return <GenPythonCodeArea {...view.props} />;
    case "genPythonMetadata":
      return <GenPythonMetadataArea {...view.props} />;
    case "terminal":
      return (
        <TerminalArea
          sectionId={view.props.sectionId}
          host={view.props.chatHost}
        />
      );
    case "iframe":
      return <IframeArea {...view.props} />;
    case "chat":
      return (
        <ChatSectionArea
          sectionId={view.props.sectionId}
          host={view.props.chatHost}
          modeOverride={view.props.chatModeOverride}
          projectChatId={view.props.projectChatId}
          setProjectChatId={view.props.setProjectChatId}
          surfaceId={view.props.projectChatSurfaceId}
          onProjectChatBlockedErrorCodeChange={
            view.props.onProjectChatBlockedErrorCodeChange
          }
        />
      );
    case "browser":
      return <BrowserArea {...view.props} />;
    case "plugin":
      return <PluginArea {...view.props} />;
    case "taskBoard":
      return <TaskBoardArea {...view.props} />;
    case "spreadsheet":
      return <SpreadsheetArea {...view.props} />;
    case "stateMachineNode":
      return <StateMachineNodeArea {...view.props} />;
    case "none":
      return null;
    default:
      return view satisfies never;
  }
}

export const SectionContainerArea = React.memo(_SectionContainerArea);

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
