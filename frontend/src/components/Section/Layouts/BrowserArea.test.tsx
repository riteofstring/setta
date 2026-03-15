import { renderToStaticMarkup } from "react-dom/server";
import {
  useBrowserSectionFileBrowserState,
  useProjectState,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  BrowserAreaViewModeEnum,
  SectionTypeEnum,
  createProjectConfig,
  type BrowserAreaViewMode,
  type Core,
  type Variant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BrowserArea } from "./BrowserArea";

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

const sectionId = "section-1";
const variantId = "variant-1";
const implId = "impl-1";

const sectionCore: Core = {
  id: sectionId,
  name: "Browser",
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
  type: SectionTypeEnum.Browser,
  id: implId,
  name: "Browser",
  isFrozen: false,
  isInOtherProjectConfigs: false,
  tagColor: null,
  size: { width: 640, height: 360 },
  aspectRatio: false,
  aspectRatioExtraHeight: 0,
  aspectRatioExtraWidth: 0,
  isMinimized: false,
  positionAndSizeLocked: false,
  isPreset: false,
  folder: "",
  hideColumn: false,
  columnWidth: null,
  typesColumnWidth: null,
  viewMode: BrowserAreaViewModeEnum.list,
};

function setBrowserSectionState(viewMode: BrowserAreaViewMode) {
  const projectConfig = createProjectConfig({
    id: "project-1",
    sectionVariantMap: { [sectionId]: variantId },
    topLevelSections: {
      [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
    },
  });

  useProjectState.setState((state) => {
    state.projectConfig = projectConfig;
    state.sections = { [sectionId]: sectionCore };
    state.sectionVariants = { [variantId]: sectionVariant };
    state.sectionImpls = {
      [implId]: {
        ...baseImpl,
        viewMode,
      },
    };
    state.previewSectionVariantMap = {};
  });
  syncStoreInitialState(useProjectState);
}

describe("BrowserArea list view", () => {
  beforeEach(() => {
    resetProjectStores();
    useBrowserSectionFileBrowserState.getState().reset?.();
  });

  afterEach(() => {
    resetProjectStores();
    useBrowserSectionFileBrowserState.getState().reset?.();
  });

  it("renders the explorer pane in list view", () => {
    setBrowserSectionState(BrowserAreaViewModeEnum.list);
    const markup = renderToStaticMarkup(<BrowserArea sectionId={sectionId} />);

    expect(markup).toContain("Filter");
    expect(markup).toContain("Files");
    expect(markup).toContain("Date modified");
    expect(markup).toContain("CodeMirror-FileBrowserFilter");
    expect(markup).toContain(`CodeMirror-${sectionId}-browser-path`);
  });

  it("does not render the explorer pane in thumbnail view", () => {
    setBrowserSectionState(BrowserAreaViewModeEnum.thumbnail);
    const markup = renderToStaticMarkup(<BrowserArea sectionId={sectionId} />);

    expect(markup).not.toContain("Files");
    expect(markup).toContain("Filter");
    expect(markup).toContain("CodeMirror-FileBrowserFilter");
  });

  it("renders history controls in non-list views", () => {
    setBrowserSectionState(BrowserAreaViewModeEnum.thumbnail);
    const markup = renderToStaticMarkup(<BrowserArea sectionId={sectionId} />);

    expect(markup).toContain('aria-label="Go back"');
    expect(markup).toContain('aria-label="Go forward"');
    expect(markup).toContain(`CodeMirror-${sectionId}-browser-path`);
  });

  it("renders history controls in list view", () => {
    setBrowserSectionState(BrowserAreaViewModeEnum.list);
    const markup = renderToStaticMarkup(<BrowserArea sectionId={sectionId} />);

    expect(markup).toContain('aria-label="Go back"');
    expect(markup).toContain('aria-label="Go forward"');
  });

  it("renders the file explorer region in carousel view", () => {
    setBrowserSectionState(BrowserAreaViewModeEnum.carousel);
    const markup = renderToStaticMarkup(<BrowserArea sectionId={sectionId} />);

    // Carousel mode keeps the Browser host shell stable even when the shared
    // MediaCarousel body renders an empty-state null branch.
    expect(markup).toContain('aria-label="File explorer"');
    expect(markup).toContain('aria-label="Carousel view"');
    expect(markup).toContain(`CodeMirror-${sectionId}-browser-path`);
    expect(markup).not.toContain("Date modified");
  });
});
