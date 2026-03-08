import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Node } from "../core/types";
import { MiniMapNodes } from "./MiniMapNodes";
import type { MiniMapNodeProps } from "./types";

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
    expect(markup).not.toContain("react-flow__minimap-node selected");
  });

  it("does not advertise a selected prop to custom minimap node components", () => {
    const nodes: Node[] = [
      {
        id: "section-a",
        position: { x: 10, y: 20 },
        width: 100,
        height: 80,
        zIndex: 0,
        tempZIndex: 0,
      },
    ];
    const recordedProps: Array<MiniMapNodeProps> = [];
    const CustomNode = (props: MiniMapNodeProps) => {
      recordedProps.push(props);
      return <rect data-testid="custom-minimap-node" />;
    };

    renderToStaticMarkup(
      <svg>
        <MiniMapNodes nodes={nodes} nodeComponent={CustomNode} />
      </svg>,
    );

    expect(recordedProps).toHaveLength(1);
    expect("selected" in recordedProps[0]!).toBe(false);
  });
});
