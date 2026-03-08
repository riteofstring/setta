import { describe, expect, it } from "vitest";
import { getXYWidthHeight, syncSelectedMiniMapNodes } from "./MiniMap";

describe("getXYWidthHeight", () => {
  it("centers bounds and applies offset when bounds are smaller", () => {
    const result = getXYWidthHeight({
      boundingRect: { x: 0, y: 0, width: 100, height: 50 },
      elementWidth: 200,
      elementHeight: 100,
      offsetScale: 5,
    });

    expect(result.viewScale).toBeCloseTo(0.5);
    expect(result.offset).toBeCloseTo(2.5);
    expect(result.x).toBeCloseTo(-2.5);
    expect(result.y).toBeCloseTo(-2.5);
    expect(result.width).toBeCloseTo(105);
    expect(result.height).toBeCloseTo(55);
  });

  it("expands view when bounds are wider than the minimap element", () => {
    const result = getXYWidthHeight({
      boundingRect: { x: 10, y: 20, width: 300, height: 100 },
      elementWidth: 200,
      elementHeight: 100,
      offsetScale: 2,
    });

    expect(result.viewScale).toBeCloseTo(1.5);
    expect(result.offset).toBeCloseTo(3);
    expect(result.x).toBeCloseTo(7);
    expect(result.y).toBeCloseTo(-8);
    expect(result.width).toBeCloseTo(306);
    expect(result.height).toBeCloseTo(156);
  });
});

describe("syncSelectedMiniMapNodes", () => {
  it("does nothing when the minimap svg is not available yet", () => {
    expect(() => {
      syncSelectedMiniMapNodes(undefined, ["alpha"]);
    }).not.toThrow();
  });

  it("reconciles against the currently rendered minimap DOM", () => {
    const lateMount = createMiniMapSvg(["section-a"]);

    syncSelectedMiniMapNodes(lateMount.svg, ["section-a"]);

    expect(lateMount.nodes["section-a"]?.classList.contains("selected")).toBe(
      true,
    );
  });

  it("restores selected styling after a rerender resets node classes", () => {
    const svg = createMiniMapSvg(["section-a", "section-b"], {
      "section-b": ["selected"],
    });

    syncSelectedMiniMapNodes(svg.svg, ["section-a"]);

    expect(svg.nodes["section-a"]?.classList.contains("selected")).toBe(true);
    expect(svg.nodes["section-b"]?.classList.contains("selected")).toBe(false);
  });
});

function createMiniMapSvg(
  sectionIds: string[],
  initialClassesById: Record<string, string[]> = {},
) {
  const nodes: Record<string, StubSvgRect> = {};
  for (const sectionId of sectionIds) {
    nodes[sectionId] = createStubSvgRect(
      sectionId,
      initialClassesById[sectionId] ?? [],
    );
  }

  return {
    svg: {
      querySelectorAll: () => Object.values(nodes),
    } as unknown as SVGSVGElement,
    nodes,
  };
}

function createStubSvgRect(
  sectionId: string,
  initialClasses: string[],
): StubSvgRect {
  const classes = new Set(initialClasses);
  return {
    dataset: {
      minimapNodeId: sectionId,
    },
    classList: {
      toggle: (className: string, enabled?: boolean) => {
        if (enabled) {
          classes.add(className);
          return true;
        }
        classes.delete(className);
        return false;
      },
      contains: (className: string) => classes.has(className),
    },
  };
}

type StubSvgRect = {
  dataset: {
    minimapNodeId?: string;
  };
  classList: {
    toggle: (className: string, enabled?: boolean) => boolean;
    contains: (className: string) => boolean;
  };
};
