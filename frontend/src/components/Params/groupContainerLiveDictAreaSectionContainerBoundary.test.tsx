/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useProjectState, useSettings } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  ConfigLanguageEnum,
  SectionTypeEnum,
  createProjectConfig,
  createSettingsState,
  type Core,
  type Variant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLiveDictAreaSectionContainerBoundary } from "./groupContainerLiveDictAreaSectionContainerBoundary";

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

function seedLiveDictAreaSectionContainerBoundaryState({
  sectionId,
}: {
  sectionId: string;
}) {
  const variantId = `${sectionId}-variant`;
  const implId = `${sectionId}-impl`;
  const projectConfig = createProjectConfig({
    id: `project-${sectionId}`,
    sectionVariantMap: { [sectionId]: variantId },
    topLevelSections: {
      [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
    },
  });

  const sectionCore: Core = {
    id: sectionId,
    name: "Dict",
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

  const dictImpl = {
    type: SectionTypeEnum.Dict,
    id: implId,
    name: "Dict",
    isFrozen: false,
    isInOtherProjectConfigs: false,
    tagColor: null,
    size: { width: 240, height: 160 },
    aspectRatio: false,
    aspectRatioExtraHeight: 0,
    aspectRatioExtraWidth: 0,
    isMinimized: false,
    positionAndSizeLocked: false,
    isPreset: false,
    codeObjVariantMap: {},
    hideUnpinnedParams: false,
    paramFilter: "",
    columnWidth: null,
    configLanguage: ConfigLanguageEnum.python,
    pinnedParams: [],
    selectedParams: [],
    ignoreTypeErrors: { callable: false, params: {} },
    edgeInputParams: [],
    edgeOutputPorts: [],
    topLevelParamId: null,
    isJsonSource: false,
    jsonSourceKeys: [],
    jsonSourceMissing: false,
  };

  useProjectState.setState((state) => {
    state.projectConfig = projectConfig;
    state.sections = { [sectionId]: sectionCore };
    state.sectionVariants = { [variantId]: sectionVariant };
    state.sectionImpls = { [implId]: dictImpl };
    state.codeObjs = {};
    state.codeObjVariants = {};
    state.codeObjImpls = {};
    state.parentSectionMap = { [sectionId]: null };
    state.previewSectionVariantMap = {};
    state.shownParamIds = {
      [variantId]: {
        pinned: {
          requiredParamIdsToPaths: {},
          topLevelParamIds: [],
        },
        unpinned: {
          requiredParamIdsToPaths: {},
          topLevelParamIds: [],
        },
      },
    };
  });
  syncStoreInitialState(useProjectState);
}

function BoundaryHarness({
  bgColor,
  outerRef,
  sectionId,
  sectionTypeName,
}: {
  bgColor: string;
  outerRef: { current: HTMLDivElement | null };
  sectionId: string;
  sectionTypeName: SectionTypeEnum;
}) {
  const liveDictAreaSectionProps = useLiveDictAreaSectionContainerBoundary({
    bgColor,
    outerRef,
    sectionId,
    sectionTypeName,
  });

  return (
    <div
      data-bg-color={liveDictAreaSectionProps.bgColor}
      data-has-resize-handler={
        typeof liveDictAreaSectionProps.handleColumnResizeStart === "function"
      }
      data-section-id={liveDictAreaSectionProps.sectionId}
      data-section-type={liveDictAreaSectionProps.sectionTypeName}
    />
  );
}

describe("useLiveDictAreaSectionContainerBoundary", () => {
  let host: HTMLDivElement;
  let outer: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetProjectStores();
    useSettings.setState(createSettingsState());
    syncStoreInitialState(useSettings);
    vi.stubGlobal(
      "ResizeObserver",
      class ResizeObserverMock {
        observe() {}
        disconnect() {}
        unobserve() {}
      },
    );
    host = document.createElement("div");
    outer = document.createElement("div");
    Object.defineProperty(outer, "clientWidth", {
      configurable: true,
      value: 480,
    });
    host.appendChild(outer);
    document.body.appendChild(host);
    root = createRoot(outer);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    vi.unstubAllGlobals();
    resetProjectStores();
  });

  it("lifts the section-container wiring into one boundary above LiveDictAreaSection", async () => {
    const sectionId = "section-live-dict-area-section-container-boundary";

    seedLiveDictAreaSectionContainerBoundaryState({
      sectionId,
    });

    await act(async () => {
      root.render(
        <BoundaryHarness
          bgColor="bg-transparent"
          outerRef={{ current: outer }}
          sectionId={sectionId}
          sectionTypeName={SectionTypeEnum.Dict}
        />,
      );
    });

    const boundary = outer.firstElementChild as HTMLDivElement | null;

    expect(boundary?.dataset.bgColor).toBe("bg-transparent");
    expect(boundary?.dataset.hasResizeHandler).toBe("true");
    expect(boundary?.dataset.sectionId).toBe(sectionId);
    expect(boundary?.dataset.sectionType).toBe(SectionTypeEnum.Dict);
    expect(outer.style.getPropertyValue("--param-column-width")).toBe("222px");
  });
});
