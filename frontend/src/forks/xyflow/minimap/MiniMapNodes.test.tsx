import { renderToStaticMarkup } from "react-dom/server";
import type { Node } from "../core/types";
import { MiniMapNodes } from "./MiniMapNodes";
import { describe, expect, it } from "vitest";

describe("MiniMapNodes", () => {
  it("renders stable node ids for imperative selection syncing", () => {
    const nodes: Node[] = [
      {
        id: "section-a",
        position: { x: 10, y: 20 },
        width: 100,
        height: 80,
        zIndex: 0,
        tempZIndex: 0,
      },
      {
        id: "section-b",
        position: { x: 180, y: 40 },
        width: 120,
        height: 90,
        zIndex: 0,
        tempZIndex: 0,
      },
    ];

    const markup = renderToStaticMarkup(
      <svg>
        <MiniMapNodes nodes={nodes} />
      </svg>,
    );

    expect(markup).toContain('data-minimap-node-id="section-a"');
    expect(markup).toContain('data-minimap-node-id="section-b"');
    expect(markup).not.toContain('react-flow__minimap-node selected');
  });
});
