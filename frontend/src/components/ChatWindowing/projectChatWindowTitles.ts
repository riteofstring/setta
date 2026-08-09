import { ChatWindowModeEnum, type ChatWindowMode } from "utils/generatedTypes";

export function buildProjectChatWindowTitle(
  mode: ChatWindowMode,
  instanceId: string,
  sectionIdOrNull: string | null,
  customTitle: string | null,
  sectionNamesById: Record<string, string>,
): string {
  if (sectionIdOrNull) {
    const sectionName = sectionNamesById[sectionIdOrNull];
    if (typeof sectionName === "string" && sectionName.trim().length > 0) {
      return sectionName;
    }
  }
  if (typeof customTitle === "string" && customTitle.trim().length > 0) {
    return customTitle.trim();
  }
  if (mode === ChatWindowModeEnum.git_graph_mode) {
    return "Git Graph";
  }
  const suffix = instanceId.split("-").pop() ?? "";
  if (/^\d+$/.test(suffix)) {
    return `Chat Window ${suffix}`;
  }
  return instanceId.replaceAll("-", " ");
}
