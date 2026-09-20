import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LensContext,
  type LensActions,
  type LensContextValue,
} from "../app/lensContext";
import { lensTestSnapshot } from "../test/lensTestData";
import { ScatterSection } from "./ScatterSection";

vi.mock("@setta/workspace", () => ({
  useWorkspaceAppearance: (
    selector: (state: { darkMode: boolean }) => unknown,
  ) => selector({ darkMode: true }),
}));

vi.mock("../charts/AnnotatedChartSurface", () => ({
  AnnotatedChartSurface: ({ ariaLabel }: { ariaLabel: string }) => (
    <div aria-label={ariaLabel} data-lens-chart="true" />
  ),
}));

function actions(): LensActions {
  return {
    clearFilters: vi.fn(),
    deleteAnnotation: vi.fn(),
    exportSelection: vi.fn(async () => {}),
    focusObservation: vi.fn(),
    openComparison: vi.fn(),
    saveAnnotation: vi.fn(),
    replaceSelectedObservations: vi.fn(),
    selectObservationGroup: vi.fn(),
    setCategoricalFilter: vi.fn(),
    setRange: vi.fn(),
    setRangeFilter: vi.fn(),
    setTimelineCursor: vi.fn(),
    toggleArtifact: vi.fn(),
    toggleObservation: vi.fn(),
  };
}

describe("scatter projection", () => {
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

  it("starts from manifest axes and lets the reader choose another projection", () => {
    const snapshot = lensTestSnapshot();
    const value: LensContextValue = {
      actions: actions(),
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
          <ScatterSection sectionId="population" />
        </LensContext.Provider>,
      );
    });
    const horizontal = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Scatter horizontal axis"]',
    );
    expect(horizontal?.value).toBe("cycle");
    expect(
      container
        .querySelector('[data-lens-chart="true"]')
        ?.getAttribute("aria-label"),
    ).toBe("Retention by Cycle");

    act(() => {
      if (!horizontal) {
        throw new Error("Expected the scatter horizontal axis control.");
      }
      const setter = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        "value",
      )?.set;
      setter?.call(horizontal, "retention");
      horizontal.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(
      container
        .querySelector('[data-lens-chart="true"]')
        ?.getAttribute("aria-label"),
    ).toBe("Retention by Retention");
  });
});
