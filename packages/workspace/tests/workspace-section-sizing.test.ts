import { describe, expect, it } from "vitest";

import type { WorkspaceSection } from "../src/core.js";
import type { SectionDefinition } from "../src/internal/workspace-section-contract.js";
import { resolveSectionDefinitions } from "../src/internal/workspace-section-registry.js";
import {
  resizeWorkspaceSectionWithKeyboard,
  workspaceSectionContentAxes,
  workspaceSectionMeasuredSize,
  workspaceSectionResizeAxes,
  workspaceSectionResizeHandles,
} from "../src/internal/workspace-section-sizing.js";
import { createWorkspaceTestDocument } from "../src/testing.js";

const EmptyRenderer = () => null;

function definition(overrides: Partial<SectionDefinition> = {}) {
  const registry = resolveSectionDefinitions([
    {
      defaultSize: { height: 180, width: 240 },
      displayName: "Resizable section",
      kind: "test",
      render: EmptyRenderer,
      ...overrides,
    },
  ]);
  const resolved = registry.definition("test");
  if (!resolved) {
    throw new Error("The sizing test definition was not registered.");
  }
  return resolved;
}

describe("workspace section sizing", () => {
  it("projects logical handles and limits content sizing to supported axes", () => {
    const resolved = definition({ contentSizing: { height: false, width: true } });

    expect(workspaceSectionResizeHandles(resolved)).toEqual(["inline-end", "block-end", "corner"]);
    expect(workspaceSectionResizeAxes(resolved, "inline-end")).toEqual(["width"]);
    expect(workspaceSectionResizeAxes(resolved, "block-end")).toEqual(["height"]);
    expect(workspaceSectionResizeAxes(resolved, "corner")).toEqual(["height", "width"]);
    expect(workspaceSectionContentAxes(resolved, "corner")).toEqual(["width"]);
    expect(
      workspaceSectionResizeHandles(
        definition({ resize: { axes: "none", preserveAspectRatio: false } }),
      ),
    ).toEqual([]);
  });

  it("uses the next grid line, unsnapped increments, and registered constraints", () => {
    const resolved = definition({
      resize: {
        axes: "both",
        maxSize: { height: 200, width: 250 },
        minSize: { height: 160, width: 200 },
        preserveAspectRatio: false,
      },
    });
    const base = {
      current: { height: 181, width: 241 },
      definition: resolved,
      gridOptions: { snap: true, spacing: [24, 16] as const },
      inlineEnd: "right" as const,
      position: { x: 20, y: 30 },
    };

    expect(
      resizeWorkspaceSectionWithKeyboard({
        ...base,
        handle: "inline-end",
        key: "ArrowRight",
      }),
    ).toEqual({ position: { x: 20, y: 30 }, size: { height: 181, width: 250 } });
    expect(
      resizeWorkspaceSectionWithKeyboard({
        ...base,
        handle: "block-end",
        key: "ArrowDown",
      }),
    ).toEqual({ position: { x: 20, y: 30 }, size: { height: 192, width: 241 } });
    expect(
      resizeWorkspaceSectionWithKeyboard({
        ...base,
        current: { height: 181, width: 250 },
        handle: "inline-end",
        key: "ArrowRight",
      }),
    ).toBeNull();
    expect(
      resizeWorkspaceSectionWithKeyboard({
        ...base,
        gridOptions: { snap: false, spacing: [24, 16] as const },
        handle: "block-end",
        key: "ArrowUp",
      }),
    ).toEqual({ position: { x: 20, y: 30 }, size: { height: 171, width: 241 } });
  });

  it("mirrors inline-end keyboard growth in RTL and preserves constrained aspect ratios", () => {
    const unconstrained = definition();
    expect(
      resizeWorkspaceSectionWithKeyboard({
        current: { height: 181, width: 241 },
        definition: unconstrained,
        gridOptions: { snap: true, spacing: [24, 16] },
        handle: "inline-end",
        inlineEnd: "left",
        key: "ArrowLeft",
        position: { x: 20, y: 30 },
      }),
    ).toEqual({ position: { x: -3, y: 30 }, size: { height: 181, width: 264 } });

    const aspect = definition({
      defaultSize: { height: 120, width: 240 },
      resize: {
        axes: "both",
        maxSize: { height: 140, width: 300 },
        minSize: { height: 80, width: 200 },
        preserveAspectRatio: true,
      },
    });
    expect(workspaceSectionResizeAxes(aspect, "inline-end")).toEqual(["height", "width"]);
    expect(
      resizeWorkspaceSectionWithKeyboard({
        current: { height: 120, width: 240 },
        definition: aspect,
        gridOptions: { snap: true, spacing: [24, 24] },
        handle: "block-end",
        inlineEnd: "right",
        key: "ArrowDown",
        position: { x: 20, y: 30 },
      }),
    ).toEqual({ position: { x: 20, y: 30 }, size: { height: 140, width: 280 } });
  });

  it("uses measured content dimensions while retaining canonical fallback values", () => {
    const document = createWorkspaceTestDocument([{ id: "alpha", title: "Alpha" }]);
    const section = document.sections.alpha as WorkspaceSection;

    expect(workspaceSectionMeasuredSize(section, { height: 196.5, width: 276.25 })).toEqual({
      height: 196.5,
      width: 276.25,
    });
    expect(workspaceSectionMeasuredSize(section, undefined)).toEqual({
      height: 180,
      width: 240,
    });
  });
});
