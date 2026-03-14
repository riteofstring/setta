import { renderToStaticMarkup } from "react-dom/server";
import { useProjectState, useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  PromptFormatEnum,
  SectionTypeEnum,
  createCore,
  createProjectConfig,
  createSectionSize,
  createVariant,
  type BaseSectionImplUnion,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PromptArea } from "./PromptArea";

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

let lastCodeMirrorProps: Record<string, unknown> | null = null;

vi.mock("@uiw/react-codemirror", async () => {
  const React = await import("react");
  return {
    default: (props: Record<string, unknown>) => {
      lastCodeMirrorProps = props;
      return React.createElement("div", { "data-testid": "codemirror" });
    },
  };
});

vi.mock("components/Section/Layouts/CodeArea", () => ({
  codeAreaTabOnEnterKeyHandlers: () => ({
    onArticleDivEnterKeyFocusOnCodeMirror: () => undefined,
    onEscapeFocusOnArticleDiv: () => undefined,
  }),
  useCodeAreaHeight: () => ({
    wrapperRef: { current: null },
    handleCreateEditor: () => undefined,
    maxHeight: "240px",
    overflow: "",
    nowheel: "",
  }),
}));

vi.mock("components/Utils/CodeMirror/getExtensions", () => ({
  getExtensions: () => ["base-extension"],
}));

vi.mock("components/Utils/CodeMirror/useCodeMirrorStyle", () => ({
  useCodeMirrorStyle: () => "theme",
}));

vi.mock("state/hooks/share", () => ({
  useShareCapabilities: () => ({
    canEditParams: true,
    canEditVariants: true,
    canEditLayout: true,
    canRun: true,
    canEditStructure: true,
  }),
}));

function seedPromptSection({
  template,
  renderedText,
}: {
  template: string;
  renderedText: string;
}) {
  const sectionId = "section-1";
  const variantId = "variant-1";
  const implId = "impl-1";
  const projectConfig = createProjectConfig({
    id: "project-1",
    sectionVariantMap: { [sectionId]: variantId },
    topLevelSections: {
      [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
    },
  });
  const sectionCore = createCore({
    id: sectionId,
    name: "Prompt",
    variants: [variantId],
    defaultVariant: variantId,
  });
  const sectionVariant = createVariant({
    id: variantId,
    name: "Variant",
    impl: implId,
    nonPresetImpls: [],
  });
  const sectionImpl: BaseSectionImplUnion = {
    type: SectionTypeEnum.Prompt,
    id: implId,
    name: "Prompt",
    isFrozen: false,
    isInOtherProjectConfigs: false,
    tagColor: null,
    styleColor: null,
    size: createSectionSize({ width: 300, height: 150 }),
    aspectRatio: false,
    aspectRatioExtraHeight: 0,
    aspectRatioExtraWidth: 0,
    isMinimized: false,
    positionAndSizeLocked: false,
    isPreset: false,
    template,
    format: PromptFormatEnum.Jinja,
    inputs: { name: "Ada" },
    renderedText,
    missingVariables: [],
    renderError: null,
  };

  useProjectState.setState((state) => {
    state.projectConfig = projectConfig;
    state.sections = { [sectionId]: sectionCore };
    state.sectionVariants = { [variantId]: sectionVariant };
    state.sectionImpls = { [implId]: sectionImpl };
    state.parentSectionMap = { [sectionId]: null };
    state.previewSectionVariantMap = {};
  });
  syncStoreInitialState(useProjectState);
  return sectionId;
}

describe("PromptArea", () => {
  beforeEach(() => {
    resetProjectStores();
    lastCodeMirrorProps = null;
    useShareSession.setState({ isDeploymentMode: false });
    syncStoreInitialState(useShareSession);
  });

  afterEach(() => {
    resetProjectStores();
    lastCodeMirrorProps = null;
  });

  it("renders a template editor in the section by default", () => {
    const sectionId = seedPromptSection({
      template: "Hi {{ name }}",
      renderedText: "Hi Ada",
    });

    const markup = renderToStaticMarkup(<PromptArea sectionId={sectionId} />);

    expect(markup).toContain(`prompt-template-tab-${sectionId}`);
    expect(markup).toContain(`prompt-preview-tab-${sectionId}`);
    expect(markup).toContain(`prompt-template-editor-${sectionId}`);
    expect(markup).toContain('data-section-main-editor="true"');

    const props = lastCodeMirrorProps;
    expect(props).not.toBeNull();
    expect(props?.value).toBe("Hi {{ name }}");
    expect(Array.isArray(props?.extensions)).toBe(true);
  });
});
