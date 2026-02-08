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
  createChatSectionImpl,
  createCore,
  createProjectConfig,
  createUserDefaultChatSectionImpl,
  createVariant,
  type Core,
  type SettaLspDiagnostic,
  type Variant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

  const baseImpl = {
    type: SectionTypeEnum.Code,
    id: implId,
    name: "Code",
    isFrozen: false,
    isInOtherProjectConfigs: false,
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
        isActiveSection={false}
        sectionTypeName={SectionTypeEnum.Code}
        isInOtherProjectConfigs={false}
        isUserView={true}
        isRoot={false}
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
        isActiveSection={false}
        sectionTypeName={SectionTypeEnum.Chat}
        isInOtherProjectConfigs={false}
        isUserView={true}
        isRoot={false}
      />,
    );

    expect(markup).toContain('aria-label="Follow chat"');
    expect(markup).toContain('aria-pressed="true"');
  });
});
