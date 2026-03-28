import type { SetStateAction } from "react";
import {
  SectionTypeEnum,
  type ChatWindowMode,
  type ChatWindowPlacement,
  type SectionType,
} from "utils/generatedTypes";

export type SectionContainerAreaProps = {
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

type SectionIdProps = Pick<SectionContainerAreaProps, "sectionId">;
type DictAreaProps = Pick<SectionContainerAreaProps, "sectionId" | "bgColor">;
type CallableAreaProps = Pick<
  SectionContainerAreaProps,
  "sectionId" | "bgColor" | "isMinimized"
>;
type PluginAreaProps = Pick<
  SectionContainerAreaProps,
  "sectionId" | "isUserView"
>;
type TerminalAreaProps = Pick<
  SectionContainerAreaProps,
  "sectionId" | "chatHost"
>;
type ChatSectionAreaProps = Pick<
  SectionContainerAreaProps,
  | "sectionId"
  | "chatHost"
  | "chatModeOverride"
  | "projectChatId"
  | "setProjectChatId"
  | "projectChatSurfaceId"
  | "onProjectChatBlockedErrorCodeChange"
>;

export type SectionContainerAreaView =
  | { kind: "callable"; props: CallableAreaProps }
  | { kind: "dict"; props: DictAreaProps }
  | { kind: "image"; props: SectionIdProps }
  | { kind: "chart"; props: SectionIdProps }
  | { kind: "draw"; props: SectionIdProps }
  | { kind: "social"; props: SectionIdProps }
  | { kind: "textBlock"; props: SectionIdProps }
  | { kind: "prompt"; props: SectionIdProps }
  | { kind: "metaControl"; props: SectionIdProps }
  | { kind: "globalVariables"; props: DictAreaProps }
  | { kind: "code"; props: SectionIdProps }
  | { kind: "genPythonCode"; props: SectionIdProps }
  | { kind: "genPythonMetadata"; props: SectionIdProps }
  | { kind: "terminal"; props: TerminalAreaProps }
  | { kind: "iframe"; props: SectionIdProps }
  | { kind: "chat"; props: ChatSectionAreaProps }
  | { kind: "browser"; props: SectionIdProps }
  | { kind: "plugin"; props: PluginAreaProps }
  | { kind: "taskBoard"; props: SectionIdProps }
  | { kind: "spreadsheet"; props: SectionIdProps }
  | { kind: "stateMachineNode"; props: SectionIdProps }
  | { kind: "none" };

export function buildSectionContainerAreaView({
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
}: SectionContainerAreaProps): SectionContainerAreaView {
  switch (sectionTypeName) {
    case SectionTypeEnum.Callable:
      return {
        kind: "callable",
        props: { sectionId, bgColor, isMinimized },
      };
    case SectionTypeEnum.Dict:
      return {
        kind: "dict",
        props: { sectionId, bgColor },
      };
    case SectionTypeEnum.Image:
      return {
        kind: "image",
        props: { sectionId },
      };
    case SectionTypeEnum.Chart:
      return {
        kind: "chart",
        props: { sectionId },
      };
    case SectionTypeEnum.Draw:
      return {
        kind: "draw",
        props: { sectionId },
      };
    case SectionTypeEnum.Social:
      return {
        kind: "social",
        props: { sectionId },
      };
    case SectionTypeEnum.TextBlock:
      return {
        kind: "textBlock",
        props: { sectionId },
      };
    case SectionTypeEnum.Prompt:
      return {
        kind: "prompt",
        props: { sectionId },
      };
    case SectionTypeEnum.MetaControl:
      return {
        kind: "metaControl",
        props: { sectionId },
      };
    case SectionTypeEnum.GlobalVariables:
      return {
        kind: "globalVariables",
        props: { sectionId, bgColor },
      };
    case SectionTypeEnum.Code:
      return {
        kind: "code",
        props: { sectionId },
      };
    case SectionTypeEnum.GenPythonCode:
      return {
        kind: "genPythonCode",
        props: { sectionId },
      };
    case SectionTypeEnum.GenPythonMetadata:
      return {
        kind: "genPythonMetadata",
        props: { sectionId },
      };
    case SectionTypeEnum.Terminal:
      return {
        kind: "terminal",
        props: { sectionId, chatHost },
      };
    case SectionTypeEnum.IFrame:
      return {
        kind: "iframe",
        props: { sectionId },
      };
    case SectionTypeEnum.Chat:
      return {
        kind: "chat",
        props: {
          sectionId,
          chatHost,
          chatModeOverride,
          projectChatId,
          setProjectChatId,
          projectChatSurfaceId,
          onProjectChatBlockedErrorCodeChange,
        },
      };
    case SectionTypeEnum.Browser:
      return {
        kind: "browser",
        props: { sectionId },
      };
    case SectionTypeEnum.Plugin:
      return {
        kind: "plugin",
        props: { sectionId, isUserView },
      };
    case SectionTypeEnum.TaskBoard:
      return {
        kind: "taskBoard",
        props: { sectionId },
      };
    case SectionTypeEnum.Spreadsheet:
      return {
        kind: "spreadsheet",
        props: { sectionId },
      };
    case SectionTypeEnum.StateMachineStart:
    case SectionTypeEnum.StateMachineGate:
    case SectionTypeEnum.StateMachineEnd:
      return {
        kind: "stateMachineNode",
        props: { sectionId },
      };
    case SectionTypeEnum.ListRoot:
    case SectionTypeEnum.Group:
      return { kind: "none" };
    default:
      return sectionTypeName satisfies never;
  }
}
