import {
  WORKSPACE_CODE_SECTION_KIND,
  createWorkspaceHost,
} from "@setta/workspace";
import { describe, expect, it } from "vitest";

import { makeBenchSnapshot } from "../testSnapshot";
import { registerBenchSectionKinds } from "./benchSectionKinds";
import {
  BENCH_BUILD_VIEW_ID,
  BENCH_COMPARE_VIEW_ID,
  BENCH_RUNS_VIEW_ID,
  projectDraftSignature,
  projectDraftFromWorkspace,
  projectWorkspaceDocument,
} from "./projectProjection";

describe("Bench Workspace projection", () => {
  it("authors only domain entities and exposes three fixed saved-view tabs", () => {
    const snapshot = makeBenchSnapshot();
    const document = projectWorkspaceDocument(snapshot);

    expect(Object.keys(document.sections)).toEqual([
      "catalog-images",
      "contain",
      "cover",
      "thumbnail-quality",
    ]);
    expect(document.sections["catalog-images"]?.data).toEqual({
      entityId: "catalog-images",
    });
    expect(document.sections.contain?.kind).toBe(WORKSPACE_CODE_SECTION_KIND);
    expect(document.sections.contain?.data).toMatchObject({
      code: "thumbnail-candidate run \\\n  --mode contain",
      language: "bash",
      mode: "read-only",
    });
    const inputItems = Object.values(
      document.sections["catalog-images"]?.itemTree?.items ?? {},
    );
    expect(inputItems.map((item) => item.presentation?.label)).toEqual(
      expect.arrayContaining(["Sunset bottle", "input", "expected"]),
    );
    expect(document.savedViews?.activeViewId).toBe(BENCH_BUILD_VIEW_ID);
    expect(
      Object.values(document.savedViews?.views ?? {}).map((view) => [
        view.id,
        view.name,
        view.isTab,
      ]),
    ).toEqual([
      [BENCH_BUILD_VIEW_ID, "Build", true],
      [BENCH_RUNS_VIEW_ID, "Runs", true],
      [BENCH_COMPARE_VIEW_ID, "Compare", true],
    ]);
    expect(
      document.savedViews?.views[BENCH_BUILD_VIEW_ID]?.sectionVisibility,
    ).toEqual({
      "catalog-images": true,
      contain: true,
      cover: true,
      "thumbnail-quality": true,
    });
    expect(
      document.savedViews?.views[BENCH_RUNS_VIEW_ID]?.sectionVisibility,
    ).toEqual({
      "catalog-images": false,
      contain: false,
      cover: false,
      "thumbnail-quality": false,
    });
  });

  it("round-trips section names, geometry, and viewport into the project draft", () => {
    const snapshot = makeBenchSnapshot();
    const project = snapshot.project;
    const host = createWorkspaceHost();
    registerBenchSectionKinds(host);
    host.loadDocument(projectWorkspaceDocument(snapshot));
    const current = host.getSnapshot();
    expect(
      projectDraftSignature(projectDraftFromWorkspace(project, current)),
    ).toBe(
      projectDraftSignature({
        candidates: project.candidates,
        caseSet: project.caseSet,
        evaluator: project.evaluator,
        execution: project.execution,
        name: project.name,
        presentation: project.presentation,
      }),
    );
    const document = {
      ...current,
      sections: {
        ...current.sections,
        contain: {
          ...current.sections.contain!,
          name: "Letterbox",
          size: { ...current.sections.contain!.size, width: 350 },
        },
      },
      topLevelSections: {
        ...current.topLevelSections,
        contain: {
          ...current.topLevelSections.contain!,
          w: 352,
          x: 512,
          y: 96,
        },
      },
      viewport: { x: 12, y: 24, zoom: 1.1 },
    };

    const draft = projectDraftFromWorkspace(project, document);

    expect(draft.candidates[0]?.name).toBe("Letterbox");
    expect(draft.presentation.sections.contain).toMatchObject({
      width: 350,
      x: 512,
      y: 96,
    });
    expect(draft.presentation.viewport).toEqual({ x: 12, y: 24, zoom: 1.1 });
    host.dispose();
  });
});
