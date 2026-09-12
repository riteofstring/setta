import {
  activateWorkspaceSavedView,
  createWorkspaceHost,
  type WorkspaceHost,
} from "@setta/workspace";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CandidateInspector } from "../sections/CandidateSection";
import type { CandidateV1 } from "../backend/generatedContract";
import { makeBenchSnapshot } from "../testSnapshot";
import { ReviewPane } from "../views/ReviewPane";
import {
  BenchContext,
  type BenchActions,
  type BenchSelection,
} from "./benchContext";
import { registerBenchSectionKinds } from "./benchSectionKinds";
import { BenchView } from "./BenchView";
import {
  BENCH_COMPARE_VIEW_ID,
  BENCH_RUNS_VIEW_ID,
  projectWorkspaceDocument,
} from "./projectProjection";

let container: HTMLDivElement;
let root: Root;
let host: WorkspaceHost;

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 1_440, 900),
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  host = createWorkspaceHost();
});

afterEach(() => {
  act(() => root.unmount());
  host.dispose();
  container.remove();
  vi.restoreAllMocks();
});

function actions(): BenchActions {
  return {
    cancelRun: vi.fn(async () => true),
    importCandidate: vi.fn(async () => true),
    launch: vi.fn(async () => true),
    replaceProject: vi.fn(async () => true),
    rerun: vi.fn(async () => true),
    saveReview: vi.fn(async () => true),
  };
}

function selection(
  comparedRunIds: readonly [string | null, string | null] = [
    "run-cover",
    "run-contain",
  ],
): BenchSelection {
  return {
    activeCaseId: "sunset-bottle",
    activeRunId: "run-cover",
    comparedRunIds,
    selectCase: vi.fn(),
    selectComparedRun: vi.fn(),
    selectRun: vi.fn(),
  };
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  if (setter === undefined) {
    throw new Error("Expected the native input value setter.");
  }
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("Bench Workspace composition", () => {
  it("uses one Workspace shell for authored sections, run history, and comparison", async () => {
    const snapshot = makeBenchSnapshot();
    registerBenchSectionKinds(host);
    host.loadDocument(projectWorkspaceDocument(snapshot.project));

    await act(async () => {
      root.render(
        <BenchView
          actions={actions()}
          error={null}
          host={host}
          pendingAction={null}
          snapshot={snapshot}
        />,
      );
    });

    expect(
      container.querySelectorAll('[data-workspace-shell="true"]'),
    ).toHaveLength(1);
    expect(container.querySelector(".bench-app-header")).toBeNull();
    expect(
      [...container.querySelectorAll(".setta-workspace-saved-view-tab")].map(
        (tab) => tab.textContent?.trim(),
      ),
    ).toEqual(["Build", "Runs", "Compare"]);
    expect(
      container.querySelectorAll('[data-workspace-section-shell="true"]'),
    ).toHaveLength(4);
    expect(container.textContent).toContain("Colorful catalog images");
    expect(container.textContent).toContain("Thumbnail quality");

    await act(async () => {
      activateWorkspaceSavedView(host, BENCH_RUNS_VIEW_ID);
    });
    expect(container.querySelector(".bench-runs-table")).not.toBeNull();
    expect(
      container
        .querySelector(".bench-runs-table")
        ?.closest(".setta-workspace-window-surface"),
    ).not.toBeNull();
    expect(
      container.querySelectorAll('[data-workspace-section-shell="true"]'),
    ).toHaveLength(0);

    await act(async () => {
      activateWorkspaceSavedView(host, BENCH_COMPARE_VIEW_ID);
    });
    expect(
      container.querySelectorAll(
        ".setta-workspace-window-surface .bench-comparison-window",
      ),
    ).toHaveLength(2);
    expect(container.querySelector(".bench-case-buttons")).not.toBeNull();
    expect(container.querySelector(".bench-review-pane")).not.toBeNull();
    expect(container.textContent).toContain("Sunset bottle");
  });

  it("uses the backend validation projection for the launch preview", async () => {
    const snapshot = makeBenchSnapshot();
    snapshot.validation = {
      caseCount: 0,
      executionCount: 0,
      issues: [
        {
          code: "case_manifest_invalid",
          message: "cases.jsonl contains an invalid record",
          path: "project.caseSet.manifest",
        },
      ],
      ready: false,
    };
    registerBenchSectionKinds(host);
    host.loadDocument(projectWorkspaceDocument(snapshot.project));

    await act(async () => {
      root.render(
        <BenchView
          actions={actions()}
          error={null}
          host={host}
          pendingAction={null}
          snapshot={snapshot}
        />,
      );
    });

    const launch = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Run all candidates",
    );
    expect(launch?.disabled).toBe(true);
    expect(container.textContent).toContain(
      "cases.jsonl contains an invalid record",
    );
    expect(container.textContent).toContain("—cases×2candidates=—executions");
  });

  it("keeps a saved review when the compared runs change sides", async () => {
    const snapshot = makeBenchSnapshot();
    snapshot.reviews = [
      {
        leftRunId: "run-cover",
        note: "Cover keeps the product edge to edge.",
        preferredRunId: "run-cover",
        rightRunId: "run-contain",
        updatedAt: "2026-09-12T18:01:00Z",
        version: 1,
      },
    ];
    const saveReview = vi.fn(async () => true);

    await act(async () => {
      root.render(
        <BenchContext.Provider
          value={{
            actions: { ...actions(), saveReview },
            error: null,
            pendingAction: null,
            selection: selection(["run-contain", "run-cover"]),
            snapshot,
          }}
        >
          <ReviewPane />
        </BenchContext.Provider>,
      );
    });

    const preferences = container.querySelectorAll<HTMLInputElement>(
      'input[name="bench-preference"]',
    );
    expect(preferences[1]?.checked).toBe(true);
    expect(container.querySelector("textarea")?.value).toBe(
      "Cover keeps the product edge to edge.",
    );

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>("button")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(saveReview).toHaveBeenCalledWith({
      leftRunId: "run-cover",
      note: "Cover keeps the product edge to edge.",
      preferredRunId: "run-cover",
      rightRunId: "run-contain",
    });
  });

  it("saves an empty candidate working directory as the project root", async () => {
    const snapshot = makeBenchSnapshot();
    let savedWorkingDirectory: string | null = null;
    const replaceProject: BenchActions["replaceProject"] = vi.fn(
      async (transform) => {
        const draft = transform(snapshot.project);
        savedWorkingDirectory =
          draft.candidates.find(
            (candidate: CandidateV1) => candidate.id === "contain",
          )?.command.workingDirectory ?? null;
        return true;
      },
    );

    await act(async () => {
      root.render(
        <BenchContext.Provider
          value={{
            actions: { ...actions(), replaceProject },
            error: null,
            pendingAction: null,
            selection: selection(),
            snapshot,
          }}
        >
          <CandidateInspector data={{ entityId: "contain" }} />
        </BenchContext.Provider>,
      );
    });

    const workingDirectory = container.querySelector<HTMLInputElement>(
      'input[placeholder="project root"]',
    );
    if (workingDirectory === null) {
      throw new Error("Expected the working directory input.");
    }
    await act(async () => setInputValue(workingDirectory, "   "));
    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent?.trim() === "Save candidate")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(replaceProject).toHaveBeenCalledOnce();
    expect(savedWorkingDirectory).toBe(".");
  });
});
