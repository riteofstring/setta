import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LensContext,
  type LensActions,
  type LensContextValue,
} from "../app/lensContext";
import type { SelectionAnnotation } from "../backend/generatedContract";
import { lensTestSnapshot } from "../test/lensTestData";
import { AnnotatedChartSurface } from "./AnnotatedChartSurface";

const mocks = vi.hoisted(() => ({
  chart: {
    getHeight: vi.fn(() => 100),
    getWidth: vi.fn(() => 100),
  },
}));

vi.mock("@setta/workspace", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@setta/workspace")>()),
  useWorkspaceDocumentSnapshot: () => ({
    savedViews: { activeViewId: "overview" },
  }),
}));

vi.mock("./EChartSurface", async () => {
  const { forwardRef } = await vi.importActual<typeof import("react")>("react");
  return {
    EChartSurface: forwardRef(function MockEChartSurface(
      { ariaLabel }: { ariaLabel: string },
      ref: React.ForwardedRef<{ getChart: () => typeof mocks.chart }>,
    ) {
      if (typeof ref === "function") {
        ref({ getChart: () => mocks.chart });
      } else if (ref) {
        ref.current = { getChart: () => mocks.chart };
      }
      return <div aria-label={ariaLabel} data-lens-chart="true" />;
    }),
  };
});

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

function contextValue(
  lensActions: LensActions,
  annotations: readonly SelectionAnnotation[] = [],
): LensContextValue {
  const snapshot = lensTestSnapshot();
  const selection = {
    ...snapshot.selection,
    annotations: [...annotations],
    selectedObservationIds: ["observation-a"],
  };
  return {
    actions: lensActions,
    busy: false,
    comparisonRequest: 0,
    error: null,
    focused: snapshot.observations[0] ?? null,
    selection,
    snapshot: { ...snapshot, selection },
    timeline: { artifactId: null, cursor: null },
    visible: snapshot.observations,
  };
}

function clickButton(container: HTMLElement, label: string): void {
  const button = [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === label,
  );
  if (!button) {
    throw new Error(`Expected ${label} button.`);
  }
  button.click();
}

function setTextAreaValue(textarea: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function dispatchPointer(
  target: SVGSVGElement,
  type: string,
  x: number,
  y: number,
  shiftKey = false,
): void {
  const event = new Event(type, { bubbles: true });
  for (const [key, value] of Object.entries({
    button: 0,
    clientX: x,
    clientY: y,
    pointerId: 7,
    shiftKey,
  })) {
    Object.defineProperty(event, key, { value });
  }
  target.dispatchEvent(event);
}

function prepareInput(input: SVGSVGElement): void {
  Object.defineProperty(input, "getBoundingClientRect", {
    value: () => ({
      bottom: 100,
      height: 100,
      left: 0,
      right: 100,
      top: 0,
      width: 100,
      x: 0,
      y: 0,
    }),
  });
  input.setPointerCapture = vi.fn();
  input.releasePointerCapture = vi.fn();
  input.hasPointerCapture = vi.fn(() => true);
}

describe("chart annotations", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("turns a chart gesture into durable observation selection", () => {
    const lensActions = actions();
    const resolveSelection = vi.fn(() => ["observation-a", "observation-b"]);
    act(() => {
      root.render(
        <LensContext.Provider value={contextValue(lensActions)}>
          <AnnotatedChartSurface
            ariaLabel="Population"
            chartFieldIds={["cycle", "retention"]}
            option={{}}
            sectionId="population"
            selectionResolver={resolveSelection}
          />
        </LensContext.Provider>,
      );
    });
    act(() => clickButton(container, "Annotate"));
    const input = container.querySelector<SVGSVGElement>(
      '[aria-label="Select chart observations"]',
    );
    if (!input) {
      throw new Error("Expected chart selection surface.");
    }
    prepareInput(input);
    act(() => {
      dispatchPointer(input, "pointerdown", 10, 20, true);
      dispatchPointer(input, "pointermove", 70, 80, true);
      dispatchPointer(input, "pointerup", 70, 80, true);
    });
    expect(resolveSelection).toHaveBeenCalledWith(
      {
        additive: true,
        bounds: { bottom: 0.8, left: 0.1, right: 0.7, top: 0.2 },
      },
      mocks.chart,
    );
    expect(lensActions.selectObservationGroup).toHaveBeenCalledWith(
      ["observation-a", "observation-b"],
      true,
    );
  });

  it("saves normalized drawing strokes with typed data context", () => {
    const lensActions = actions();
    act(() => {
      root.render(
        <LensContext.Provider value={contextValue(lensActions)}>
          <AnnotatedChartSurface
            ariaLabel="Population"
            chartFieldIds={["cycle", "retention"]}
            option={{}}
            sectionId="population"
          />
        </LensContext.Provider>,
      );
    });
    act(() => clickButton(container, "Annotate"));
    const input = container.querySelector<SVGSVGElement>(
      '[aria-label="Draw chart annotation"]',
    );
    if (!input) {
      throw new Error("Expected chart drawing surface.");
    }
    prepareInput(input);
    act(() => {
      dispatchPointer(input, "pointerdown", 10, 20);
      dispatchPointer(input, "pointermove", 40, 50);
      dispatchPointer(input, "pointerup", 80, 90);
    });
    const textarea = container.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Chart annotation text"]',
    );
    if (!textarea) {
      throw new Error("Expected chart annotation text area.");
    }
    act(() => setTextAreaValue(textarea, "Rerun this region with more seeds."));
    act(() => clickButton(container, "Save annotation"));
    expect(lensActions.saveAnnotation).toHaveBeenCalledOnce();
    expect(
      vi.mocked(lensActions.saveAnnotation).mock.calls[0]?.[0],
    ).toMatchObject({
      chartFieldIds: ["cycle", "retention"],
      intent: "context",
      kind: "chart",
      observationIds: ["observation-a"],
      sectionId: "population",
      text: "Rerun this region with more seeds.",
      viewId: "overview",
    });
    expect(
      vi.mocked(lensActions.saveAnnotation).mock.calls[0]?.[0].strokes[0]
        ?.points,
    ).toEqual([
      { x: 0.1, y: 0.2 },
      { x: 0.4, y: 0.5 },
      { x: 0.8, y: 0.9 },
    ]);
  });

  it("renders, edits, and deletes a saved chart annotation", () => {
    const lensActions = actions();
    const annotation: SelectionAnnotation = {
      artifactId: null,
      artifactSha256: null,
      chartFieldIds: ["cycle", "retention"],
      filters: [],
      id: "annotation-a",
      intent: "question",
      kind: "chart",
      observationIds: ["observation-a"],
      rangeId: null,
      sectionId: "population",
      strokes: [
        {
          points: [
            { x: 0.2, y: 0.3 },
            { x: 0.7, y: 0.8 },
          ],
        },
      ],
      text: "Why does this run diverge?",
      viewId: "overview",
    };
    const otherViewAnnotation: SelectionAnnotation = {
      ...annotation,
      id: "annotation-b",
      viewId: "compare",
    };
    act(() => {
      root.render(
        <LensContext.Provider
          value={contextValue(lensActions, [annotation, otherViewAnnotation])}
        >
          <AnnotatedChartSurface
            ariaLabel="Population"
            chartFieldIds={["cycle", "retention"]}
            option={{}}
            sectionId="population"
          />
        </LensContext.Provider>,
      );
    });
    expect(
      container.querySelector(
        '[data-workspace-normalized-stroke="annotation-a:0"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-workspace-normalized-stroke="annotation-b:0"]',
      ),
    ).toBeNull();
    act(() => clickButton(container, "Annotate 1"));
    act(() => clickButton(container, "Edit"));
    expect(
      container.querySelector<HTMLTextAreaElement>(
        'textarea[aria-label="Chart annotation text"]',
      )?.value,
    ).toBe("Why does this run diverge?");
    expect(lensActions.replaceSelectedObservations).toHaveBeenCalledWith([
      "observation-a",
    ]);
    act(() => clickButton(container, "Delete"));
    expect(lensActions.deleteAnnotation).toHaveBeenCalledWith("annotation-a");
  });
});
