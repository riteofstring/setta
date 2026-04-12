/* @vitest-environment jsdom */

import { act, Profiler, type ProfilerOnRenderCallback } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useAIFollow, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  createChatSectionImpl,
  createCodeSectionImpl,
  createCore,
  createProjectConfig,
  createUserDefaultChatSectionImpl,
  createUserDefaultCodeSectionImpl,
  createVariant,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAiSectionHighlight } from "./utils";

type RenderedHighlightProbe = {
  host: HTMLDivElement;
  root: Root;
};

function syncStoreInitialState(store: {
  getInitialState?: () => Record<string, unknown>;
  getState: () => Record<string, unknown>;
}) {
  if (!store.getInitialState) {
    return;
  }
  Object.assign(store.getInitialState(), store.getState());
}

function HighlightProbe() {
  const showAiHighlight = useAiSectionHighlight("section-a", "project-1");
  return (
    <div
      data-highlight={showAiHighlight ? "true" : "false"}
      data-testid="probe"
    />
  );
}

async function renderHighlightProbe(
  onRender: ProfilerOnRenderCallback,
): Promise<RenderedHighlightProbe> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
      <Profiler id="ai-highlight-profiler" onRender={onRender}>
        <HighlightProbe />
      </Profiler>,
    );
  });

  return { host, root };
}

describe("useAiSectionHighlight", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetProjectStores();

    const projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: {
        "section-a": "variant-a",
        "chat-selected": "variant-chat",
        "section-b": "variant-b",
      },
    });

    useProjectState.setState((state) => {
      state.projectConfig = projectConfig;
      state.sections = {
        "section-a": createCore({
          id: "section-a",
          name: "Section A",
          variants: ["variant-a"],
          defaultVariant: "variant-a",
        }),
        "chat-selected": createCore({
          id: "chat-selected",
          name: "Chat Selected",
          variants: ["variant-chat"],
          defaultVariant: "variant-chat",
        }),
        "section-b": createCore({
          id: "section-b",
          name: "Section B",
          variants: ["variant-b"],
          defaultVariant: "variant-b",
        }),
      };
      state.sectionVariants = {
        "variant-a": createVariant({
          id: "variant-a",
          name: "Variant A",
          impl: "impl-a",
          nonPresetImpls: [],
        }),
        "variant-chat": createVariant({
          id: "variant-chat",
          name: "Variant Chat",
          impl: "impl-chat",
          nonPresetImpls: [],
        }),
        "variant-b": createVariant({
          id: "variant-b",
          name: "Variant B",
          impl: "impl-b",
          nonPresetImpls: [],
        }),
      };
      state.sectionImpls = {
        "impl-a": createCodeSectionImpl(createUserDefaultCodeSectionImpl(), {
          id: "impl-a",
          type: SectionTypeEnum.Code,
        }),
        "impl-chat": createChatSectionImpl(
          createUserDefaultChatSectionImpl({ chatId: "chat-1" }),
          {
            id: "impl-chat",
            type: SectionTypeEnum.Chat,
            chatId: "chat-1",
          },
        ),
        "impl-b": createCodeSectionImpl(createUserDefaultCodeSectionImpl(), {
          id: "impl-b",
          type: SectionTypeEnum.Code,
          code: "print('b')",
        }),
      };
      state.previewSectionVariantMap = {};
    });
    useAIFollow.setState({
      mode: "selected",
      isFollowTransitioning: false,
      selectedChatIdsByProjectConfigId: {},
      selectedSectionIdsByProjectConfigId: {
        "project-1": ["chat-selected"],
      },
      toolArgumentsIdsByProjectConfigId: {
        "project-1": {
          "chat-1": {
            section: ["section-a"],
          },
        },
      },
      toolResultIdsByProjectConfigId: {},
      scopeViolationEdgesByProjectConfigId: {},
    });

    syncStoreInitialState(useProjectState);
    syncStoreInitialState(useAIFollow);
  });

  afterEach(() => {
    vi.useRealTimers();
    resetProjectStores();
    document.body.innerHTML = "";
  });

  it("keeps the mounted shell highlight out of unrelated section impl commits", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const { host, root } = await renderHighlightProbe(onRender);

    try {
      const initialCommitCount = onRender.mock.calls.length;

      await act(async () => {
        useProjectState.setState((state) => {
          const impl = state.sectionImpls["impl-b"];
          if (!impl || impl.type !== SectionTypeEnum.Code) {
            throw new Error("Missing unrelated code impl");
          }
          impl.code = "print('still unrelated')";
        });
      });

      expect(onRender).toHaveBeenCalledTimes(initialCommitCount);
      expect(
        host
          .querySelector("[data-testid='probe']")
          ?.getAttribute("data-highlight"),
      ).toBe("true");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("rerenders when the selected chat section changes to a different chat id", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const { host, root } = await renderHighlightProbe(onRender);

    try {
      const initialCommitCount = onRender.mock.calls.length;

      await act(async () => {
        useProjectState.setState((state) => {
          const impl = state.sectionImpls["impl-chat"];
          if (!impl || impl.type !== SectionTypeEnum.Chat) {
            throw new Error("Missing selected chat impl");
          }
          impl.chatId = "chat-2";
        });
      });
      await act(async () => {
        vi.advanceTimersByTime(700);
      });

      expect(onRender.mock.calls.length).toBeGreaterThan(initialCommitCount);
      expect(
        host
          .querySelector("[data-testid='probe']")
          ?.getAttribute("data-highlight"),
      ).toBe("false");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
