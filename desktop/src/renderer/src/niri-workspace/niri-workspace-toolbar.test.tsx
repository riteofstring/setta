import { createRef } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { FloatingMenu } from "../components/floating-menu";
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
    expect(hidden).toContain("niri-workspace-toolbar-group app-drag");
    expect(hidden).toContain("niri-workspace-toolbar-spacer app-drag");
    expect(hidden).toContain("niri-workspace-toolbar-menu-root app-no-drag");
    expect(hidden).toContain("niri-workspace-toolbar-menu-button app-no-drag");
    expect(visible).toContain('data-testid="niri-performance-stats"');
    expect(visible).toContain("niri-workspace-toolbar-spacer app-drag");
  });

  test("keeps floating toolbar menus outside the Electron drag region", () => {
    const html = renderToString(
      <FloatingMenu
        anchorRef={createRef<HTMLButtonElement>()}
        className="niri-workspace-toolbar-menu"
        open
      >
        <button className="niri-workspace-toolbar-menu-item app-no-drag" type="button">
          Menu item
        </button>
      </FloatingMenu>,
    );

    expect(html).toContain("app-no-drag niri-workspace-toolbar-menu");
    expect(html).toContain("niri-workspace-toolbar-menu-item app-no-drag");
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
