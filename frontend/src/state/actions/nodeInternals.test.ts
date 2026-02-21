import type { Node } from "forks/xyflow/core/types";
import { useNodeInternals } from "state/definitions";
import { beforeEach, describe, expect, it } from "vitest";
import { getNodes } from "./nodeInternals";

describe("getNodes", () => {
  beforeEach(() => {
    useNodeInternals.setState({ x: new Map<string, Node>() });
  });

  it("omits hidden nodes by default", () => {
    const visibleNode: Node = {
      id: "visible",
      position: { x: 0, y: 0 },
      width: 100,
      height: 80,
      zIndex: 0,
      tempZIndex: 0,
      hidden: false,
    };
    const hiddenNode: Node = {
      id: "hidden",
      position: { x: 10, y: 20 },
      width: 120,
      height: 90,
      zIndex: 1,
      tempZIndex: 1,
      hidden: true,
    };

    useNodeInternals.setState({
      x: new Map([
        [visibleNode.id, visibleNode],
        [hiddenNode.id, hiddenNode],
      ]),
    });

    // Default consumer behavior should only include currently visible nodes.
    expect(getNodes().map((node) => node.id)).toEqual(["visible"]);
  });

  it("returns hidden nodes when includeHidden is true", () => {
    const visibleNode: Node = {
      id: "visible",
      position: { x: 0, y: 0 },
      width: 100,
      height: 80,
      zIndex: 0,
      tempZIndex: 0,
      hidden: false,
    };
    const hiddenNode: Node = {
      id: "hidden",
      position: { x: 10, y: 20 },
      width: 120,
      height: 90,
      zIndex: 1,
      tempZIndex: 1,
      hidden: true,
    };

    useNodeInternals.setState({
      x: new Map([
        [visibleNode.id, visibleNode],
        [hiddenNode.id, hiddenNode],
      ]),
    });

    // Callers that need the full map can explicitly opt into hidden nodes.
    expect(getNodes(null, true).map((node) => node.id)).toEqual([
      "visible",
      "hidden",
    ]);
  });
});
