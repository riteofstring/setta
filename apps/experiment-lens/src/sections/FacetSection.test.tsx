import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LensContext,
  type LensActions,
  type LensContextValue,
} from "../app/lensContext";
import { lensTestSnapshot } from "../test/lensTestData";
import { FacetSection } from "./FacetSection";

function actions(): LensActions {
  return {
    addNote: vi.fn(),
    clearFilters: vi.fn(),
    exportSelection: vi.fn(async () => {}),
    focusObservation: vi.fn(),
    openComparison: vi.fn(),
    setCategoricalFilter: vi.fn(),
    setRange: vi.fn(),
    setRangeFilter: vi.fn(),
    setTimelineCursor: vi.fn(),
    toggleArtifact: vi.fn(),
    toggleObservation: vi.fn(),
  };
}

describe("cohort facets", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("projects manifest-derived choices and requests one normalized filter", () => {
    const snapshot = lensTestSnapshot();
    const lensActions = actions();
    const value: LensContextValue = {
      actions: lensActions,
      busy: false,
      comparisonRequest: 0,
      error: null,
      focused: snapshot.observations[0] ?? null,
      selection: snapshot.selection,
      snapshot,
      timeline: { artifactId: null, cursor: null },
      visible: snapshot.observations,
    };

    act(() => {
      root.render(
        <LensContext.Provider value={value}>
          <FacetSection />
        </LensContext.Provider>,
      );
    });
    const nmc = container.querySelector<HTMLButtonElement>(
      '[data-lens-filter-value="NMC"]',
    );
    expect(nmc?.getAttribute("aria-pressed")).toBe("true");
    act(() => nmc?.click());
    expect(lensActions.setCategoricalFilter).toHaveBeenCalledWith(
      "chemistry",
      ["LFP"],
      ["LFP", "NMC"],
    );
    expect(
      container.querySelector("[data-lens-visible-count]")?.textContent,
    ).toBe("3");
  });
});
