import type { EngineType } from "utils/generatedTypes";

import { ProjectAISettings } from "./ProjectAISettings";
import { ProjectChatSkillsMcpViewer } from "./ProjectChatSkillsMcpViewer";
import type { ProjectChatAuxTabId } from "./projectChatSurfaceViewModel";

export function ProjectChatAuxViewContent({
  projectChatAuxView,
  projectConfigId,
  chatId,
  engineConfigId,
  engineType,
  externalAgentToolType,
}: {
  projectChatAuxView: ProjectChatAuxTabId | "none";
  projectConfigId: string;
  chatId: string | null | undefined;
  engineConfigId: string | null;
  engineType: EngineType | null;
  externalAgentToolType: string | null;
}) {
  switch (projectChatAuxView) {
    case "skills":
    case "mcp":
    case "slash_commands":
      return (
        <ProjectChatSkillsMcpViewer
          projectConfigId={projectConfigId}
          chatId={chatId}
          engineConfigId={engineConfigId}
          engineType={engineType}
          externalAgentToolType={externalAgentToolType}
          viewMode={projectChatAuxView}
        />
      );
    case "ai_settings":
      return <ProjectAISettings />;
    default:
      return null;
  }
}
