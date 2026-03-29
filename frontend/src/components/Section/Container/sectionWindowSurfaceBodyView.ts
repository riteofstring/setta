import type { ReactNode, SetStateAction } from "react";
import type {
  ChatWindowMode,
  ChatWindowPlacement,
  SectionType,
} from "utils/generatedTypes";
import type { SectionContainerAreaProps } from "./sectionContainerAreaView";

export type SectionWindowSurfaceBodyProps = {
  sectionId: string;
  sectionTypeName: SectionType;
  bgColor: string;
  isMinimized: boolean;
  chatHost: ChatWindowPlacement | "standalone_page";
  chatModeOverride?: ChatWindowMode;
  projectChatSurfaceId?: string;
  projectChatId?: string | null;
  setProjectChatId?: (next: SetStateAction<string | null | undefined>) => void;
  onProjectChatBlockedErrorCodeChange?: (errorCode: string | null) => void;
  bodyOverride?: ReactNode;
};

export type SectionWindowSurfaceBodyView =
  | { kind: "override"; body: ReactNode }
  | { kind: "area"; props: SectionContainerAreaProps }
  | { kind: "none" };

export function buildSectionWindowSurfaceBodyView({
  sectionId,
  sectionTypeName,
  bgColor,
  isMinimized,
  chatHost,
  chatModeOverride,
  projectChatSurfaceId,
  projectChatId,
  setProjectChatId,
  onProjectChatBlockedErrorCodeChange,
  bodyOverride,
}: SectionWindowSurfaceBodyProps): SectionWindowSurfaceBodyView {
  if (bodyOverride !== null && bodyOverride !== undefined) {
    return {
      kind: "override",
      body: bodyOverride,
    };
  }

  if (isMinimized) {
    return { kind: "none" };
  }

  return {
    kind: "area",
    props: {
      sectionId,
      sectionTypeName,
      bgColor,
      isMinimized,
      isUserView: false,
      chatHost,
      chatModeOverride,
      projectChatSurfaceId,
      projectChatId,
      setProjectChatId,
      onProjectChatBlockedErrorCodeChange,
    },
  };
}
