import { EngineTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  type ExternalEngineStatus,
  getExternalEngineIssueMessage,
  resolveEffectiveThinking,
  supportsThinkingExecutionControl,
} from "./engineUtils";

describe("getExternalEngineIssueMessage", () => {
  it("returns null when the external engine is available or still loading", () => {
    // Healthy and loading states should not create warning notifications.
    const available: ExternalEngineStatus = {
      status: "available",
      issues: [],
      name: "Codex",
    };
    const loading: ExternalEngineStatus = {
      status: "loading",
      issues: [],
      name: "Codex",
    };

    expect(getExternalEngineIssueMessage(available)).toBeNull();
    expect(getExternalEngineIssueMessage(loading)).toBeNull();
  });

  it("includes the engine name and issue list for unavailable states", () => {
    // The warning should provide enough detail for the notifications area.
    const unavailable: ExternalEngineStatus = {
      status: "unavailable",
      issues: ["Could not resolve host", "Missing SDK binary"],
      name: "Codex",
    };

    expect(getExternalEngineIssueMessage(unavailable)).toBe(
      'External engine "Codex" unavailable: Could not resolve host; Missing SDK binary',
    );
  });

  it("falls back to a generic unavailable label when no details exist", () => {
    // Missing/invalid config states may not include a name or issue details.
    const missing: ExternalEngineStatus = {
      status: "missing",
      issues: [],
      name: null,
    };

    expect(getExternalEngineIssueMessage(missing)).toBe(
      "External engine unavailable",
    );
  });
});

describe("supportsThinkingExecutionControl", () => {
  it("only enables the thinking control for external agents", () => {
    expect(
      supportsThinkingExecutionControl(EngineTypeEnum.external_agent),
    ).toBe(true);
    expect(supportsThinkingExecutionControl(EngineTypeEnum.setta_llm)).toBe(
      false,
    );
    expect(supportsThinkingExecutionControl(null)).toBe(false);
  });
});

describe("resolveEffectiveThinking", () => {
  it("forces thinking off for managed Go engines", () => {
    expect(
      resolveEffectiveThinking({
        engineType: EngineTypeEnum.setta_llm,
        requestedThinking: true,
      }),
    ).toBe(false);
  });

  it("preserves the requested thinking state for external agents", () => {
    expect(
      resolveEffectiveThinking({
        engineType: EngineTypeEnum.external_agent,
        requestedThinking: true,
      }),
    ).toBe(true);
    expect(
      resolveEffectiveThinking({
        engineType: EngineTypeEnum.external_agent,
        requestedThinking: false,
      }),
    ).toBe(false);
  });
});
