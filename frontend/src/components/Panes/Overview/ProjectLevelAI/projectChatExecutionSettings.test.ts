import { EngineTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { getDefaultProjectChatPermissionMode } from "./ProjectChatCore";

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
