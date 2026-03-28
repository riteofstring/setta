import { describe, expect, it } from "vitest";
import { HandlePosition } from "../types";
import {
  buildEdgeRendererView,
  shouldRenderEdgeRendererContents,
} from "./edgeRendererView";

describe("shouldRenderEdgeRendererContents", () => {
  it("requires positive canvas dimensions before mounting the edge svg", () => {
    // Preserve the existing mount gate so the edge layer stays absent until the canvas size is known.
    expect(
      shouldRenderEdgeRendererContents({
        width: 0,
        height: 240,
      }),
    ).toBe(false);
    expect(
      shouldRenderEdgeRendererContents({
        width: 320,
        height: 0,
      }),
    ).toBe(false);
    expect(
      shouldRenderEdgeRendererContents({
        width: 320,
        height: 240,
      }),
    ).toBe(true);
  });
});

describe("buildEdgeRendererView", () => {
  it("sorts visible edges by z-index and keeps only edges whose variants and handle positions are active", () => {
    // Preserve the normal render ordering while suppressing hidden, stale-variant, and positionless edges.
    expect(
      buildEdgeRendererView({
        edges: [
          {
            animated: false,
            data: { token: "later" },
            hidden: false,
            id: "edge-late",
            label: "Later edge",
            selected: false,
            sourcePortId: "out-b",
            sourceSectionId: "section-b",
            sourceVariantId: "variant-b",
            style: null,
            targetPortId: "in-b",
            targetSectionId: "section-c",
            targetVariantId: "variant-c",
            type: "straight",
            zIndex: 5,
          },
          {
            animated: true,
            data: { token: "visible" },
            hidden: false,
            id: "edge-visible",
            label: null,
            selected: true,
            sourcePortId: "out-a",
            sourceSectionId: "section-a",
            sourceVariantId: "variant-a",
            style: { strokeWidth: 3 },
            targetPortId: "in-a",
            targetSectionId: "section-b",
            targetVariantId: "variant-b",
            type: "bezier",
            zIndex: 2,
          },
          {
            animated: false,
            data: null,
            hidden: true,
            id: "edge-hidden",
            label: "Hidden edge",
            selected: false,
            sourcePortId: "out-a",
            sourceSectionId: "section-a",
            sourceVariantId: "variant-a",
            style: null,
            targetPortId: "missing",
            targetSectionId: "section-missing",
            targetVariantId: "variant-missing",
            type: "default",
            zIndex: 1,
          },
          {
            animated: false,
            data: null,
            hidden: false,
            id: "edge-stale-variant",
            label: "Stale variant",
            selected: false,
            sourcePortId: "out-a",
            sourceSectionId: "section-a",
            sourceVariantId: "variant-old",
            style: null,
            targetPortId: "in-a",
            targetSectionId: "section-b",
            targetVariantId: "variant-b",
            type: "default",
            zIndex: 0,
          },
          {
            animated: false,
            data: null,
            hidden: false,
            id: "edge-missing-position",
            label: "Missing position",
            selected: false,
            sourcePortId: "out-a",
            sourceSectionId: "section-a",
            sourceVariantId: "variant-a",
            style: null,
            targetPortId: "missing",
            targetSectionId: "section-c",
            targetVariantId: "variant-c",
            type: "default",
            zIndex: 3,
          },
        ],
        positions: {
          "section-a:out-a:source": {
            side: HandlePosition.Right,
            x: 10,
            y: 20,
          },
          "section-b:in-a:target": {
            side: HandlePosition.Left,
            x: 110,
            y: 120,
          },
          "section-b:out-b:source": {
            side: HandlePosition.Bottom,
            x: 210,
            y: 220,
          },
          "section-c:in-b:target": {
            side: HandlePosition.Top,
            x: 310,
            y: 320,
          },
        },
        sectionVariantMap: {
          "section-a": "variant-a",
          "section-b": "variant-b",
          "section-c": "variant-c",
        },
      }),
    ).toEqual({
      renderedEdges: [
        {
          animated: true,
          data: { token: "visible" },
          hidden: false,
          id: "edge-visible",
          label: undefined,
          selected: true,
          source: "section-a",
          sourceHandleId: "out-a",
          sourcePosition: HandlePosition.Right,
          sourceX: 10,
          sourceY: 20,
          style: { strokeWidth: 3 },
          target: "section-b",
          targetHandleId: "in-a",
          targetPosition: HandlePosition.Left,
          targetX: 110,
          targetY: 120,
          type: "bezier",
        },
        {
          animated: false,
          data: { token: "later" },
          hidden: false,
          id: "edge-late",
          label: "Later edge",
          selected: false,
          source: "section-b",
          sourceHandleId: "out-b",
          sourcePosition: HandlePosition.Bottom,
          sourceX: 210,
          sourceY: 220,
          style: undefined,
          target: "section-c",
          targetHandleId: "in-b",
          targetPosition: HandlePosition.Top,
          targetX: 310,
          targetY: 320,
          type: "straight",
        },
      ],
    });
  });
});
