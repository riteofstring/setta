import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { WorkspacePanel } from "./App";
import { WorkspaceSidebar } from "./components/workspace-sidebar";

describe("workspace renderer states", () => {
  test("renders the empty workspace state", () => {
    const html = renderToString(
      <>
        <WorkspaceSidebar
          activeWorkspaces={[]}
          busy={false}
          closeWorkspace={async () => {}}
          openLocalFolder={async () => {}}
          recentWorkspaces={[]}
          removeRecent={async () => {}}
          reorderWorkspaces={async () => {}}
          selectWorkspace={async () => {}}
          selectedWorkspaceId=""
        />
        <WorkspacePanel
          error={null}
          openLocalFolder={async () => {}}
          operation={null}
          selectedWorkspace={null}
          status="idle"
        />
      </>,
    );

    expect(html).toContain("No workspace open");
    expect(html).toContain("No active workspaces");
    expect(html).toContain("No recent workspaces");
  });

  test("renders active selected and recent workspace state", () => {
    const api = {
      displayName: "api",
      id: "workspace_api",
      lastOpenedAt: "2026-05-29T20:00:00Z",
      rootPath: "/tmp/api",
    };
    const web = {
      displayName: "web",
      id: "workspace_web",
      lastOpenedAt: "2026-05-29T20:05:00Z",
      rootPath: "/tmp/web",
    };
    const html = renderToString(
      <>
        <WorkspaceSidebar
          activeWorkspaces={[api, web]}
          busy={false}
          closeWorkspace={async () => {}}
          openLocalFolder={async () => {}}
          recentWorkspaces={[web, api]}
          removeRecent={async () => {}}
          reorderWorkspaces={async () => {}}
          selectWorkspace={async () => {}}
          selectedWorkspaceId="workspace_web"
        />
        <WorkspacePanel
          error={null}
          openLocalFolder={async () => {}}
          operation={null}
          selectedWorkspace={web}
          status="ready"
        />
      </>,
    );

    expect(html).toContain("web");
    expect(html).toContain("/tmp/web");
    expect(html).toContain("Active");
    expect(html).toContain('data-testid="active-workspace-list"');
    expect(html).toContain('data-testid="recent-workspace-list"');
  });

  test("renders loading and error states", () => {
    const html = renderToString(
      <WorkspacePanel
        error="workspace path does not exist"
        openLocalFolder={async () => {}}
        operation="opening"
        selectedWorkspace={null}
        status="error"
      />,
    );

    expect(html).toContain("Opening");
    expect(html).toContain("workspace path does not exist");
    expect(html).toContain('data-testid="workspace-error"');
  });

  test("bounds large workspace list row rendering", () => {
    const workspaces = Array.from({ length: 3000 }, (_, index) => ({
      displayName: `Workspace ${index}`,
      id: `workspace_${index}`,
      lastOpenedAt: "2026-05-29T20:00:00Z",
      rootPath: `/tmp/workspace-${index}`,
    }));

    const html = renderToString(
      <WorkspaceSidebar
        activeWorkspaces={workspaces}
        busy={false}
        closeWorkspace={async () => {}}
        openLocalFolder={async () => {}}
        recentWorkspaces={workspaces}
        removeRecent={async () => {}}
        reorderWorkspaces={async () => {}}
        selectWorkspace={async () => {}}
        selectedWorkspaceId="workspace_0"
      />,
    );

    expect(rowCount(html, "active-workspace-item")).toBeLessThan(30);
    expect(rowCount(html, "recent-workspace-item")).toBeLessThan(30);
  });
});

function rowCount(html: string, testId: string) {
  return html.split(`data-testid="${testId}"`).length - 1;
}
