import { shouldShowPlanModeBadge } from "components/Chat/planModeBadgeUtils";
import { EngineTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  getDefaultProjectChatPermissionMode,
  resolveWorkspaceRootPollDelayMs,
} from "./ProjectChatCore";

describe("getDefaultProjectChatPermissionMode", () => {
  it("defaults external engines to config_toml_custom", () => {
    // External engines should preserve the configured approval policy by default.
    expect(
      getDefaultProjectChatPermissionMode(EngineTypeEnum.external_agent),
    ).toBe("config_toml_custom");
  });

  it("defaults managed engines to minimal", () => {
    // Managed LLM engines should keep the standard minimal execution default.
    expect(getDefaultProjectChatPermissionMode(EngineTypeEnum.setta_llm)).toBe(
      "minimal",
    );
    expect(getDefaultProjectChatPermissionMode(null)).toBe("minimal");
  });
});

describe("resolveWorkspaceRootPollDelayMs", () => {
  it("keeps fast polling before stability threshold", () => {
    expect(resolveWorkspaceRootPollDelayMs(0)).toBe(5000);
    expect(resolveWorkspaceRootPollDelayMs(1)).toBe(5000);
  });

  it("backs off polling once the root is stable", () => {
    expect(resolveWorkspaceRootPollDelayMs(2)).toBe(30000);
    expect(resolveWorkspaceRootPollDelayMs(5)).toBe(30000);
  });
});

describe("project chat plan badge runtime policy", () => {
  it("shows plan badge when the effective permission mode keeps config policy", () => {
    const permissionMode = getDefaultProjectChatPermissionMode(
      EngineTypeEnum.external_agent,
    );
    expect(
      shouldShowPlanModeBadge({
        engineType: EngineTypeEnum.external_agent,
        externalAgentToolType: "claude_code",
        approvalPolicy: "plan",
        permissionMode,
      }),
    ).toBe(true);
  });

  it("hides plan badge when permission mode overrides plan policy", () => {
    expect(
      shouldShowPlanModeBadge({
        engineType: EngineTypeEnum.external_agent,
        externalAgentToolType: "claude_code",
        approvalPolicy: "plan",
        permissionMode: "minimal",
      }),
    ).toBe(false);
  });
});
