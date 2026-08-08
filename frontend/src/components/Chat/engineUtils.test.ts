import type { HttpapiExternalAgentPreflightStatus } from "openapi/http";
import { type EngineConfig, EngineTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  getExternalEngineIssueMessage,
  getExternalEngineStatus,
  resolveEffectiveThinking,
  supportsThinkingExecutionControl,
} from "./engineUtils";

const managedEngineWithoutThinking: EngineConfig = {
  id: "engine-managed",
  name: "Managed Engine",
  engineType: EngineTypeEnum.setta_llm,
  settaLlmConfigId: "llm-managed",
  externalAgentConfigId: null,
  defaults: { thinking: null },
  runtimeSupport: null,
};

const managedEngineWithThinking: EngineConfig = {
  ...managedEngineWithoutThinking,
  runtimeSupport: { thinking: true },
};

const externalEngine: EngineConfig = {
  id: "engine-external",
  name: "External Engine",
  engineType: EngineTypeEnum.external_agent,
  settaLlmConfigId: null,
  externalAgentConfigId: "external-codex",
  defaults: { thinking: null },
  runtimeSupport: { thinking: false },
};

const availableExternalHealth: HttpapiExternalAgentPreflightStatus = {
  configId: "external-codex",
  name: "Codex",
  supported: true,
  available: true,
  issues: [],
};

describe("getExternalEngineStatus", () => {
  it("returns null for non-external engines and a loading state before health is ready", () => {
    expect(
      getExternalEngineStatus(managedEngineWithThinking, [], false),
    ).toBeNull();
    expect(getExternalEngineStatus(externalEngine, [], false)).toEqual({
      status: "loading",
      issues: [],
      name: null,
    });
  });

  it("returns a missing state when the external engine is misconfigured or absent from health", () => {
    expect(
      getExternalEngineStatus(
        { ...externalEngine, externalAgentConfigId: null },
        [availableExternalHealth],
        true,
      ),
    ).toEqual({
      status: "missing",
      issues: ["Missing external agent config id"],
      name: null,
    });
    expect(getExternalEngineStatus(externalEngine, [], true)).toEqual({
      status: "missing",
      issues: ["External agent config not found"],
      name: null,
    });
  });

  it("returns unavailable details when preflight reports an unsupported or unavailable engine", () => {
    expect(
      getExternalEngineStatus(
        externalEngine,
        [
          {
            ...availableExternalHealth,
            supported: false,
            available: false,
            issues: ["Missing SDK binary"],
          },
        ],
        true,
      ),
    ).toEqual({
      status: "unavailable",
      issues: ["External agent is not supported", "Missing SDK binary"],
      name: "Codex",
    });
  });

  it("returns the available status when preflight succeeds", () => {
    expect(
      getExternalEngineStatus(externalEngine, [availableExternalHealth], true),
    ).toEqual({
      status: "available",
      issues: [],
      name: "Codex",
    });
  });
});

describe("getExternalEngineIssueMessage", () => {
  it("returns null when the external engine is available or still loading", () => {
    // Healthy and loading states should not create warning notifications.
    const available = {
      status: "available",
      issues: [],
      name: "Codex",
    };
    const loading = {
      status: "loading",
      issues: [],
      name: "Codex",
    };

    expect(getExternalEngineIssueMessage(available)).toBeNull();
    expect(getExternalEngineIssueMessage(loading)).toBeNull();
  });

  it("includes the engine name and issue list for unavailable states", () => {
    // The warning should provide enough detail for the notifications area.
    const unavailable = {
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
    const missing = {
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
  it("enables the thinking control for external agents and managed engines with runtime support", () => {
    expect(supportsThinkingExecutionControl(externalEngine)).toBe(true);
    expect(supportsThinkingExecutionControl(managedEngineWithThinking)).toBe(
      true,
    );
    expect(supportsThinkingExecutionControl(managedEngineWithoutThinking)).toBe(
      false,
    );
    expect(supportsThinkingExecutionControl(null)).toBe(false);
  });
});

describe("resolveEffectiveThinking", () => {
  it("forces thinking off for managed engines without runtime support", () => {
    expect(
      resolveEffectiveThinking({
        engineConfig: managedEngineWithoutThinking,
        requestedThinking: true,
      }),
    ).toBe(false);
  });

  it("preserves the requested thinking state for supported engines", () => {
    expect(
      resolveEffectiveThinking({
        engineConfig: managedEngineWithThinking,
        requestedThinking: true,
      }),
    ).toBe(true);
    expect(
      resolveEffectiveThinking({
        engineConfig: externalEngine,
        requestedThinking: true,
      }),
    ).toBe(true);
    expect(
      resolveEffectiveThinking({
        engineConfig: externalEngine,
        requestedThinking: false,
      }),
    ).toBe(false);
  });
});
