/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import {
  useAIFollow,
  useLspDiagnostics,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  CodeLanguageEnum,
  SectionTypeEnum,
  TextBlockFormatEnum,
  createChatSectionImpl,
  createCore,
  createProjectConfig,
  createTextBlockSectionImpl,
  createVariant,
  type Core,
  type LSPDiagnostic,
  type Variant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.stubGlobal(
  "ResizeObserver",
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

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

import { SectionHeader } from "./SectionHeader";

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

describe("SectionHeader markdown heading-as-title", () => {
  const sectionId = "text-section-1";
  const variantId = "text-variant-1";
  const implId = "text-impl-1";
  const sectionName = "Fallback text section";

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
      state.sections = {
        [sectionId]: createCore({
          id: sectionId,
          name: sectionName,
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
        [implId]: createTextBlockSectionImpl({
          id: implId,
          text: "",
          format: TextBlockFormatEnum.Markdown,
          headingAsSectionName: true,
        }),
      };
      state.previewSectionVariantMap = {};
    });
    syncStoreInitialState(useProjectState);
    syncStoreInitialState(useShareSession);
  });

  afterEach(() => {
    resetProjectStores();
  });

  function renderTextBlockHeader(text: string) {
    useProjectState.setState((state) => {
      state.sectionImpls = {
        [implId]: createTextBlockSectionImpl({
          id: implId,
          text,
          format: TextBlockFormatEnum.Markdown,
          headingAsSectionName: true,
        }),
      };
    });
    syncStoreInitialState(useProjectState);

    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);

    try {
      act(() => {
        root.render(
          <SectionHeader
            sectionId={sectionId}
            sectionTypeName={SectionTypeEnum.TextBlock}
            isInOtherProjectConfigs={false}
            isUserView={true}
            isRoot={false}
            hasSectionStyleTheme={false}
          />,
        );
      });

      return host.textContent ?? "";
    } finally {
      act(() => {
        root.unmount();
      });
      host.remove();
    }
  }

  it.each([
    ["# Title", false],
    ["  ## Indented", false],
    ["Intro\n# Heading\nMore", false],
    ["    # Not a heading", true],
    ["#   ", true],
    ["####### Too deep", true],
  ])(
    "shows fallback section title=%s state correctly",
    (text, showsFallbackSectionTitle) => {
      const renderedText = renderTextBlockHeader(text);

      expect(renderedText.includes(sectionName)).toBe(
        showsFallbackSectionTitle,
      );
    },
  );
});

describe("SectionHeader diagnostics badges", () => {
  const sectionId = "section-1";
  const variantId = "variant-1";
  const implId = "impl-1";

  const baseDiagnostic: LSPDiagnostic = {
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

  const baseImpl = {
    type: SectionTypeEnum.Code,
    id: implId,
    name: "Code",
    isFrozen: false,
    isInOtherProjectConfigs: false,
    tagColor: null,
    size: { width: 500, height: 300 },
    aspectRatio: false,
    aspectRatioExtraHeight: 0,
    aspectRatioExtraWidth: 0,
    isMinimized: false,
    positionAndSizeLocked: false,
    isPreset: false,
    code: "print('hi')",
    codeFileBinding: null,
    codeLanguage: CodeLanguageEnum.python,
    diagnosticsIgnoreState: {
      muted: false,
      suppressedCodes: [],
    },
  };

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
        [implId]: {
          ...baseImpl,
          diagnosticsIgnoreState: { muted: true, suppressedCodes: [] },
        },
      },
    });
    syncStoreInitialState(useProjectState);

    const markup = renderHeader();

    expect(markup).toContain("Diagnostics muted");
  });

  it("shows suppressed count when suppressions exist", () => {
    useProjectState.setState({
      sectionImpls: {
        [implId]: {
          ...baseImpl,
          diagnosticsIgnoreState: {
            muted: false,
            suppressedCodes: ["reportFoo", "reportBar"],
          },
        },
      },
    });
    syncStoreInitialState(useProjectState);

    const markup = renderHeader();

    expect(markup).toContain("Suppressed 2");
  });

  it("renders a color dot when a tag color is set", () => {
    useProjectState.setState((state) => {
      state.sections[sectionId].sharedModifier = { tagColor: "#ff0000" };
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
    const chatImpl = createChatSectionImpl({
      ...{ chatId },
      ...{ id: implId, chatId },
    });

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
        isActiveSection={false}
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
});
