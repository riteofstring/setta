/* @vitest-environment jsdom */
import {
  afterEach as afterEachWorkspaceTestHost,
  beforeEach as beforeEachWorkspaceTestHost,
} from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
  WorkspaceTestProvider,
} from "../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});
afterEachWorkspaceTestHost(() => {
  testWorkspace.host.dispose();
});

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  activateDndMovingFreeMode,
  activateDndSortingMode,
  useDndState,
} from "../dnd/dndState";
import { initialCanvasState, useReactFlow } from "./store";
import { useShouldDisablePointerEvents } from "./useShouldDisablePointerEvents";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let latest: boolean | null = null;

function Probe() {
  latest = useShouldDisablePointerEvents();
  return null;
}

describe("useShouldDisablePointerEvents", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    testWorkspace.reactFlow.setState({ ...initialCanvasState });
    testWorkspace.dndState.getState().reset();
    latest = null;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          {createElement(Probe)}
        </WorkspaceTestProvider>,
      );
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    testWorkspace.reactFlow.setState({ ...initialCanvasState });
    testWorkspace.dndState.getState().reset();
  });

  it("keeps pointer events enabled by default", () => {
    expect(latest).toBe(false);
  });

  it("disables pointer events while a dnd mode is held, as the reference does", async () => {
    await act(async () => {
      activateDndSortingMode(testWorkspace.host);
    });
    expect(latest).toBe(true);

    await act(async () => {
      testWorkspace.dndState.getState().reset();
      activateDndMovingFreeMode(testWorkspace.host);
    });
    expect(latest).toBe(true);
  });

  it("disables pointer events while multi-select or zoom activation is held", async () => {
    await act(async () => {
      testWorkspace.reactFlow.setState({ multiSelectionActive: true });
    });
    expect(latest).toBe(true);

    await act(async () => {
      testWorkspace.reactFlow.setState({
        multiSelectionActive: false,
        zoomActivationKeyPressed: true,
      });
    });
    expect(latest).toBe(true);
  });

  it("disables pointer events only once a marquee rect exists for the selection key", async () => {
    await act(async () => {
      testWorkspace.reactFlow.setState({ selectionKeyPressed: true });
    });
    expect(latest).toBe(false);

    await act(async () => {
      testWorkspace.reactFlow.setState({
        userSelectionRect: {
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          startX: 0,
          startY: 0,
        },
      });
    });
    expect(latest).toBe(true);
  });
});
