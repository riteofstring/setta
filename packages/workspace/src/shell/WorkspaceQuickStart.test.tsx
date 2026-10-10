/* @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createWorkspaceTestHost,
  WorkspaceTestProvider,
  type WorkspaceTestHost,
} from "../../test/workspaceTestHost";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import { getWorkspaceDocumentStore } from "../document/stores";
import {
  createWorkspaceSavedView,
  enableWorkspaceSavedViews,
  setWorkspaceSavedViewSectionVisibility,
} from "../saved-views/operations";
import { WorkspaceQuickStart } from "./WorkspaceQuickStart";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("WorkspaceQuickStart", () => {
  let workspace: WorkspaceTestHost;
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    workspace = createWorkspaceTestHost();
    registerSectionKinds(workspace.host, {
      example: { renderContent: () => null },
    });
    loadWorkspaceDocument(workspace.host, {
      activeIds: [],
      savedViews: null,
      sections: {
        example: {
          id: "example",
          name: "Example",
          kind: "example",
          children: [],
          isHorizontalOrientation: false,
          isMinimized: false,
          overflowMode: false,
          positionAndSizeLocked: false,
          size: { width: 300, height: 200 },
          styleColor: null,
          tagColor: null,
        },
      },
      topLevelSections: { example: { x: 0, y: 0, w: 300, h: 200, zIndex: 0 } },
      viewport: { x: 0, y: 0, zoom: 1 },
    });
    enableWorkspaceSavedViews(workspace.host, {
      id: "overview",
      name: "Overview",
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    workspace.host.dispose();
    container.remove();
    vi.useRealTimers();
  });

  async function render(sectionId = "example", viewId?: string) {
    await act(async () =>
      root.render(
        <WorkspaceTestProvider workspace={workspace}>
          <WorkspaceQuickStart
            title="Try the example"
            description="Explore a working example."
            steps={[
              {
                title: "Look closer",
                description: "Change a value.",
                actionLabel: "Show example",
                sectionId,
                viewId,
              },
            ]}
            tip="Your changes are kept."
          />
        </WorkspaceTestProvider>,
      ),
    );
    const button = container.querySelector("button");
    if (!button) throw new Error("Missing guide action");
    return button;
  }

  it("opens the requested saved view without replacing authored content", async () => {
    createWorkspaceSavedView(workspace.host, {
      id: "details",
      name: "Details",
    });
    const button = await render("example", "overview");
    const before = getWorkspaceDocumentStore(workspace.host).getState()
      .sections;
    await act(async () => {
      button.click();
      await vi.runOnlyPendingTimersAsync();
    });
    const after = getWorkspaceDocumentStore(workspace.host).getState();
    expect(after.savedViews?.activeViewId).toBe("overview");
    expect(after.sections).toEqual(before);
  });

  it("explains hidden targets and keeps the rest of the guide usable", async () => {
    setWorkspaceSavedViewSectionVisibility(workspace.host, ["example"], false);
    const button = await render();
    await act(async () => {
      button.click();
      await vi.runOnlyPendingTimersAsync();
    });
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "hidden or has been removed",
    );
    expect(button.disabled).toBe(false);
    expect(
      getWorkspaceDocumentStore(workspace.host).getState().sections.example
        ?.name,
    ).toBe("Example");
  });

  it("disables a removed target with an explanation", async () => {
    const button = await render("removed");
    expect(button.disabled).toBe(true);
    expect(container.textContent).toContain(
      "Your other experiments are still available",
    );
  });
});
