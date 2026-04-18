/* @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useAgenticScopeHighlights } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  AgenticEdgeKindEnum,
  createAgenticEdge,
  createChatSectionImpl,
  createCodeSectionImpl,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useUpdateAgenticScopeHighlights } from "./agenticScopeHighlights";

type HighlightHarnessProps = Parameters<
  typeof useUpdateAgenticScopeHighlights
>[0];

function HighlightHarness(props: HighlightHarnessProps) {
  useUpdateAgenticScopeHighlights(props);
  return null;
}

async function renderHighlightHarness(
  props: HighlightHarnessProps,
): Promise<{ host: HTMLDivElement; root: Root }> {
  const host = document.createElement("div");
  document.body.appendChild(host);

  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(HighlightHarness, props));
  });

  return { host, root };
}

describe("useUpdateAgenticScopeHighlights", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(async () => {
    document.body.innerHTML = "";
    resetProjectStores();
  });

  it("keeps peer-chat targets out of the stored read highlight map", async () => {
    const activeChatVariantId = "variant-chat-active";
    const activeChatImplId = "impl-chat-active";
    const { host, root } = await renderHighlightHarness({
      projectConfigId: "project-1",
      agenticEdges: [
        createAgenticEdge({
          id: "edge-read",
          sourceSectionId: "section-chat-active",
          targetSectionId: "section-a",
          kind: AgenticEdgeKindEnum.chat_section,
        }),
        createAgenticEdge({
          id: "edge-peer",
          sourceSectionId: "section-chat-active",
          targetSectionId: "section-chat-peer",
          kind: AgenticEdgeKindEnum.chat_chat,
        }),
      ],
      activeIds: ["section-chat-active"],
      topLevelSectionIds: ["section-chat-active"],
      sectionVariantMap: {
        "section-chat-active": activeChatVariantId,
      },
      sectionVariants: {
        [activeChatVariantId]: createVariant({
          id: activeChatVariantId,
          impl: activeChatImplId,
          name: "Active Chat",
          nonPresetImpls: [],
        }),
      },
      sectionImpls: {
        [activeChatImplId]: createChatSectionImpl({
          id: activeChatImplId,
          chatId: "chat-active",
        }),
      },
    });

    try {
      expect(
        useAgenticScopeHighlights.getState().readSectionIdsByProjectConfigId[
          "project-1"
        ],
      ).toEqual({ "section-a": true });
      expect(
        useAgenticScopeHighlights.getState().writeSectionIdsByProjectConfigId[
          "project-1"
        ],
      ).toEqual({ "section-a": true });
      expect(
        useAgenticScopeHighlights.getState().readSectionIdsByProjectConfigId[
          "project-1"
        ]?.["section-chat-peer"],
      ).toBeUndefined();
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("stores highlights for active chats and waiting top-level chats only", async () => {
    const activeChatImplId = "impl-chat-active";
    const waitingChatImplId = "impl-chat-waiting";
    const idleChatImplId = "impl-chat-idle";
    const codeImplId = "impl-code";

    const activeChatVariantId = "variant-chat-active";
    const waitingChatVariantId = "variant-chat-waiting";
    const idleChatVariantId = "variant-chat-idle";
    const codeVariantId = "variant-code";
    const { host, root } = await renderHighlightHarness({
      projectConfigId: "project-1",
      agenticEdges: [
        createAgenticEdge({
          id: "edge-active",
          sourceSectionId: "section-chat-active",
          targetSectionId: "section-a",
          kind: AgenticEdgeKindEnum.chat_section,
        }),
        createAgenticEdge({
          id: "edge-waiting",
          sourceSectionId: "section-chat-waiting",
          targetSectionId: "section-b",
          kind: AgenticEdgeKindEnum.chat_section,
        }),
        createAgenticEdge({
          id: "edge-idle",
          sourceSectionId: "section-chat-idle",
          targetSectionId: "section-c",
          kind: AgenticEdgeKindEnum.chat_section,
        }),
      ],
      activeIds: [
        "section-chat-active",
        "section-code",
        "section-missing-variant",
      ],
      topLevelSectionIds: [
        "section-chat-waiting",
        "section-chat-idle",
        "section-chat-active",
        "section-missing-impl",
      ],
      sectionVariantMap: {
        "section-chat-active": activeChatVariantId,
        "section-chat-waiting": waitingChatVariantId,
        "section-chat-idle": idleChatVariantId,
        "section-code": codeVariantId,
        "section-missing-impl": "variant-missing-impl",
      },
      sectionVariants: {
        [activeChatVariantId]: createVariant({
          id: activeChatVariantId,
          impl: activeChatImplId,
          name: "Active Chat",
          nonPresetImpls: [],
        }),
        [waitingChatVariantId]: createVariant({
          id: waitingChatVariantId,
          impl: waitingChatImplId,
          name: "Waiting Chat",
          nonPresetImpls: [],
        }),
        [idleChatVariantId]: createVariant({
          id: idleChatVariantId,
          impl: idleChatImplId,
          name: "Idle Chat",
          nonPresetImpls: [],
        }),
        [codeVariantId]: createVariant({
          id: codeVariantId,
          impl: codeImplId,
          name: "Code",
          nonPresetImpls: [],
        }),
        "variant-missing-impl": createVariant({
          id: "variant-missing-impl",
          impl: "impl-missing",
          name: "Missing Impl",
          nonPresetImpls: [],
        }),
      },
      sectionImpls: {
        [activeChatImplId]: createChatSectionImpl({
          id: activeChatImplId,
          chatId: "chat-active",
        }),
        [waitingChatImplId]: createChatSectionImpl({
          id: waitingChatImplId,
          chatId: "chat-waiting",
          waitingForResponse: true,
        }),
        [idleChatImplId]: createChatSectionImpl({
          id: idleChatImplId,
          chatId: "chat-idle",
          waitingForResponse: false,
        }),
        [codeImplId]: createCodeSectionImpl({
          id: codeImplId,
        }),
      },
    });

    try {
      expect(
        useAgenticScopeHighlights.getState().readSectionIdsByProjectConfigId[
          "project-1"
        ],
      ).toEqual({ "section-a": true, "section-b": true });
      expect(
        useAgenticScopeHighlights.getState().writeSectionIdsByProjectConfigId[
          "project-1"
        ],
      ).toEqual({ "section-a": true, "section-b": true });
      expect(
        useAgenticScopeHighlights.getState().readSectionIdsByProjectConfigId[
          "project-1"
        ]?.["section-c"],
      ).toBeUndefined();
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
