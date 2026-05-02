import { describe, expect, it } from "vitest";

import { getChatEditDisabledReason } from "./chatEditUtils";

describe("chatEditUtils", () => {
  it("blocks frozen chats before any engine checks", () => {
    expect(
      getChatEditDisabledReason({
        hasEngineConfig: false,
        hasLLMConfig: false,
        isExternalEngine: false,
        externalEngineAvailable: false,
        isFrozen: true,
      }),
    ).toBe("Chat is frozen.");
  });

  it("requires an external engine to be available before editing", () => {
    expect(
      getChatEditDisabledReason({
        hasEngineConfig: true,
        hasLLMConfig: false,
        isExternalEngine: true,
        externalEngineAvailable: false,
      }),
    ).toBe("External agent is unavailable.");
    expect(
      getChatEditDisabledReason({
        hasEngineConfig: true,
        hasLLMConfig: false,
        isExternalEngine: true,
        externalEngineAvailable: true,
      }),
    ).toBeNull();
  });

  it("requires an LLM config for non-external engines unless none exist", () => {
    expect(
      getChatEditDisabledReason({
        hasEngineConfig: true,
        hasLLMConfig: false,
        isExternalEngine: false,
        externalEngineAvailable: true,
      }),
    ).toBe("Select an LLM config to edit messages.");
    expect(
      getChatEditDisabledReason({
        hasEngineConfig: true,
        hasLLMConfig: false,
        isExternalEngine: false,
        externalEngineAvailable: true,
        noLLMConfigsAvailable: true,
      }),
    ).toBe("No LLM configs are available.");
  });
});
