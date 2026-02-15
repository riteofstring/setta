import type { Spec } from "@json-render/core";
import { describe, expect, it } from "vitest";

import { EngineTypeEnum } from "utils/generatedTypes";

import {
  cloneSpecForPreview,
  resolveGenerationFailureMessage,
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
    });

    expect(selection).toEqual({
      engineConfigId: "external-engine",
      isExternalEngine: true,
      forceNewChat: false,
    });
  });

  it("extracts backend message from non-OK stream responses", async () => {
    const response = new Response(
      JSON.stringify({ message: "Missing API key for app spec streaming." }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );

    await expect(resolveGenerationFailureMessage(response)).resolves.toBe(
      "Missing API key for app spec streaming.",
    );
  });

  it("falls back to status text when error payload is non-JSON", async () => {
    const response = new Response("plain text", {
      status: 502,
      headers: { "Content-Type": "text/plain" },
    });

    await expect(resolveGenerationFailureMessage(response)).resolves.toBe(
      "Generation request failed (status 502).",
    );
  });
});
