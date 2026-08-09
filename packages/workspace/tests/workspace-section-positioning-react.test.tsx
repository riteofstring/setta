import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { WorkspaceSection } from "../src/core.js";
import {
  WorkspaceSectionPositioningControl,
  workspaceFreeformPositionsFromRects,
  workspaceOrderedPositioningMateriallyRearranges,
} from "../src/internal/workspace-section-positioning.js";

function container(positioning: "freeform" | "ordered"): WorkspaceSection {
  return {
    childLayout:
      positioning === "ordered"
        ? {
            orientation: "vertical",
            overflow: "grow",
            positioning: "ordered",
            sectionIds: ["first", "second"],
          }
        : {
            overflow: "grow",
            positioning: "freeform",
            positions: { first: { x: 0, y: 0 }, second: { x: 0, y: 52 } },
            sectionIds: ["first", "second"],
          },
    data: null,
    id: "container",
    isMinimized: false,
    kind: "container",
    positionAndSizeLocked: false,
    presentation: { accentColor: null, chrome: "default", tagColor: null },
    size: {
      height: { mode: "content", value: 320 },
      width: { mode: "fixed", value: 480 },
    },
    title: "Planning group",
  };
}

describe("workspace section positioning React geometry", () => {
  it("normalizes an ordered child block into stable non-negative local positions", () => {
    expect(
      workspaceFreeformPositionsFromRects(["first", "second", "third"], {
        first: { height: 50, width: 100, x: 420.125, y: 230.25 },
        second: { height: 60, width: 80, x: 532.125, y: 230.25 },
        third: { height: 40, width: 70, x: 624.125, y: 230.25 },
      }),
    ).toEqual({
      first: { x: 0, y: 0 },
      second: { x: 112, y: 0 },
      third: { x: 204, y: 0 },
    });
    expect(workspaceFreeformPositionsFromRects([], {})).toEqual({});
    expect(
      workspaceFreeformPositionsFromRects(["first", "missing"], {
        first: { height: 50, width: 100, x: 0, y: 0 },
      }),
    ).toBeNull();
  });

  it("requires confirmation only when the selected ordered layout changes measured positions", () => {
    const sizes = {
      first: { height: 50, width: 100 },
      second: { height: 40, width: 80 },
    };
    expect(
      workspaceOrderedPositioningMateriallyRearranges({
        direction: "ltr",
        gap: 12,
        orientation: "vertical",
        positions: { first: { x: 0, y: 0 }, second: { x: 0, y: 62 } },
        sectionIds: ["first", "second"],
        sizes,
        surfaceWidth: 192,
      }),
    ).toBe(false);
    expect(
      workspaceOrderedPositioningMateriallyRearranges({
        direction: "rtl",
        gap: 12,
        orientation: "horizontal",
        positions: { first: { x: 92, y: 0 }, second: { x: 0, y: 0 } },
        sectionIds: ["first", "second"],
        sizes,
        surfaceWidth: 192,
      }),
    ).toBe(false);
    expect(
      workspaceOrderedPositioningMateriallyRearranges({
        direction: "ltr",
        gap: 12,
        orientation: "vertical",
        positions: { first: { x: 16, y: 16 }, second: { x: 232, y: 48 } },
        sectionIds: ["first", "second"],
        sizes,
        surfaceWidth: 312,
      }),
    ).toBe(true);
  });

  it("renders one named native control for either positioning state", () => {
    const orderedMarkup = renderToStaticMarkup(
      <WorkspaceSectionPositioningControl
        layoutEditable
        onRequest={() => undefined}
        section={container("ordered")}
      />,
    );
    expect(orderedMarkup).toMatch(
      /aria-label="Use freeform positioning for Planning group child sections"/u,
    );
    expect(orderedMarkup).toContain('data-workspace-next-positioning="freeform"');
    expect(orderedMarkup).not.toContain("aria-haspopup");

    const freeformMarkup = renderToStaticMarkup(
      <WorkspaceSectionPositioningControl
        layoutEditable
        onRequest={() => undefined}
        section={container("freeform")}
      />,
    );
    expect(freeformMarkup).toMatch(
      /aria-haspopup="dialog"[^>]+aria-label="Change Planning group child positioning"/u,
    );
    expect(freeformMarkup).toContain('data-workspace-next-positioning="ordered"');

    const locked = { ...container("ordered"), positionAndSizeLocked: true };
    expect(
      renderToStaticMarkup(
        <WorkspaceSectionPositioningControl
          layoutEditable
          onRequest={() => undefined}
          section={locked}
        />,
      ),
    ).toContain("disabled");
  });
});
