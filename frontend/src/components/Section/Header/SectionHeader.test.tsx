/* @vitest-environment jsdom */

import { Profiler, act, type ProfilerOnRenderCallback } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import {
  useAIFollow,
  useLspDiagnostics,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  CodeLanguageEnum,
  SectionTypeEnum,
  createChatSectionImpl,
  createCodeSectionImpl,
  createCore,
  createProjectConfig,
  createUserDefaultChatSectionImpl,
  createUserDefaultCodeSectionImpl,
  createVariant,
  type Core,
  type SettaLspDiagnostic,
  type Variant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("components/Utils/FloatingBox", () => ({
  getFloatingBoxHandlers: ({
    content,
    title,
  }: {
    content?: string;
    title?: string;
  }) => ({
    "data-tooltip-content": content ?? title ?? "",
  }),
}));

import { SectionHeader, hasMarkdownHeadingText } from "./SectionHeader";

function syncStoreInitialState(store: {
  getState: () => Record<string, unknown>;
  getInitialState?: () => Record<string, unknown>;
}) {
  if (!store.getInitialState) {
    return;
  }
  const initial = store.getInitialState();
  Object.assign(initial, store.getState());
}

type RenderedProfiledHeader = {
  host: HTMLDivElement;
  root: Root;
};

async function renderProfiledHeader({
  onRender,
  sectionId,
  sectionTypeName,
}: {
  onRender: ProfilerOnRenderCallback;
  sectionId: string;
  sectionTypeName: SectionTypeEnum;
}): Promise<RenderedProfiledHeader> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
      <Profiler id="section-header-profiler" onRender={onRender}>
        <SectionHeader
          sectionId={sectionId}
          sectionTypeName={sectionTypeName}
          isInOtherProjectConfigs={false}
          isUserView={true}
          isRoot={false}
          hasSectionStyleTheme={false}
          trackMeasuredHeight={false}
          controlsRenderer={({ isFollowSelected }) => (
            <div data-follow-selected={isFollowSelected ? "true" : "false"} />
          )}
          layoutRenderer={({ actions, leadingControls, title }) => (
            <div>
              {leadingControls}
              {title}
              {actions}
            </div>
          )}
        />
      </Profiler>,
    );
  });

  return { host, root };
}

describe("hasMarkdownHeadingText", () => {
  it("returns true for h1-h6 headings", () => {
    expect(hasMarkdownHeadingText("# Title")).toBe(true);
    expect(hasMarkdownHeadingText("## Tasks")).toBe(true);
    expect(hasMarkdownHeadingText("### Notes")).toBe(true);
    expect(hasMarkdownHeadingText("###### Deep")).toBe(true);
  });

  it("accepts up to three leading spaces", () => {
    expect(hasMarkdownHeadingText("  ## Indented")).toBe(true);
  });

  it("rejects four-space code block headings", () => {
    expect(hasMarkdownHeadingText("    # Not a heading")).toBe(false);
  });

  it("detects headings after leading text", () => {
    expect(hasMarkdownHeadingText("Intro\n# Heading\nMore")).toBe(true);
  });

  it("returns false when there is no heading text", () => {
    expect(hasMarkdownHeadingText("#   ")).toBe(false);
  });

  it("returns false for seven hashes", () => {
    expect(hasMarkdownHeadingText("####### Too deep")).toBe(false);
  });
});

describe("SectionHeader diagnostics badges", () => {
  const sectionId = "section-1";
  const variantId = "variant-1";
  const implId = "impl-1";

  const baseDiagnostic: SettaLspDiagnostic = {
    message: "Bad code",
    severity: 1,
    code: "reportFoo",
    source: "pyright",
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 1 },
    },
    uri: "file:///tmp/section.py",
  };

  const sectionCore: Core = {
    id: sectionId,
    name: "Section",
    displayName: "",
    variants: [variantId],
    defaultVariant: variantId,
    sharedModifier: {},
    unsharedKeys: [],
  };

  const sectionVariant: Variant = {
    id: variantId,
    name: "Variant",
    impl: implId,
    nonPresetImpls: [],
    modifier: {},
    isFrozen: false,
  };

  const baseImpl = createCodeSectionImpl(createUserDefaultCodeSectionImpl(), {
    id: implId,
    name: "Code",
    code: "print('hi')",
    codeLanguage: CodeLanguageEnum.python,
    diagnosticsIgnoreState: {
      muted: false,
      suppressedCodes: [],
    },
  });

  beforeEach(() => {
    const projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: { [sectionId]: variantId },
      topLevelSections: {
        [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
      },
    });

    resetProjectStores();
    useShareSession.setState({ isDeploymentMode: false });
    useProjectState.setState((state) => {
      state.projectConfig = projectConfig;
      state.sections = { [sectionId]: sectionCore };
      state.sectionVariants = { [variantId]: sectionVariant };
      state.sectionImpls = { [implId]: { ...baseImpl } };
      state.previewSectionVariantMap = {};
    });
    useLspDiagnostics.setState({ codeSections: {}, unmappedGenCode: [] });
    syncStoreInitialState(useProjectState);
    syncStoreInitialState(useShareSession);
    syncStoreInitialState(useLspDiagnostics);
  });

  afterEach(() => {
    resetProjectStores();
  });

  function renderHeader() {
    const state = useProjectState.getState();
    expect(state.projectConfig.sectionVariantMap[sectionId]).toBe(variantId);
    return renderToStaticMarkup(
      <SectionHeader
        sectionId={sectionId}
        sectionTypeName={SectionTypeEnum.Code}
        isInOtherProjectConfigs={false}
        isUserView={true}
        isRoot={false}
        hasSectionStyleTheme={false}
      />,
    );
  }

  it("shows issue count when diagnostics exist", () => {
    useLspDiagnostics.setState({
      codeSections: { [sectionId]: [baseDiagnostic] },
      unmappedGenCode: [],
    });
    syncStoreInitialState(useLspDiagnostics);

    const markup = renderHeader();

    expect(markup).toContain("Issues 1");
  });

  it("shows muted label when diagnostics are muted", () => {
    useProjectState.setState({
      sectionImpls: {
        [implId]: createCodeSectionImpl(createUserDefaultCodeSectionImpl(), {
          ...baseImpl,
          diagnosticsIgnoreState: { muted: true, suppressedCodes: [] },
        }),
      },
    });
    syncStoreInitialState(useProjectState);

    const markup = renderHeader();

    expect(markup).toContain("Diagnostics muted");
  });

  it("shows suppressed count when suppressions exist", () => {
    useProjectState.setState({
      sectionImpls: {
        [implId]: createCodeSectionImpl(createUserDefaultCodeSectionImpl(), {
          ...baseImpl,
          diagnosticsIgnoreState: {
            muted: false,
            suppressedCodes: ["reportFoo", "reportBar"],
          },
        }),
      },
    });
    syncStoreInitialState(useProjectState);

    const markup = renderHeader();

    expect(markup).toContain("Suppressed 2");
  });

  it("renders a color dot when a tag color is set", () => {
    useProjectState.setState((state) => {
      const section = state.sections[sectionId];
      if (!section) {
        throw new Error(`Missing section ${sectionId}`);
      }
      section.sharedModifier = { tagColor: "#ff0000" };
    });
    syncStoreInitialState(useProjectState);

    const markup = renderHeader();

    expect(markup).toContain("Color tag: #ff0000");
  });

  it("adds shared quick info to section chrome icon controls", () => {
    useProjectState.setState((state) => {
      state.projectConfig.activeViewModeId = "view-mode-1";
      state.projectConfig.isEditingViewMode = false;
      state.projectConfig.viewModes = {
        "view-mode-1": {
          id: "view-mode-1",
          name: "Default",
          sortIndex: 0,
          isUserFacing: false,
          isTab: true,
          visibilityBySectionId: {
            [sectionId]: true,
          },
          viewport: { x: 0, y: 0, zoom: 1 },
          viewportInitialized: false,
          topLevelSections: {
            [sectionId]: { x: 0, y: 0, zIndex: 0, w: 200, h: 160 },
          },
        },
      };
    });
    syncStoreInitialState(useProjectState);

    const markup = renderToStaticMarkup(
      <SectionHeader
        sectionId={sectionId}
        sectionTypeName={SectionTypeEnum.Code}
        isInOtherProjectConfigs={false}
        isUserView={false}
        isRoot={false}
        hasSectionStyleTheme={false}
      />,
    );

    expect(markup).toContain('data-tooltip-content="Create terminal"');
    expect(markup).toContain('data-tooltip-content="Lock position and size"');
    expect(markup).toContain('data-tooltip-content="Minimize section"');
    expect(markup).toContain('data-tooltip-content="Delete section"');
  });

  it("allows a custom layout renderer to own title and actions placement", () => {
    useProjectState.setState((state) => {
      const section = state.sections[sectionId];
      if (!section) {
        throw new Error(`Missing section ${sectionId}`);
      }
      section.sharedModifier = { tagColor: "#ff0000" };
    });
    syncStoreInitialState(useProjectState);

    const markup = renderToStaticMarkup(
      <SectionHeader
        sectionId={sectionId}
        sectionTypeName={SectionTypeEnum.Code}
        isInOtherProjectConfigs={false}
        isUserView={true}
        isRoot={false}
        hasSectionStyleTheme={false}
        showSectionContainerControls={false}
        extraControls={<span data-testid="window-controls">window</span>}
        layoutRenderer={({ actions, leadingControls, title }) => (
          <div data-testid="custom-header-layout">
            <div data-slot="leading">{leadingControls}</div>
            <div data-slot="title">{title}</div>
            <div data-slot="actions">{actions}</div>
          </div>
        )}
      />,
    );

    expect(markup).toContain('data-testid="custom-header-layout"');
    expect(markup).toContain('data-slot="leading"');
    expect(markup).toContain("Color tag: #ff0000");
    expect(markup).toContain('data-slot="title"');
    expect(markup).toContain(">Section<");
    expect(markup).toContain('data-slot="actions"');
    expect(markup).toContain('data-testid="window-controls"');
    expect(markup).toContain("Mute diagnostics");
  });

  it("allows a custom controls renderer to own the trailing header action strip", () => {
    useLspDiagnostics.setState({
      codeSections: { [sectionId]: [baseDiagnostic] },
      unmappedGenCode: [],
    });
    syncStoreInitialState(useLspDiagnostics);

    const markup = renderToStaticMarkup(
      <SectionHeader
        sectionId={sectionId}
        sectionTypeName={SectionTypeEnum.Code}
        isInOtherProjectConfigs={false}
        isUserView={false}
        isRoot={false}
        hasSectionStyleTheme={false}
        showSectionContainerControls={false}
        extraControls={<span data-testid="window-controls">window</span>}
        controlsRenderer={({
          codeSectionDiagnostics,
          extraControls,
          sectionId: controlsSectionId,
          sectionTypeName: controlsSectionTypeName,
          showCodeDiagnosticsPopover,
          showSectionContainerControls: showCanvasControls,
        }) => (
          <div
            data-diagnostic-count={String(codeSectionDiagnostics.length)}
            data-section-id={controlsSectionId}
            data-section-type={controlsSectionTypeName}
            data-show-canvas-controls={showCanvasControls ? "true" : "false"}
            data-show-diagnostics-popover={
              showCodeDiagnosticsPopover ? "true" : "false"
            }
            data-testid="custom-header-controls"
          >
            {extraControls}
          </div>
        )}
      />,
    );

    expect(markup).toContain('data-testid="custom-header-controls"');
    expect(markup).toContain('data-section-id="section-1"');
    expect(markup).toContain(`data-section-type="${SectionTypeEnum.Code}"`);
    expect(markup).toContain('data-diagnostic-count="1"');
    expect(markup).toContain('data-show-canvas-controls="false"');
    expect(markup).toContain('data-show-diagnostics-popover="true"');
    expect(markup).toContain('data-testid="window-controls"');
    expect(markup).not.toContain("Mute diagnostics");
  });

  it("allows a custom leading-controls renderer to own the menu and tag-color boundary", () => {
    useProjectState.setState((state) => {
      const section = state.sections[sectionId];
      if (!section) {
        throw new Error(`Missing section ${sectionId}`);
      }
      section.sharedModifier = { tagColor: "#ff0000" };
    });
    syncStoreInitialState(useProjectState);

    const markup = renderToStaticMarkup(
      <SectionHeader
        sectionId={sectionId}
        sectionTypeName={SectionTypeEnum.Code}
        isInOtherProjectConfigs={true}
        isUserView={true}
        isRoot={false}
        hasSectionStyleTheme={true}
        leadingControlsRenderer={({
          hasSectionStyleTheme,
          isInOtherProjectConfigs,
          sectionId: leadingSectionId,
          sectionTypeName: leadingSectionTypeName,
          tagColor,
        }) => (
          <div
            data-has-section-style-theme={
              hasSectionStyleTheme ? "true" : "false"
            }
            data-in-other-project-configs={
              isInOtherProjectConfigs ? "true" : "false"
            }
            data-section-id={leadingSectionId}
            data-section-type={leadingSectionTypeName}
            data-tag-color={tagColor ?? "none"}
            data-testid="custom-leading-controls"
          />
        )}
      />,
    );

    expect(markup).toContain('data-testid="custom-leading-controls"');
    expect(markup).toContain('data-has-section-style-theme="true"');
    expect(markup).toContain('data-in-other-project-configs="true"');
    expect(markup).toContain('data-section-id="section-1"');
    expect(markup).toContain(`data-section-type="${SectionTypeEnum.Code}"`);
    expect(markup).toContain('data-tag-color="#ff0000"');
    expect(markup).not.toContain("Color tag: #ff0000");
  });
});

describe("SectionHeader follow button", () => {
  const projectConfigId = "project-chat";
  const sectionId = "section-chat";
  const variantId = "variant-chat";
  const implId = "impl-chat";
  const chatId = "chat-123";

  const sectionCore = createCore({
    id: sectionId,
    name: "Chat",
    variants: [variantId],
    defaultVariant: variantId,
  });

  const sectionVariant = createVariant({
    id: variantId,
    name: "Chat Variant",
    impl: implId,
    nonPresetImpls: [],
  });

  beforeEach(() => {
    const projectConfig = createProjectConfig({
      id: projectConfigId,
      sectionVariantMap: { [sectionId]: variantId },
    });
    const chatImpl = createChatSectionImpl(
      createUserDefaultChatSectionImpl({ chatId }),
      { id: implId, chatId },
    );

    resetProjectStores();
    useShareSession.setState({ isDeploymentMode: false });
    useProjectState.setState((state) => {
      state.projectConfig = projectConfig;
      state.sections = { [sectionId]: sectionCore };
      state.sectionVariants = { [variantId]: sectionVariant };
      state.sectionImpls = { [implId]: chatImpl };
      state.previewSectionVariantMap = {};
    });
    syncStoreInitialState(useProjectState);
    syncStoreInitialState(useShareSession);
    syncStoreInitialState(useAIFollow);
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("shows follow button for chat sections", () => {
    useAIFollow.setState((state) => {
      state.selectedSectionIdsByProjectConfigId[projectConfigId] = [sectionId];
    });
    syncStoreInitialState(useAIFollow);

    const markup = renderToStaticMarkup(
      <SectionHeader
        sectionId={sectionId}
        sectionTypeName={SectionTypeEnum.Chat}
        isInOtherProjectConfigs={false}
        isUserView={true}
        isRoot={false}
        hasSectionStyleTheme={false}
      />,
    );

    expect(markup).toContain('aria-label="Stop following chat"');
    expect(markup).toContain('aria-pressed="true"');
  });

  it("adds shared quick info to the follow button", () => {
    const markup = renderToStaticMarkup(
      <SectionHeader
        sectionId={sectionId}
        sectionTypeName={SectionTypeEnum.Chat}
        isInOtherProjectConfigs={false}
        isUserView={true}
        isRoot={false}
        hasSectionStyleTheme={false}
      />,
    );

    expect(markup).toContain('data-tooltip-content="Follow chat"');
  });

  it("can render extra controls while hiding canvas container controls", () => {
    const markup = renderToStaticMarkup(
      <SectionHeader
        sectionId={sectionId}
        sectionTypeName={SectionTypeEnum.Chat}
        isInOtherProjectConfigs={false}
        isUserView={false}
        isRoot={false}
        hasSectionStyleTheme={false}
        showSectionContainerControls={false}
        extraControls={<span data-testid="window-controls">window</span>}
      />,
    );

    expect(markup).toContain('data-testid="window-controls"');
    expect(markup).not.toContain("gg-lock");
  });

  it("keeps chat headers out of unrelated follow-selection commits", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const { host, root } = await renderProfiledHeader({
      onRender,
      sectionId,
      sectionTypeName: SectionTypeEnum.Chat,
    });

    try {
      const initialCommitCount = onRender.mock.calls.length;

      await act(async () => {
        useAIFollow.setState((state) => {
          state.selectedSectionIdsByProjectConfigId[projectConfigId] = [
            "section-other",
          ];
        });
      });

      expect(onRender).toHaveBeenCalledTimes(initialCommitCount);
      const followIndicator = host.querySelector("[data-follow-selected]");
      expect(followIndicator).not.toBeNull();
      expect(followIndicator?.getAttribute("data-follow-selected")).toBe(
        "false",
      );
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("still rerenders when this chat becomes follow-selected", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const { host, root } = await renderProfiledHeader({
      onRender,
      sectionId,
      sectionTypeName: SectionTypeEnum.Chat,
    });

    try {
      const initialCommitCount = onRender.mock.calls.length;

      await act(async () => {
        useAIFollow.setState((state) => {
          state.selectedSectionIdsByProjectConfigId[projectConfigId] = [
            sectionId,
          ];
        });
      });

      expect(onRender.mock.calls.length).toBeGreaterThan(initialCommitCount);
      const followIndicator = host.querySelector("[data-follow-selected]");
      expect(followIndicator).not.toBeNull();
      expect(followIndicator?.getAttribute("data-follow-selected")).toBe(
        "true",
      );
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});

describe("SectionHeader diagnostics subscriptions", () => {
  const sectionId = "section-code";
  const variantId = "variant-code";
  const implId = "impl-code";

  beforeEach(() => {
    const projectConfig = createProjectConfig({
      id: "project-code",
      sectionVariantMap: { [sectionId]: variantId },
      topLevelSections: {
        [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
      },
    });

    resetProjectStores();
    useShareSession.setState({ isDeploymentMode: false });
    useProjectState.setState((state) => {
      state.projectConfig = projectConfig;
      state.sections = {
        [sectionId]: createCore({
          id: sectionId,
          name: "Code",
          variants: [variantId],
          defaultVariant: variantId,
        }),
      };
      state.sectionVariants = {
        [variantId]: createVariant({
          id: variantId,
          name: "Variant",
          impl: implId,
          nonPresetImpls: [],
        }),
      };
      state.sectionImpls = {
        [implId]: createCodeSectionImpl(createUserDefaultCodeSectionImpl(), {
          id: implId,
          codeLanguage: CodeLanguageEnum.python,
        }),
      };
      state.previewSectionVariantMap = {};
    });
    useLspDiagnostics.setState({
      codeSections: {},
      unmappedGenCode: [],
    });
    syncStoreInitialState(useProjectState);
    syncStoreInitialState(useShareSession);
    syncStoreInitialState(useLspDiagnostics);
  });

  afterEach(() => {
    resetProjectStores();
    document.body.innerHTML = "";
  });

  it("keeps code headers without diagnostics out of unrelated diagnostics commits", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const { host, root } = await renderProfiledHeader({
      onRender,
      sectionId,
      sectionTypeName: SectionTypeEnum.Code,
    });

    try {
      const initialCommitCount = onRender.mock.calls.length;

      await act(async () => {
        useLspDiagnostics.setState((state) => {
          state.codeSections = {
            ...state.codeSections,
            "other-section": [
              {
                message: "Other diagnostic",
                severity: 1,
                code: "reportOther",
                source: "pyright",
                range: {
                  start: { line: 0, character: 0 },
                  end: { line: 0, character: 1 },
                },
                uri: "file:///tmp/other.py",
              },
            ],
          };
        });
      });

      expect(onRender).toHaveBeenCalledTimes(initialCommitCount);
      const followIndicator = host.querySelector("[data-follow-selected]");
      expect(followIndicator).not.toBeNull();
      expect(followIndicator?.getAttribute("data-follow-selected")).toBe(
        "false",
      );
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
