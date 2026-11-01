import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKSPACE_TOP_LEVEL_AUTO_LAYOUT_GAP,
  planWorkspaceTopLevelAutoLayout,
  type WorkspaceTopLevelAutoLayoutRectangle,
} from "./planner.js";

function rectangle(
  id: string,
  overrides: Partial<WorkspaceTopLevelAutoLayoutRectangle> = {},
): WorkspaceTopLevelAutoLayoutRectangle {
  return {
    height: 120,
    id,
    locked: false,
    width: 200,
    x: 0,
    y: 0,
    zIndex: 0,
    ...overrides,
  };
}

function positionFor(
  plan: ReturnType<typeof planWorkspaceTopLevelAutoLayout>,
  id: string,
): Readonly<{ x: number; y: number }> {
  const position = plan.positionsById[id];
  if (!position) {
    throw new Error(`Missing position for ${id}.`);
  }
  return position;
}

function haveRequiredGap(
  left: WorkspaceTopLevelAutoLayoutRectangle,
  right: WorkspaceTopLevelAutoLayoutRectangle,
  positions: ReturnType<
    typeof planWorkspaceTopLevelAutoLayout
  >["positionsById"],
  gap: number,
): boolean {
  const leftPosition = positionFor({ positionsById: positions }, left.id);
  const rightPosition = positionFor({ positionsById: positions }, right.id);
  return (
    leftPosition.x + left.width + gap <= rightPosition.x ||
    rightPosition.x + right.width + gap <= leftPosition.x ||
    leftPosition.y + left.height + gap <= rightPosition.y ||
    rightPosition.y + right.height + gap <= leftPosition.y
  );
}

describe("planWorkspaceTopLevelAutoLayout", () => {
  it("creates a deterministic compact shelf plan with spacing and a stable anchor", () => {
    const rectangles = [
      rectangle("alpha", {
        height: 160,
        width: 260,
        x: 480,
        y: 360,
        zIndex: 1,
      }),
      rectangle("bravo", {
        height: 100,
        width: 180,
        x: 120,
        y: 240,
        zIndex: 2,
      }),
      rectangle("charlie", {
        height: 220,
        width: 140,
        x: 760,
        y: 480,
        zIndex: 3,
      }),
      rectangle("delta", {
        height: 130,
        width: 220,
        x: 280,
        y: 180,
        zIndex: 4,
      }),
    ];
    const plan = planWorkspaceTopLevelAutoLayout(rectangles);
    const reordered = planWorkspaceTopLevelAutoLayout(
      [...rectangles].reverse(),
    );

    expect(plan.positionsById).toEqual(reordered.positionsById);
    expect(
      Math.min(...Object.values(plan.positionsById).map(({ x }) => x)),
    ).toBe(120);
    expect(
      Math.min(...Object.values(plan.positionsById).map(({ y }) => y)),
    ).toBe(180);
    for (const [index, left] of rectangles.entries()) {
      for (const right of rectangles.slice(index + 1)) {
        expect(
          haveRequiredGap(
            left,
            right,
            plan.positionsById,
            DEFAULT_WORKSPACE_TOP_LEVEL_AUTO_LAYOUT_GAP,
          ),
        ).toBe(true);
      }
    }
  });

  it("keeps locked rectangles fixed while treating them as spacing obstacles", () => {
    const locked = rectangle("locked", {
      height: 220,
      locked: true,
      width: 260,
      x: 0,
      y: 0,
      zIndex: 1,
    });
    const rectangles = [
      locked,
      rectangle("alpha", { x: 0, y: 0, zIndex: 2 }),
      rectangle("bravo", { height: 180, width: 220, x: 40, y: 20, zIndex: 3 }),
      rectangle("charlie", {
        height: 100,
        width: 160,
        x: 80,
        y: 40,
        zIndex: 4,
      }),
    ];
    const plan = planWorkspaceTopLevelAutoLayout(rectangles);

    expect(positionFor(plan, "locked")).toEqual({ x: 0, y: 0 });
    for (const rectangle of rectangles.filter(
      (candidate) => !candidate.locked,
    )) {
      expect(
        haveRequiredGap(
          locked,
          rectangle,
          plan.positionsById,
          DEFAULT_WORKSPACE_TOP_LEVEL_AUTO_LAYOUT_GAP,
        ),
      ).toBe(true);
    }
  });

  it("is idempotent, preserves inputs, and supports prototype-like ids", () => {
    const rectangles = [
      rectangle("__proto__", {
        height: 160,
        width: 180,
        x: 300,
        y: 100,
        zIndex: 1,
      }),
      rectangle("constructor", {
        height: 100,
        width: 220,
        x: 0,
        y: 0,
        zIndex: 2,
      }),
      rectangle("toString", {
        height: 140,
        width: 160,
        x: 600,
        y: 200,
        zIndex: 3,
      }),
    ];
    const original = structuredClone(rectangles);
    const first = planWorkspaceTopLevelAutoLayout(rectangles, { gap: 32 });
    const replanned = rectangles.map((candidate) => ({
      ...candidate,
      ...positionFor(first, candidate.id),
    }));
    const second = planWorkspaceTopLevelAutoLayout(replanned, { gap: 32 });

    expect(rectangles).toEqual(original);
    expect(first.positionsById["__proto__"]).toEqual(
      positionFor(first, "__proto__"),
    );
    expect(second.positionsById).toEqual(first.positionsById);
  });

  it("rejects duplicate ids and invalid geometry or gaps", () => {
    expect(() => planWorkspaceTopLevelAutoLayout([rectangle("")])).toThrow(
      "must not be empty",
    );
    expect(() =>
      planWorkspaceTopLevelAutoLayout([
        rectangle("duplicate"),
        rectangle("duplicate", { x: 400 }),
      ]),
    ).toThrow("duplicate id");
    expect(() =>
      planWorkspaceTopLevelAutoLayout([rectangle("bad", { width: 0 })]),
    ).toThrow("greater than zero");
    expect(() =>
      planWorkspaceTopLevelAutoLayout([rectangle("bad", { x: Number.NaN })]),
    ).toThrow("finite number");
    expect(() =>
      planWorkspaceTopLevelAutoLayout([rectangle("gap")], { gap: -1 }),
    ).toThrow("non-negative");
  });
});
