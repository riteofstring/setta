/* @vitest-environment jsdom */

import {
  act,
  Profiler,
  type ComponentProps,
  type ProfilerOnRenderCallback,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { useAgenticScopeHighlights, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  createCodeSectionImpl,
  createCore,
  createProjectConfig,
  createUserDefaultCodeSectionImpl,
  createVariant,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SectionContainerCore } from "./SectionContainerCore";

vi.mock("state/activeSectionUI", () => ({
  useIsSectionUIActive: () => false,
}));

vi.mock("state/hooks/sectionRef", () => ({
  useSectionRefAndInit: () => null,
}));

vi.mock("./utils", async () => {
  const actual = await vi.importActual<typeof import("./utils")>("./utils");
  return {
    ...actual,
    useAiSectionHighlight: () => false,
  };
});

vi.mock("./sectionChromeAppearance", () => ({
  useSectionChromeAppearance: () => ({
    hasSectionStyleTheme: false,
    sectionStyleVars: undefined,
    useMetaControlStyle: false,
  }),
}));

vi.mock("./sectionChrome", () => ({
  getSectionContainerShellClassName: ({
    isJoinedAttachedTerminalChild,
    isWriteScope,
    joinedCorners,
    omitAgenticHandleScopeClass,
    outlineTone,
    positionAndSizeLocked,
    scopeHighlight,
    showAiHighlight,
  }: {
    isJoinedAttachedTerminalChild: boolean;
    isWriteScope: boolean;
    joinedCorners: string;
    omitAgenticHandleScopeClass: boolean;
    outlineTone: string;
    positionAndSizeLocked: boolean;
    scopeHighlight: string;
    showAiHighlight: boolean;
  }) =>
    [
      "mock-shell",
      outlineTone,
      scopeHighlight,
      showAiHighlight ? "mock-ai-highlight" : "mock-ai-idle",
      isWriteScope ? "mock-write-scope" : "mock-no-write-scope",
      positionAndSizeLocked ? "mock-locked" : "mock-unlocked",
      isJoinedAttachedTerminalChild ? "mock-joined-child" : "mock-plain-child",
      omitAgenticHandleScopeClass ? "mock-omit-scope" : "mock-keep-scope",
      `mock-corners-${joinedCorners}`,
    ].join(" "),
  resolveSectionChromeShellDecorations: ({
    isReadScope,
    isWriteScope,
  }: {
    isReadScope: boolean;
    isWriteScope: boolean;
  }) => ({
    outlineTone: "mock-outline",
    scopeHighlight: isWriteScope ? "write" : isReadScope ? "read" : "none",
    showAiHighlight: false,
    zIndexClassName: "mock-z",
  }),
}));

vi.mock("./AgenticEdgeHandles", () => ({
  AgenticEdgeHandles: () => <div data-testid="mock-agentic-edge-handles" />,
}));

vi.mock("./ChatSharedEdgeHandles", () => ({
  ChatSharedEdgeHandles: () => (
    <div data-testid="mock-chat-shared-edge-handles" />
  ),
}));

vi.mock("./StateMachineEdgeHandles", () => ({
  StateMachineEdgeHandles: () => (
    <div data-testid="mock-state-machine-edge-handles" />
  ),
}));

vi.mock("./MinimizedDataEdgeHandles", () => ({
  MinimizedDataEdgeHandles: ({ sectionId }: { sectionId: string }) => (
    <div
      data-testid="mock-minimized-data-edge-handles"
      data-section-id={sectionId}
    />
  ),
}));

vi.mock("./SectionContainerCoreResizabe", () => ({
  SectionContainerCoreResizable: ({ sectionId }: { sectionId: string }) => (
    <div
      data-testid="mock-section-container-core-resizable"
      data-section-id={sectionId}
    />
  ),
}));

type RenderedSectionContainerCore = {
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

async function renderSectionContainerCore(
  onRender: ProfilerOnRenderCallback,
  props?: Partial<ComponentProps<typeof SectionContainerCore>>,
): Promise<RenderedSectionContainerCore> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
      <Profiler id="section-container-core-profiler" onRender={onRender}>
        <SectionContainerCore
          sectionId="section-a"
          isUserView={false}
          {...props}
        />
      </Profiler>,
    );
  });

  return { host, root };
}

describe("SectionContainerCore", () => {
  beforeEach(() => {
    resetProjectStores();

    const projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: {
        "section-a": "variant-a",
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
        "impl-b": createCodeSectionImpl(createUserDefaultCodeSectionImpl(), {
          id: "impl-b",
          type: SectionTypeEnum.Code,
        }),
      };
      state.previewSectionVariantMap = {};
    });
    useAgenticScopeHighlights.setState({
      readSectionIdsByProjectConfigId: {
        "project-1": {
          "section-a": true,
        },
      },
      writeSectionIdsByProjectConfigId: {},
    });

    syncStoreInitialState(useProjectState);
    syncStoreInitialState(useAgenticScopeHighlights);
  });

  afterEach(() => {
    resetProjectStores();
    document.body.innerHTML = "";
  });

  it("keeps the mounted section shell out of unrelated scope-map commits", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const { host, root } = await renderSectionContainerCore(onRender);

    try {
      const initialCommitCount = onRender.mock.calls.length;

      await act(async () => {
        useAgenticScopeHighlights.setState((state) => ({
          readSectionIdsByProjectConfigId: {
            ...state.readSectionIdsByProjectConfigId,
            "project-1": {
              ...(state.readSectionIdsByProjectConfigId["project-1"] ?? {}),
              "section-b": true,
            },
          },
        }));
      });

      expect(onRender).toHaveBeenCalledTimes(initialCommitCount);
      const shell = host.querySelector<HTMLElement>(
        "[data-section-id='section-a']",
      );
      expect(shell).not.toBeNull();
      expect(shell?.className).toContain("read");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("rerenders when the current section changes from read scope to write scope", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const { host, root } = await renderSectionContainerCore(onRender);

    try {
      const initialCommitCount = onRender.mock.calls.length;

      await act(async () => {
        useAgenticScopeHighlights.setState({
          readSectionIdsByProjectConfigId: {
            "project-1": {
              "section-a": true,
            },
          },
          writeSectionIdsByProjectConfigId: {
            "project-1": {
              "section-a": true,
            },
          },
        });
      });

      expect(onRender.mock.calls.length).toBeGreaterThan(initialCommitCount);
      const shell = host.querySelector<HTMLElement>(
        "[data-section-id='section-a']",
      );
      expect(shell).not.toBeNull();
      expect(shell?.className).toContain("write");
      expect(shell?.className).not.toContain("read");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("skips shell-level chrome subscriptions when the shell layer owns the visuals", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const { host, root } = await renderSectionContainerCore(onRender, {
      shellChromeOwner: "shell-layer",
    });

    try {
      const initialCommitCount = onRender.mock.calls.length;

      await act(async () => {
        useAgenticScopeHighlights.setState({
          readSectionIdsByProjectConfigId: {
            "project-1": {
              "section-a": true,
            },
          },
          writeSectionIdsByProjectConfigId: {
            "project-1": {
              "section-a": true,
            },
          },
        });
      });

      expect(onRender).toHaveBeenCalledTimes(initialCommitCount);
      expect(
        host.querySelector('[data-testid="mock-agentic-edge-handles"]'),
      ).toBeNull();
      expect(
        host.querySelector('[data-testid="mock-minimized-data-edge-handles"]'),
      ).toBeNull();
      const shell = host.querySelector<HTMLElement>(
        "[data-section-id='section-a']",
      );
      expect(shell?.dataset.shellChromeOwner).toBe("shell-layer");
      expect(shell?.className).toContain("z-10");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
