import { describe, expect, it } from "vitest";

import {
  AUTHOR_COL_MAX_WIDTH_PX,
  DATE_COL_MAX_WIDTH_PX,
  DATE_COL_MIN_WIDTH_PX,
  GIT_GRAPH_DIFF_PANE_MIN_WIDTH_PX,
  GIT_GRAPH_HISTORY_PANE_MIN_WIDTH_PX,
  HASH_COL_MIN_WIDTH_PX,
  buildGitGraphColumnPersistPatch,
  finalizeGitGraphColumnWidths,
  measureGitGraphColumnContentWidth,
  resolveGitGraphColumnResetWidths,
  resolveGitGraphColumnWidthsFromDelta,
  resolveGitGraphPaneSplitPct,
} from "./gitGraphOverlayResizeModel";

describe("resolveGitGraphPaneSplitPct", () => {
  it("clamps the split handle to the history and diff pane minimums", () => {
    // A large left drag should stop at the history-pane minimum.
    const leftClampedPct = resolveGitGraphPaneSplitPct({
      wrapperWidth: 1000,
      handleWidth: 12,
      splitPct: 56,
      deltaX: -4000,
    });

    // A large right drag should stop once the diff pane reaches its minimum.
    const rightClampedPct = resolveGitGraphPaneSplitPct({
      wrapperWidth: 1000,
      handleWidth: 12,
      splitPct: 56,
      deltaX: 4000,
    });

    expect(leftClampedPct).toBeCloseTo(
      (GIT_GRAPH_HISTORY_PANE_MIN_WIDTH_PX / 1000) * 100,
      5,
    );
    expect(rightClampedPct).toBeCloseTo(
      ((1000 - 12 - GIT_GRAPH_DIFF_PANE_MIN_WIDTH_PX) / 1000) * 100,
      5,
    );
  });
});

describe("measureGitGraphColumnContentWidth", () => {
  it("subtracts horizontal padding and all grid gaps from the header width", () => {
    // The resize model needs the inner grid width, not the outer header box.
    expect(
      measureGitGraphColumnContentWidth({
        headerClientWidth: 600,
        paddingLeftPx: 12,
        paddingRightPx: 12,
        columnGapPx: 8,
      }),
    ).toBe(544);
  });
});

describe("resolveGitGraphColumnWidthsFromDelta", () => {
  it("caps graph growth when the message column hits its minimum width", () => {
    // Growing the graph column must still leave the message column at >= 96px.
    expect(
      resolveGitGraphColumnWidthsFromDelta({
        boundary: "graphMessage",
        startWidths: {
          graph: 120,
          author: 120,
          date: 110,
          hash: 84,
        },
        contentWidth: 540,
        deltaX: 100,
      }),
    ).toEqual({ graph: 130 });
  });

  it("preserves author/date total width while clamping to both column bounds", () => {
    // Moving the author/date handle should redistribute width, not create or lose space.
    expect(
      resolveGitGraphColumnWidthsFromDelta({
        boundary: "authorDate",
        startWidths: {
          graph: 120,
          author: 120,
          date: 110,
          hash: 84,
        },
        contentWidth: 700,
        deltaX: 200,
      }),
    ).toEqual({ author: 140, date: 90 });
  });
});

describe("resolveGitGraphColumnResetWidths", () => {
  it("restores paired date/hash widths toward their defaults on double-click", () => {
    // Double-click should pull the date column back to its default and give the width back to hash.
    expect(
      resolveGitGraphColumnResetWidths({
        boundary: "dateHash",
        startWidths: {
          graph: 120,
          author: 120,
          date: 150,
          hash: 84,
        },
        contentWidth: 700,
      }),
    ).toEqual({ date: 110, hash: 124 });
  });
});

describe("finalizeGitGraphColumnWidths", () => {
  it("keeps only the boundary-owned keys and clamps them into persisted ranges", () => {
    // Pointer-up persistence should not write unrelated columns back into local storage.
    expect(
      finalizeGitGraphColumnWidths({
        boundary: "dateHash",
        widths: {
          graph: 120,
          author: 120,
          date: 999,
          hash: 1,
        },
      }),
    ).toEqual({
      date: DATE_COL_MAX_WIDTH_PX,
      hash: HASH_COL_MIN_WIDTH_PX,
    });
  });
});

describe("buildGitGraphColumnPersistPatch", () => {
  it("maps resized columns onto the ui-preference store keys", () => {
    // The storage patch needs the user-preference field names, not local graph keys.
    expect(
      buildGitGraphColumnPersistPatch({
        author: AUTHOR_COL_MAX_WIDTH_PX,
        date: DATE_COL_MIN_WIDTH_PX,
      }),
    ).toEqual({
      gitGraphAuthorWidthPx: AUTHOR_COL_MAX_WIDTH_PX,
      gitGraphDateWidthPx: DATE_COL_MIN_WIDTH_PX,
    });
  });
});
