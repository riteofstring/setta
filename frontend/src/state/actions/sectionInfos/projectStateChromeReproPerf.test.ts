// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { createProjectStateBackendUpdate } from "testUtils/projectStateBackendUpdate";
import {
  createProjectConfig,
  createTopLevelSectionLayout,
  createViewMode,
} from "utils/generatedTypes";

import { createProjectStateUpdateChromeReproTimer } from "./projectStateChromeReproPerf";

declare global {
  interface Window {
    __SETTA_CHROME_REPRO_ACTIVE__?: boolean;
  }
}

describe("createProjectStateUpdateChromeReproTimer", () => {
  afterEach(() => {
    window.__SETTA_CHROME_REPRO_ACTIVE__ = false;
    vi.restoreAllMocks();
  });

  it("summarizes nullable project-state update fields without throwing", () => {
    window.__SETTA_CHROME_REPRO_ACTIVE__ = true;
    const postSpy = vi.spyOn(window, "postMessage");
    vi.spyOn(performance, "now").mockReturnValue(10);
    const update = createProjectStateBackendUpdate({
      projectState: {
        projectConfig: createProjectConfig({
          activeIds: ["section-1", "section-2"],
          activeViewModeId: "view-1",
          id: "project-1",
          topLevelSections: {
            "section-1": createTopLevelSectionLayout({ x: 1, y: 2 }),
          },
          viewModes: {
            "view-1": createViewMode({
              id: "view-1",
              name: "View 1",
              sortIndex: 0,
            }),
          },
        }),
      },
    });
    update.completedOpIds = null;
    update.pendingOpIds = null;

    const timer = createProjectStateUpdateChromeReproTimer(update);
    timer.finish();

    expect(postSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "perf-project-state-update",
        payload: expect.objectContaining({
          activeSectionCount: 2,
          activeViewModeId: "view-1",
          completedOpCount: 0,
          incomingProjectConfigId: "project-1",
          pendingOpCount: 0,
          topLevelSectionCount: 1,
          viewModeCount: 1,
        }),
      }),
      "*",
    );
  });
});
