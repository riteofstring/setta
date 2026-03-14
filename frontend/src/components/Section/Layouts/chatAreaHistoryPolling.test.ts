import { EngineTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  resolveManagedChatHistoryPollIntervalMs,
  resolveManagedChatRunType,
} from "./ChatAreaHistoryPanel";

describe("resolveManagedChatHistoryPollIntervalMs", () => {
  it("polls while a section chat run is active", () => {
    // Active runs should keep the history pane responsive.
    expect(
      resolveManagedChatHistoryPollIntervalMs({
        hasLoadError: false,
        hasRunningHistoryEntry: true,
      }),
    ).toBe(5000);
  });

  it("retries load failures even when no run is active", () => {
    // Load failures need periodic retries so transient errors self-heal.
    expect(
      resolveManagedChatHistoryPollIntervalMs({
        hasLoadError: true,
        hasRunningHistoryEntry: false,
      }),
    ).toBe(10000);
  });

  it("stops polling when idle and healthy", () => {
    // Idle history should avoid unnecessary background polling.
    expect(
      resolveManagedChatHistoryPollIntervalMs({
        hasLoadError: false,
        hasRunningHistoryEntry: false,
      }),
    ).toBeNull();
  });
});

describe("resolveManagedChatRunType", () => {
  it("maps external engines to external-agent history", () => {
    expect(resolveManagedChatRunType(EngineTypeEnum.external_agent)).toBe(
      "external_agent",
    );
  });

  it("maps Setta LLM engines to llm history", () => {
    expect(resolveManagedChatRunType(EngineTypeEnum.setta_llm)).toBe(
      "llm_chat",
    );
  });

  it("returns null when no managed run type applies", () => {
    expect(resolveManagedChatRunType(null)).toBeNull();
  });
});
