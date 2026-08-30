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

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useCanvasViewportDocumentSync } from "./documentViewportSync";

let root: Root;
let container: HTMLDivElement;
let controller: ReturnType<typeof useCanvasViewportDocumentSync> | null;

function ViewportSyncProbe() {
  controller = useCanvasViewportDocumentSync();
  return null;
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  controller = null;
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

describe("controlled canvas viewport document sync", () => {
  it("publishes one document change for a controlled viewport update", async () => {
    testWorkspace.document.setState({ viewport: { x: 0, y: 0, zoom: 1 } });
    let publications = 0;
    const unsubscribe = testWorkspace.host.subscribe(() => {
      publications += 1;
    });

    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          <ViewportSyncProbe />
        </WorkspaceTestProvider>,
      );
    });

    if (!controller) {
      throw new Error("Controlled canvas viewport sync did not mount.");
    }
    expect(publications).toBe(0);

    await act(async () => {
      controller?.onViewportChange({ x: 40, y: -25, zoom: 2 });
    });

    expect(testWorkspace.document.getState().viewport).toEqual({
      x: 40,
      y: -25,
      zoom: 2,
    });
    expect(testWorkspace.reactFlow.getState().transform).toEqual([40, -25, 2]);
    expect(publications).toBe(1);

    await act(async () => {
      controller?.onViewportChange({ x: 40, y: -25, zoom: 2 });
    });

    expect(publications).toBe(1);
    unsubscribe();
  });
});
