import { createRef } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { NiriLayoutStore } from "./layout-store";
import { NiriWorkspaceToolbar } from "./niri-workspace-toolbar";

describe("niri workspace toolbar", () => {
  test("renders performance stats in the top bar only when enabled", () => {
    const hidden = renderToString(
      <NiriWorkspaceToolbar
        focusedPaneId="workspace_pane_0"
        openPane={() => {}}
        overviewActive={false}
        performanceStatsRef={null}
        runLayoutAction={(action) => action()}
        showPerformanceStats={false}
        store={toolbarStore()}
      />,
    );

    const visible = renderToString(
      <NiriWorkspaceToolbar
        focusedPaneId="workspace_pane_0"
        openPane={() => {}}
        overviewActive={false}
        performanceStatsRef={createRef<HTMLDivElement>()}
        runLayoutAction={(action) => action()}
        showPerformanceStats
        store={toolbarStore()}
      />,
    );

    expect(hidden).not.toContain('data-testid="niri-performance-stats"');
    expect(hidden).toContain("niri-workspace-toolbar-spacer app-drag");
    expect(visible).toContain('data-testid="niri-performance-stats"');
    expect(visible).toContain("niri-workspace-toolbar-spacer app-drag");
  });
});

function toolbarStore(): NiriLayoutStore {
  return {
    paneLimitState: () => ({ allowed: true, count: 0, limit: null }),
    splitFocusedPane: () => {},
    splitFocusedPaneToPlane: () => {},
    toggleOverviewMode: () => {},
  } as unknown as NiriLayoutStore;
}
