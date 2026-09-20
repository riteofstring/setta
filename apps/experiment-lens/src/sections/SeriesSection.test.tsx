import {
  createWorkspaceHost,
  WorkspaceProvider,
  type WorkspaceHost,
} from "@setta/workspace";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LensContext,
  type LensActions,
  type LensContextValue,
} from "../app/lensContext";
import { lensTestSnapshot } from "../test/lensTestData";
import { TimelineSection } from "./SeriesSection";

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

describe("recorded series section", () => {
  let container: HTMLDivElement;
  let host: WorkspaceHost;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    host = createWorkspaceHost();
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.dispose();
    container.remove();
  });

  it("shows a related series admission failure", () => {
    const base = lensTestSnapshot();
    const series = base.artifacts[0];
    if (!series) {
      throw new Error("The test series is required.");
    }
    const snapshot = {
      ...base,
      artifacts: [
        {
          ...series,
          content: null,
          error: {
            artifactId: series.reference.id,
            code: "artifact_changed",
            field: null,
            message: "The recorded series changed after admission.",
          },
          status: "failed" as const,
        },
      ],
    };
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
        <WorkspaceProvider host={host}>
          <LensContext.Provider value={value}>
            <TimelineSection sectionId="trace" />
          </LensContext.Provider>
        </WorkspaceProvider>,
      );
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "The recorded series changed after admission.",
    );
  });
});
