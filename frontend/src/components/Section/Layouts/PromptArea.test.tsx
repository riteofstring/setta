/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import {
  useAIStore,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
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
let host: HTMLDivElement;
let root: Root;

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

vi.mock(
  "components/Panes/Overview/ProjectLevelAI/useHydrateAgenticState",
  () => ({
    useHydrateAgenticState: () => undefined,
  }),
);

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
  promptTemplateId = null,
  template,
  renderedText,
  renderError = null,
}: {
  promptTemplateId?: string | null;
  template: string;
  renderedText: string;
  renderError?: string | null;
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
    promptTemplateId,
    template,
    format: PromptFormatEnum.Jinja,
    inputs: { name: "Ada" },
    renderedText,
    missingVariables: promptTemplateId ? ["name"] : [],
    renderError,
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
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    useAIStore.setState({
      promptTemplates: [],
      promptTemplatesInitialLoadComplete: true,
    });
    syncStoreInitialState(useAIStore);
    useShareSession.setState({ isDeploymentMode: false });
    syncStoreInitialState(useShareSession);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
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

  it("shows linked prompt templates as read-only source text", () => {
    useAIStore.setState({
      promptTemplates: [
        {
          id: "template-1",
          name: "Greeting",
          description: "",
          template: "Hello {{ name }}",
          format: PromptFormatEnum.Jinja,
          inputSchema: {},
          metadata: {},
        },
      ],
      promptTemplatesInitialLoadComplete: true,
    });
    syncStoreInitialState(useAIStore);
    const sectionId = seedPromptSection({
      promptTemplateId: "template-1",
      template: "stale snapshot",
      renderedText: "",
    });

    const markup = renderToStaticMarkup(<PromptArea sectionId={sectionId} />);

    expect(markup).toContain(`prompt-linked-template-note-${sectionId}`);
    const props = lastCodeMirrorProps;
    expect(props?.value).toBe("Hello {{ name }}");
  });

  it("clears stale prompt text when a linked prompt template is missing", () => {
    const sectionId = seedPromptSection({
      promptTemplateId: "missing-template",
      template: "stale snapshot",
      renderedText: "",
    });

    const markup = renderToStaticMarkup(<PromptArea sectionId={sectionId} />);

    expect(markup).toContain(
      "This section is linked to a prompt template that could not be loaded.",
    );
    const props = lastCodeMirrorProps;
    expect(props?.value).toBe("");
  });

  it("shows rendered preview state, including missing-variable errors", async () => {
    const sectionId = seedPromptSection({
      template: "Hello {{ name }}",
      renderedText: "",
      renderError: "Missing variables: name",
    });

    await act(async () => {
      root.render(<PromptArea sectionId={sectionId} />);
    });

    const previewTab = host.querySelector(
      `[data-testid="prompt-preview-tab-${sectionId}"]`,
    );
    expect(previewTab).not.toBeNull();

    await act(async () => {
      previewTab?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(host.textContent).toContain("Missing variables: name");
    expect(host.textContent).toContain("No prompt rendered yet.");
  });
});
