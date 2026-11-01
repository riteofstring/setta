import {
  afterEach as afterEachWorkspaceTestHost,
  beforeEach as beforeEachWorkspaceTestHost,
} from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
} from "../../../test/workspaceTestHost.js";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});
afterEachWorkspaceTestHost(() => {
  testWorkspace.host.dispose();
});

import { describe, expect, it } from "vitest";
import { useReactFlow } from "../../canvas/store.js";
import { applyZoomToTransform, transformToString } from "./zoom.js";

describe("zoom adapter utilities", () => {
  it("returns null and empty string for null transforms", () => {
    expect(applyZoomToTransform(testWorkspace.host, null)).toBeNull();
    expect(transformToString(null)).toBe("");
  });

  it("normalizes translation by current react-flow zoom", () => {
    testWorkspace.reactFlow.setState({ transform: [0, 0, 2] });

    expect(
      applyZoomToTransform(testWorkspace.host, {
        x: 20,
        y: 10,
        scaleX: 1,
        scaleY: 1,
      }),
    ).toEqual({
      x: 10,
      y: 5,
      scaleX: 1,
      scaleY: 1,
    });
  });

  it("renders transform strings with and without scale", () => {
    expect(transformToString({ x: 4, y: 6, scaleX: 1, scaleY: 1 })).toBe(
      "translate3d(4px, 6px, 0)",
    );

    expect(transformToString({ x: 4, y: 6, scaleX: 1.2, scaleY: 0.8 })).toBe(
      "translate3d(4px, 6px, 0) scaleX(1.2) scaleY(0.8)",
    );
  });
});
