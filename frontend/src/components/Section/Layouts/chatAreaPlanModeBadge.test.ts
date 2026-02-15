import { describe, expect, it } from "vitest";
import { EngineTypeEnum } from "utils/generatedTypes";
import { shouldShowPlanModeBadge } from "./ChatArea";

describe("shouldShowPlanModeBadge", () => {
  it("shows plan badge when runtime policy uses config mode for claude external plan config", () => {
    expect(
      shouldShowPlanModeBadge({
        engineType: EngineTypeEnum.external_agent,
        externalAgentToolType: "claude_code",
        approvalPolicy: "plan",
        permissionMode: "config_toml_custom",
      }),
    ).toBe(true);
  });

  it("hides plan badge when permission mode overrides config policy", () => {
    expect(
      shouldShowPlanModeBadge({
        engineType: EngineTypeEnum.external_agent,
        externalAgentToolType: "claude_code",
        approvalPolicy: "plan",
        permissionMode: "minimal",
      }),
    ).toBe(false);
  });

  it("hides plan badge for non-external engines", () => {
    expect(
      shouldShowPlanModeBadge({
        engineType: EngineTypeEnum.setta_llm,
        externalAgentToolType: "claude_code",
        approvalPolicy: "plan",
        permissionMode: "config_toml_custom",
      }),
    ).toBe(false);
  });

  it("hides plan badge for non-claude tool types", () => {
    expect(
      shouldShowPlanModeBadge({
        engineType: EngineTypeEnum.external_agent,
        externalAgentToolType: "other_tool",
        approvalPolicy: "plan",
        permissionMode: "config_toml_custom",
      }),
    ).toBe(false);
  });
});
