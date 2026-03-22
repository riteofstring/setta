/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImpl,
} from "state/actions/sectionInfos";
import { adjustSizeToBeAtLeastMin } from "state/actions/sections/sectionSizes";
import {
  useLocalStorage,
  useMisc,
  useProjectState,
  useResizeEvent,
  useSettings,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { route_set_section_sizes } from "utils/generatedEndpoints";
import {
  createCore,
  createProjectConfig,
  createSettingsState,
  createTextBlockSectionImpl,
  createUserDefaultTextBlockSectionImpl,
  createVariant,
  type SectionSize,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clampChangedSize,
  resolveCommittedResizeStopSize,
  shouldEmitResizeEndEvent,
  useSectionResizeController,
} from "./useSectionResizeController";
import { SIZE_MODE } from "./utils";

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_set_section_sizes: vi.fn(),
  };
});

vi.mock("state/actions/sectionInfos", async () => {
  const actual = await vi.importActual<
    typeof import("state/actions/sectionInfos")
  >("state/actions/sectionInfos");
  return {
    ...actual,
    dispatchOptimisticProjectStateUpdate: vi.fn(),
  };
});

const sectionId = "section-1";
const variantId = "variant-1";
const implId = "impl-1";

let host: HTMLDivElement;
let root: Root;
let latestController: ReturnType<typeof useSectionResizeController> | null =
  null;

function ControllerProbe() {
  latestController = useSectionResizeController({
    sectionId,
    positionAndSizeLocked: false,
  });
  return null;
}

function seedProjectState(initialHeight: SectionSize["height"]) {
  const sectionCore = createCore({
    id: sectionId,
    name: "Text Block",
    variants: [variantId],
    defaultVariant: variantId,
  });
  const sectionVariant = createVariant({
    id: variantId,
    name: "Text Block Variant",
    impl: implId,
    nonPresetImpls: [],
  });
  const sectionImpl = createTextBlockSectionImpl(
    createUserDefaultTextBlockSectionImpl(),
    {
      id: implId,
      name: "Text Block",
      size: {
        width: 180,
        height: initialHeight,
      },
    },
  );

  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: { [sectionId]: variantId },
      topLevelSections: {
        [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
      },
    });
    state.sections = { [sectionId]: sectionCore };
    state.sectionVariants = { [variantId]: sectionVariant };
    state.sectionImpls = { [implId]: sectionImpl };
    state.parentSectionMap = { [sectionId]: null };
    state.previewSectionVariantMap = {};
  });
}

function createResizeRef({ width, height }: { width: number; height: number }) {
  return {
    style: {
      width: `${width}px`,
      height: height === 0 ? "auto" : `${height}px`,
    },
    offsetWidth: width,
    offsetHeight: height,
    getBoundingClientRect: () => ({ width, height }),
  };
}

describe("clampChangedSize", () => {
  it("clamps width and height independently when aspect ratio is off", () => {
    const result = clampChangedSize({
      changedSize: { width: 80, height: 90 },
      minWidth: 100,
      minHeight: 120,
      aspectRatio: false,
    });
    expect(result).toEqual({ width: 100, height: 120 });
  });

  it("does not adjust the other dimension when aspect ratio is off", () => {
    const result = clampChangedSize({
      changedSize: { width: 80, height: 200 },
      minWidth: 100,
      minHeight: 120,
      aspectRatio: false,
    });
    expect(result).toEqual({ width: 100, height: 200 });
  });

  it("preserves ratio when aspect ratio is on", () => {
    const expected = adjustSizeToBeAtLeastMin(80, 200, 120, 150);
    const result = clampChangedSize({
      changedSize: { width: 200, height: 80 },
      minWidth: 150,
      minHeight: 120,
      aspectRatio: true,
    });
    expect(result).toEqual(expected);
  });
});

describe("resolveCommittedResizeStopSize", () => {
  it("falls back to measured width when the live style is still auto", () => {
    const result = resolveCommittedResizeStopSize({
      props: [
        { detail: 1 },
        "right",
        {
          style: { width: "auto", height: "120px" },
          offsetWidth: 240,
          offsetHeight: 120,
          getBoundingClientRect: () => ({ width: 240, height: 120 }),
        },
        { width: 24, height: 0 },
      ],
      sizeMode: { width: SIZE_MODE.any, height: SIZE_MODE.any },
      aspectRatio: false,
      minHeight: 80,
      minWidth: 100,
      isDoubleClickOverride: false,
    });

    expect(result).toEqual({ width: 240 });
  });

  it("keeps auto dimensions on a double-click reset", () => {
    const result = resolveCommittedResizeStopSize({
      props: [
        { detail: 2 },
        "bottomRight",
        {
          style: { width: "auto", height: "auto" },
          offsetWidth: 240,
          offsetHeight: 120,
          getBoundingClientRect: () => ({ width: 240, height: 120 }),
        },
        { width: 0, height: 0 },
      ],
      sizeMode: { width: SIZE_MODE.any, height: SIZE_MODE.any },
      aspectRatio: false,
      minHeight: 80,
      minWidth: 100,
      isDoubleClickOverride: true,
    });

    expect(result).toEqual({ width: "auto", height: "auto" });
  });
});

describe("shouldEmitResizeEndEvent", () => {
  it("skips end when resize never started", () => {
    expect(
      shouldEmitResizeEndEvent({
        resizeStarted: false,
        resizeAttempted: false,
        isZeroDelta: true,
        isDoubleClick: false,
      }),
    ).toBe(false);
  });

  it("emits end when resize started", () => {
    expect(
      shouldEmitResizeEndEvent({
        resizeStarted: true,
        resizeAttempted: true,
        isZeroDelta: false,
        isDoubleClick: false,
      }),
    ).toBe(true);
  });

  it("keeps the end event for a started double-click reset", () => {
    expect(
      shouldEmitResizeEndEvent({
        resizeStarted: true,
        resizeAttempted: false,
        isZeroDelta: true,
        isDoubleClick: true,
      }),
    ).toBe(true);
  });
});

describe("useSectionResizeController", () => {
  beforeEach(() => {
    resetProjectStores();
    useSettings.setState(createSettingsState());
    useLocalStorage.setState({ snapToGrid: true });
    seedProjectState("auto");
    latestController = null;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    vi.mocked(route_set_section_sizes).mockReset();
    vi.mocked(route_set_section_sizes).mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });
    vi.mocked(dispatchOptimisticProjectStateUpdate).mockReset();
    vi.mocked(dispatchOptimisticProjectStateUpdate).mockImplementation(
      ({ apply, send }) => {
        useProjectState.setState((state) => {
          apply(state);
        });
        void send("frontend-op-1");
      },
    );
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    document.body.innerHTML = "";
    resetProjectStores();
    vi.clearAllMocks();
  });

  async function renderProbe() {
    await act(async () => {
      root.render(<ControllerProbe />);
    });
    if (!latestController) {
      throw new Error("Expected resize controller probe to mount.");
    }
    return latestController;
  }

  it("promotes auto height on first drag and marks the section as resizing", async () => {
    const controller = await renderProbe();
    const ref = createResizeRef({ width: 180, height: 240 });

    await act(async () => {
      controller.onResizeStart({}, "bottom", ref);
      controller.onResize({}, "bottom", ref, { width: 0, height: 24 });
    });

    expect(useMisc.getState().mouseDownDraggingSection).toBe(true);
    expect(useResizeEvent.getState().resizeEvent[sectionId]).toBe("start");
    expect(
      getCurrEffectiveSectionImpl(useProjectState.getState(), sectionId).size
        .height,
    ).toBe(240);
    expect(vi.mocked(route_set_section_sizes)).toHaveBeenCalledWith({
      projectConfigId: "project-1",
      sectionSizes: {
        [sectionId]: {
          width: 180,
          height: 240,
        },
      },
      frontendOpId: "frontend-op-1",
    });
  });

  it("commits a zero-delta double-click resize back to auto", async () => {
    seedProjectState(240);
    const controller = await renderProbe();
    const ref = createResizeRef({ width: 180, height: 0 });

    await act(async () => {
      controller.onResizeStart({}, "bottom", ref);
      controller.onResizePointerDown("bottom");
      controller.onResizeStop({ detail: 2 }, "bottom", ref, {
        width: 0,
        height: 0,
      });
    });

    expect(
      getCurrEffectiveSectionImpl(useProjectState.getState(), sectionId).size
        .height,
    ).toBe("auto");
    expect(useMisc.getState().mouseDownDraggingSection).toBe(false);
    expect(vi.mocked(route_set_section_sizes)).toHaveBeenCalledWith({
      projectConfigId: "project-1",
      sectionSizes: {
        [sectionId]: {
          width: 180,
          height: "auto",
        },
      },
      frontendOpId: "frontend-op-1",
    });
  });

  it("skips a zero-delta stop that never actually resized", async () => {
    seedProjectState(240);
    const controller = await renderProbe();
    const ref = createResizeRef({ width: 180, height: 240 });

    await act(async () => {
      controller.onResizeStart({}, "bottom", ref);
      controller.onResizeStop({ detail: 1 }, "bottom", ref, {
        width: 0,
        height: 0,
      });
    });

    expect(useMisc.getState().mouseDownDraggingSection).toBe(false);
    expect(useResizeEvent.getState().resizeEvent[sectionId]).toBeUndefined();
    expect(vi.mocked(route_set_section_sizes)).not.toHaveBeenCalled();
  });
});
