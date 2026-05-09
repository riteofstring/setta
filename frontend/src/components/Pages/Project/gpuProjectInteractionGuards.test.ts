/* @vitest-environment jsdom */

import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  NO_WHEEL_CLASS_NAME,
} from "utils/constants";
import { describe, expect, it } from "vitest";
import {
  isProjectGpuEdgeInteractionDisabled,
  isProjectGpuNodeDragDisabled,
  isProjectPaneBackgroundTarget,
  shouldShiftProjectGpuSelectionBoundsForNodeMove,
} from "./gpuProjectInteractionGuards";

describe("gpu project interaction guards", () => {
  it.each([
    ["pan activation key", true, false],
    ["AI follow transition", false, true],
  ])(
    "disables GPU direct node drag during %s",
    (_label, panActivationKeyPressed, isFollowTransitioning) => {
      expect(
        isProjectGpuNodeDragDisabled({
          isFollowTransitioning,
          panActivationKeyPressed,
        }),
      ).toBe(true);
    },
  );

  it("allows GPU direct node drag in normal mode", () => {
    expect(
      isProjectGpuNodeDragDisabled({
        isFollowTransitioning: false,
        panActivationKeyPressed: false,
      }),
    ).toBe(false);
  });

  it.each([
    ["AI follow transition", true, false, false, false],
    ["viewport interaction", false, true, false, false],
    ["user selection", false, false, true, false],
    ["active connection", false, false, false, true],
  ])(
    "disables GPU edge interaction during %s",
    (
      _label,
      isFollowTransitioning,
      viewportInteractionActive,
      userSelectionActive,
      connectionActive,
    ) => {
      expect(
        isProjectGpuEdgeInteractionDisabled({
          connectionActive,
          isFollowTransitioning,
          userSelectionActive,
          viewportInteractionActive,
        }),
      ).toBe(true);
    },
  );

  it("allows GPU edge interaction in normal mode", () => {
    expect(
      isProjectGpuEdgeInteractionDisabled({
        connectionActive: false,
        isFollowTransitioning: false,
        userSelectionActive: false,
        viewportInteractionActive: false,
      }),
    ).toBe(false);
  });

  it("shifts selection bounds only when every active selected node moved", () => {
    expect(
      shouldShiftProjectGpuSelectionBoundsForNodeMove({
        activeSelectedNodeIds: ["a", "b"],
        movedNodeIds: ["b", "a"],
      }),
    ).toBe(true);
    expect(
      shouldShiftProjectGpuSelectionBoundsForNodeMove({
        activeSelectedNodeIds: ["a", "b"],
        movedNodeIds: ["a"],
      }),
    ).toBe(false);
    expect(
      shouldShiftProjectGpuSelectionBoundsForNodeMove({
        activeSelectedNodeIds: ["a"],
        movedNodeIds: ["a", "c"],
      }),
    ).toBe(false);
    expect(
      shouldShiftProjectGpuSelectionBoundsForNodeMove({
        activeSelectedNodeIds: [],
        movedNodeIds: ["a"],
      }),
    ).toBe(false);
  });

  it("accepts GPU pane and canvas surfaces as pane background targets", () => {
    const { gpuFlow, root, surface } = createProjectPaneFixture();

    expect(isProjectPaneBackgroundTarget(root)).toBe(true);
    expect(isProjectPaneBackgroundTarget(gpuFlow)).toBe(true);
    expect(isProjectPaneBackgroundTarget(surface)).toBe(true);
  });

  it("rejects non-surface children of the project root", () => {
    const { root } = createProjectPaneFixture();
    const target = document.createElement("button");
    root.append(target);

    expect(isProjectPaneBackgroundTarget(target)).toBe(false);
  });

  it.each([
    ["GPU node", "setta-gpu-flow__node"],
    ["GPU flow node contract", "setta-gpu-flow__node"],
    ["edge handle", "setta-gpu-flow__handle"],
    ["resize handle", "section-resize-handle"],
    ["nodrag target", NO_DRAG_CLASS_NAME],
    ["nopan target", NO_PAN_CLASS_NAME],
    ["nowheel target", NO_WHEEL_CLASS_NAME],
  ])("rejects %s as a pane background target", (_label, className) => {
    const { surface } = createProjectPaneFixture();
    const target = appendNestedTarget(surface, { className });

    expect(isProjectPaneBackgroundTarget(target)).toBe(false);
  });

  it.each([
    ["retained DOM island", "gpuFlowDomIsland"],
    ["retained content canvas", "gpuFlowRetainedContentCanvas"],
    ["retained content native target", "gpuFlowRetainedContentNative"],
    ["retained content source", "gpuFlowRetainedContentSource"],
  ] as const)(
    "rejects %s as a pane background target",
    (_label, dataAttribute) => {
      const { surface } = createProjectPaneFixture();
      const target = appendNestedTarget(surface, { dataAttribute });

      expect(isProjectPaneBackgroundTarget(target)).toBe(false);
    },
  );

  it("rejects GpuFlow portal root content as a pane background target", () => {
    const { surface } = createProjectPaneFixture();
    const target = appendNestedTarget(surface, { gpuFlowPortalRoot: true });

    expect(isProjectPaneBackgroundTarget(target)).toBe(false);
  });

  it("rejects non-element event targets", () => {
    expect(isProjectPaneBackgroundTarget(document.createTextNode("text"))).toBe(
      false,
    );
  });
});

function createProjectPaneFixture() {
  const root = document.createElement("div");
  root.className = "setta-gpu-flow-root";
  const gpuFlow = document.createElement("div");
  gpuFlow.className = "setta-gpu-flow setta-gpu-flow__pane";
  const surface = document.createElement("canvas");
  surface.dataset.gpuFlowSurface = "true";
  gpuFlow.append(surface);
  root.append(gpuFlow);
  document.body.append(root);
  return { gpuFlow, root, surface };
}

function appendNestedTarget(
  parent: Element,
  options: {
    readonly className?: string | undefined;
    readonly dataAttribute?:
      | "gpuFlowDomIsland"
      | "gpuFlowRetainedContentCanvas"
      | "gpuFlowRetainedContentNative"
      | "gpuFlowRetainedContentSource"
      | undefined;
    readonly gpuFlowPortalRoot?: boolean | undefined;
    readonly id?: string | undefined;
  },
) {
  const wrapper = document.createElement("div");
  if (options.className) {
    wrapper.className = options.className;
  }
  if (options.dataAttribute) {
    wrapper.dataset[options.dataAttribute] = "true";
  }
  if (options.id) {
    wrapper.id = options.id;
  }
  if (options.gpuFlowPortalRoot) {
    wrapper.dataset.gpuFlowPortalRoot = "true";
  }
  const target = document.createElement("button");
  wrapper.append(target);
  parent.append(wrapper);
  return target;
}
