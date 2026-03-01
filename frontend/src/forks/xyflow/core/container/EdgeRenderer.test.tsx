import { renderToStaticMarkup } from "react-dom/server";
import { makeEdgeHandleKey } from "state/actions/edgeHandles";
import { useEdgeHandleRegistry, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createProjectConfig,
  createTopLevelSectionLayout,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useReactFlow } from "../store";
import initialState from "../store/initialState";
import { HandlePosition } from "../types";
import EdgeRenderer from "./EdgeRenderer";

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

function seedProjectWithSingleEdge() {
  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: {
        "source-section": "source-variant",
        "target-section": "target-variant",
      },
      topLevelSections: {
        "source-section": createTopLevelSectionLayout({
          x: 0,
          y: 0,
          w: 100,
          h: 80,
        }),
        "target-section": createTopLevelSectionLayout({
          x: 260,
          y: 0,
          w: 100,
          h: 80,
        }),
      },
      edges: [
        {
          id: "edge-1",
          sourceSectionId: "source-section",
          sourceVariantId: "source-variant",
          sourcePortId: "out",
          targetSectionId: "target-section",
          targetVariantId: "target-variant",
          targetPortId: "in",
        },
      ],
    });
    state.previewSectionVariantMap = {};
  });

  useEdgeHandleRegistry.setState((state) => {
    const sourceKey = makeEdgeHandleKey("source-section", "out", "source");
    const targetKey = makeEdgeHandleKey("target-section", "in", "target");
    state.positions[sourceKey] = {
      sectionId: "source-section",
      portId: "out",
      type: "source",
      side: HandlePosition.Right,
      x: 80,
      y: 40,
    };
    state.positions[targetKey] = {
      sectionId: "target-section",
      portId: "in",
      type: "target",
      side: HandlePosition.Left,
      x: 260,
      y: 40,
    };
  });
}

describe("EdgeRenderer", () => {
  beforeEach(() => {
    resetProjectStores();
    useReactFlow.setState({ ...initialState, width: 900, height: 600 });
    seedProjectWithSingleEdge();

    syncStoreInitialState(useReactFlow);
    syncStoreInitialState(useProjectState);
    syncStoreInitialState(useEdgeHandleRegistry);
  });

  afterEach(() => {
    resetProjectStores();
    useReactFlow.setState({ ...initialState });
  });

  it("renders an edge path when variants and handle positions are available", () => {
    // Preserve UX guarantee: visible data edges stay rendered on the canvas.
    const markup = renderToStaticMarkup(<EdgeRenderer />);

    expect(markup).toContain("react-flow__edge-path");
    expect(markup).toContain("react-flow__edge-interaction");
  });

  it("omits an edge when source/target variant bindings no longer match", () => {
    // Preserve UX guarantee: stale edges are hidden when active variants change.
    useProjectState.setState((state) => {
      state.projectConfig.sectionVariantMap["source-section"] = "other-variant";
    });
    syncStoreInitialState(useProjectState);

    const markup = renderToStaticMarkup(<EdgeRenderer />);
    expect(markup).not.toContain("react-flow__edge-path");
  });
});
