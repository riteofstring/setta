import { createRef } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { WorkspaceLayoutStore } from "./layout-store";
import { openPaneActions, WorkspaceToolbar } from "./workspace-toolbar";

describe("workspace toolbar", () => {
  test("renders performance stats in the top bar only when enabled", () => {
    const hidden = renderToString(
      <WorkspaceToolbar
        openPane={() => {}}
        overviewActive={false}
        performanceStatsRef={null}
        runLayoutAction={(action) => action()}
        showPerformanceStats={false}
        store={toolbarStore()}
      />,
    );

    const visible = renderToString(
      <WorkspaceToolbar
        openPane={() => {}}
        overviewActive={false}
        performanceStatsRef={createRef<HTMLDivElement>()}
        runLayoutAction={(action) => action()}
        showPerformanceStats
        store={toolbarStore()}
      />,
    );

    expect(hidden).not.toContain('data-testid="workspace-performance-stats"');
    expect(hidden).not.toContain("workspace_pane_0");
    expect(hidden).not.toContain('data-testid="workspace-focused-pane-label"');
    expect(hidden).toContain('data-testid="workspace-toolbar"');
    expect(hidden).not.toContain('data-workspace-title-bar="true"');
    expect(hidden).toContain('aria-label="Enter overview"');
    expect(hidden).toContain('aria-label="New frame"');
    expect(hidden).not.toContain('aria-label="Frame split vertically"');
    expect(hidden).not.toContain('aria-label="Add frame to the right"');
    expect(hidden).not.toContain('aria-label="Add frame above or below"');
    expect(visible).toContain('data-testid="workspace-performance-stats"');
  });

  test("registers only generic surviving workspace surfaces", () => {
    expect(openPaneActions.map(({ label }) => label)).toEqual(["Browser", "Settings"]);
    expect(openPaneActions).not.toContainEqual(
      expect.objectContaining({ request: expect.objectContaining({ surfaceKind: "easy-button" }) }),
    );
  });
});

function toolbarStore(): WorkspaceLayoutStore {
  return {
    paneLimitState: () => ({ allowed: true, count: 0, limit: null }),
    toggleOverviewMode: () => {},
  } as unknown as WorkspaceLayoutStore;
}
