import type { Spec } from "@json-render/core";
import { describe, expect, it } from "vitest";

import { EngineTypeEnum } from "utils/generatedTypes";

import {
  cloneSpecForPreview,
  resolveHiddenGenerationEngineSelection,
} from "./AppConfigPane";

describe("AppConfigPane hidden generation helpers", () => {
  it("keeps preview snapshots detached from live streaming spec mutations", () => {
    // The preview copy must not share nested object references with the mutable source.
    const source: Spec = {
      root: "root",
      elements: {
        root: {
          key: "root",
          type: "Card",
          props: { title: "Initial" },
          children: [],
        },
      },
    };

    const preview = cloneSpecForPreview(source);
    const previewElement = preview.elements.root as {
      props?: { title?: string };
    };
    if (!previewElement.props) {
      throw new Error("Expected preview element props");
    }
    previewElement.props.title = "Updated";

    const sourceElement = source.elements.root as {
      props?: { title?: string };
    };
    expect(sourceElement.props?.title).toBe("Initial");
  });

  it("prefers a usable active-chat engine over fallback ordering", () => {
    const selection = resolveHiddenGenerationEngineSelection({
      activeChatEngineConfigId: "engine-active",
      engineConfigs: [
        {
          id: "engine-fallback",
          engineType: EngineTypeEnum.setta_llm,
          settaLlmConfigId: "llm-fallback",
        },
        {
          id: "engine-active",
          engineType: EngineTypeEnum.setta_llm,
          settaLlmConfigId: "llm-active",
        },
      ],
      availableLLMConfigIds: new Set(["llm-fallback", "llm-active"]),
      externalAgentHealthByConfigId: new Map(),
      defaultLLMConfigId: null,
    });

    expect(selection).toEqual({
      engineConfigId: "engine-active",
      isExternalEngine: false,
      forceNewChat: false,
    });
  });

  it("forces a new chat when active-chat engine is unavailable and fallback differs", () => {
    const selection = resolveHiddenGenerationEngineSelection({
      activeChatEngineConfigId: "engine-active",
      engineConfigs: [
        {
          id: "engine-fallback",
          engineType: EngineTypeEnum.setta_llm,
          settaLlmConfigId: "llm-fallback",
        },
        {
          id: "engine-active",
          engineType: EngineTypeEnum.setta_llm,
          settaLlmConfigId: "llm-active",
        },
      ],
      availableLLMConfigIds: new Set(["llm-fallback"]),
      externalAgentHealthByConfigId: new Map(),
      defaultLLMConfigId: null,
    });

    expect(selection).toEqual({
      engineConfigId: "engine-fallback",
      isExternalEngine: false,
      forceNewChat: true,
    });
  });

  it("does not select external engines when health preflight is unavailable", () => {
    const selection = resolveHiddenGenerationEngineSelection({
      activeChatEngineConfigId: null,
      engineConfigs: [
        {
          id: "external-engine",
          engineType: EngineTypeEnum.external_agent,
          externalAgentConfigId: "external-config",
        },
      ],
      availableLLMConfigIds: new Set(),
      externalAgentHealthByConfigId: new Map([
        [
          "external-config",
          {
            available: false,
            supported: true,
          },
        ],
      ]),
      defaultLLMConfigId: null,
    });

    expect(selection).toEqual({
      engineConfigId: null,
      isExternalEngine: false,
      forceNewChat: false,
    });
  });

  it("selects healthy external engines when no managed LLM engine is usable", () => {
    const selection = resolveHiddenGenerationEngineSelection({
      activeChatEngineConfigId: null,
      engineConfigs: [
        {
          id: "external-engine",
          engineType: EngineTypeEnum.external_agent,
          externalAgentConfigId: "external-config",
        },
      ],
      availableLLMConfigIds: new Set(),
      externalAgentHealthByConfigId: new Map([
        [
          "external-config",
          {
            available: true,
            supported: true,
          },
        ],
      ]),
      defaultLLMConfigId: null,
    });

    expect(selection).toEqual({
      engineConfigId: "external-engine",
      isExternalEngine: true,
      forceNewChat: false,
    });
  });

  it("treats managed engines without explicit config id as usable via default config", () => {
    const selection = resolveHiddenGenerationEngineSelection({
      activeChatEngineConfigId: null,
      engineConfigs: [
        {
          id: "engine-managed-default",
          engineType: EngineTypeEnum.setta_llm,
          settaLlmConfigId: null,
        },
      ],
      availableLLMConfigIds: new Set(["llm-default"]),
      externalAgentHealthByConfigId: new Map(),
      defaultLLMConfigId: "llm-default",
    });

    expect(selection).toEqual({
      engineConfigId: "engine-managed-default",
      isExternalEngine: false,
      forceNewChat: false,
    });
  });
});
