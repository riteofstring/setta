import { type ChatPermissionModeValue } from "components/Chat/chatComposerControls";
import { EngineTypeEnum } from "utils/generatedTypes";

type PlanModeBadgeArgs = {
  engineType: EngineTypeEnum | null;
  externalAgentToolType: string | null;
  approvalPolicy: string | null;
  permissionMode: ChatPermissionModeValue;
};

export function shouldShowPlanModeBadge({
  engineType,
  externalAgentToolType,
  approvalPolicy,
  permissionMode,
}: PlanModeBadgeArgs): boolean {
  return (
    engineType === EngineTypeEnum.external_agent &&
    externalAgentToolType === "claude_code" &&
    approvalPolicy === "plan" &&
    permissionMode === "config_toml_custom"
  );
}
