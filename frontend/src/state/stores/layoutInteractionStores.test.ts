/* @vitest-environment jsdom */

import { resetProjectStores } from "state/utils";
import { beforeEach, describe, expect, it } from "vitest";
import {
  useEdgeHandleRegistry,
  useMisc,
  useSectionRefs,
  useTemporaryMiscState,
} from "./layoutInteractionStores";

describe("layoutInteractionStores", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  it("resets layout interaction stores through the project reset path", () => {
    const handleElement = document.createElement("div");
    useSectionRefs.setState((state) => {
      state.withNested["section-a"] = handleElement;
      state.selfOnly["section-b"] = handleElement;
    });
    useEdgeHandleRegistry.setState((state) => {
      state.handles["handle-a"] = {
        sectionId: "section-a",
        portId: "port-a",
        type: "source",
        side: "right",
        element: handleElement,
      };
      state.positions["handle-a"] = {
        sectionId: "section-a",
        portId: "port-a",
        type: "source",
        side: "right",
        x: 24,
        y: 48,
      };
    });
    useTemporaryMiscState.setState({
      "section-a-header-height": 42,
      "blob-request": true,
    });
    useMisc.setState({
      isPanScrolling: true,
      mouseDownDrawArea: true,
      mouseDownDraggingSection: true,
      isSelectingParams: true,
      numDisplayedCodeAreas: 3,
      numInitializedCodeAreas: 2,
      requestUpdateNodeDimensions: true,
      updateAllDrawAreas: 5,
      updateDrawArea: { "section-a": 2 },
      projectChatTrackedGitPaneGraphWindowInstanceId: "pane-1",
      projectChatGitGraphEmbeddedPaneVisibleByInstanceId: {
        "project-a:pane-1": true,
      },
    });

    resetProjectStores();

    expect(useSectionRefs.getState()).toEqual({
      withNested: {},
      selfOnly: {},
      reset: expect.any(Function),
    });
    expect(useEdgeHandleRegistry.getState()).toEqual({
      handles: {},
      positions: {},
      reset: expect.any(Function),
    });
    expect(useTemporaryMiscState.getState()).toEqual({
      reset: expect.any(Function),
    });
    expect(useMisc.getState()).toEqual({
      isPanScrolling: false,
      lastMouseDownLocation: null,
      lastMouseUpLocation: null,
      mouseDownDrawArea: false,
      mouseDownDraggingSection: false,
      lastPaneClickLocation: { x: 0, y: 0 },
      undoOrRedoWasTriggered: false,
      isSelectingParams: false,
      numDisplayedCodeAreas: 0,
      numInitializedCodeAreas: 0,
      requestUpdateNodeDimensions: false,
      updateAllDrawAreas: 0,
      updateDrawArea: {},
      projectChatTrackedGitPaneGraphWindowInstanceId: null,
      projectChatGitGraphEmbeddedPaneVisibleByInstanceId: {},
      reset: expect.any(Function),
    });
  });
});
