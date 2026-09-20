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
    clearFilters: vi.fn(),
    deleteAnnotation: vi.fn(),
    exportSelection: vi.fn(async () => {}),
    focusObservation: vi.fn(),
    openComparison: vi.fn(),
    saveAnnotation: vi.fn(),
    selectObservations: vi.fn(),
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
          <FacetSection sectionId="cohort" />
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

  it("does not recommit an unchanged range field when focus leaves it", () => {
    const base = lensTestSnapshot();
    const observations = Array.from({ length: 9 }, (_, index) => ({
      id: `observation-${String(index + 1)}`,
      values: {
        chemistry: "LFP",
        cycle: (index + 1) * 100,
        retention: 98 - index,
      },
    }));
    const snapshot = {
      ...base,
      observations,
      selection: {
        ...base.selection,
        filters: [
          {
            fieldId: "cycle",
            maximum: null,
            minimum: 100,
            operator: "range" as const,
            values: [],
          },
        ],
      },
    };
    const lensActions = actions();
    act(() => {
      root.render(
        <LensContext.Provider
          value={{
            actions: lensActions,
            busy: false,
            comparisonRequest: 0,
            error: null,
            focused: observations[0] ?? null,
            selection: snapshot.selection,
            snapshot,
            timeline: { artifactId: null, cursor: null },
            visible: observations,
          }}
        >
          <FacetSection sectionId="cohort" />
        </LensContext.Provider>,
      );
    });
    const maximum = container.querySelector<HTMLInputElement>(
      'input[aria-label="Cycle maximum"]',
    );
    if (!maximum) {
      throw new Error("Expected the cycle maximum range field.");
    }
    act(() => {
      maximum.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(lensActions.setRangeFilter).not.toHaveBeenCalled();

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(maximum, "800");
      maximum.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(lensActions.setRangeFilter).toHaveBeenCalledOnce();
    expect(lensActions.setRangeFilter).toHaveBeenCalledWith("cycle", 100, 800, {
      maximum: 900,
      minimum: 100,
    });
  });
});
