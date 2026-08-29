import { describe, expect, it } from "vitest";
import { GROUP_SECTION_KIND } from "../document/documentSelectors";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import type { WorkspaceSection } from "../document/types";
import { createWorkspaceHost } from "../workspaceHost";
import {
  allocateWorkspaceSectionWindowId,
  canWorkspaceSectionOpenInWindow,
  focusOrReopenWorkspaceWindow,
  getExternalWorkspaceSectionWindowBinding,
  reconcileWorkspaceSectionWindowBindings,
} from "./workspaceSectionWindowing";
import {
  createWorkspaceWindowingState,
  WORKSPACE_SECTION_WINDOW_SURFACE_KIND,
  type WorkspaceFloatingWindowInput,
} from "./windowingTypes";

function makeSection(id: string, kind = "ordinary"): WorkspaceSection {
  return {
    children: [],
    id,
    isHorizontalOrientation: false,
    isMinimized: false,
    kind,
    name: id,
    overflowMode: false,
    positionAndSizeLocked: false,
    size: { height: 200, width: 320 },
    styleColor: null,
    tagColor: null,
  };
}

function makeSectionWindow(
  id: string,
  sectionId: string,
  overrides: Partial<WorkspaceFloatingWindowInput> = {},
): WorkspaceFloatingWindowInput {
  return {
    bounds: { height: 300, width: 500, x: 100, y: 100 },
    contentId: `workspace-section:${sectionId}`,
    id,
    rendererData: null,
    sectionId,
    surfaceKind: WORKSPACE_SECTION_WINDOW_SURFACE_KIND,
    title: sectionId,
    ...overrides,
  };
}

describe("workspace section window ownership", () => {
  it("keeps hidden external bindings authoritative and reopens them before focus", () => {
    const state = createWorkspaceWindowingState({
      windows: [makeSectionWindow("window-a", "section-a", { isClosed: true })],
    });

    expect(
      getExternalWorkspaceSectionWindowBinding(state, "section-a")?.id,
    ).toBe("window-a");
    expect(
      focusOrReopenWorkspaceWindow(state, "window-a").windows[0],
    ).toMatchObject({
      isClosed: false,
      isMinimized: false,
    });
  });

  it("treats canvas placement as the non-external owner and allocates collision-safe ids", () => {
    const state = createWorkspaceWindowingState({
      windows: [
        makeSectionWindow("workspace-section-window:section-a", "section-a", {
          placement: "canvas_section",
        }),
      ],
    });

    expect(
      getExternalWorkspaceSectionWindowBinding(state, "section-a"),
    ).toBeNull();
    expect(allocateWorkspaceSectionWindowId(state, "section-a")).toBe(
      "workspace-section-window:section-a-2",
    );
  });

  it("removes missing or ineligible bindings in one validated next state", () => {
    const host = createWorkspaceHost();
    registerSectionKinds(host, {
      ordinary: { renderContent: () => null },
    });
    const ordinary = makeSection("ordinary");
    const group = makeSection("group", GROUP_SECTION_KIND);
    const state = createWorkspaceWindowingState({
      windows: [
        makeSectionWindow("keep", ordinary.id),
        makeSectionWindow("drop-group", group.id),
        makeSectionWindow("drop-missing", "missing"),
      ],
    });

    expect(canWorkspaceSectionOpenInWindow(host, ordinary)).toBe(true);
    expect(canWorkspaceSectionOpenInWindow(host, group)).toBe(false);
    const reconciled = reconcileWorkspaceSectionWindowBindings(
      host,
      { sections: { ordinary, group } },
      state,
    );
    expect(reconciled.windows.map((window) => window.id)).toEqual(["keep"]);
    expect(reconciled.nextFocusOrder).toBe(state.nextFocusOrder);
    host.dispose();
  });

  it("derives bound window titles from the live section document", () => {
    const host = createWorkspaceHost();
    registerSectionKinds(host, {
      ordinary: { renderContent: () => null },
    });
    const section = { ...makeSection("ordinary"), name: "Live title" };
    const state = createWorkspaceWindowingState({
      windows: [makeSectionWindow("window", section.id)],
    });

    const reconciled = reconcileWorkspaceSectionWindowBindings(
      host,
      { sections: { ordinary: section } },
      state,
    );

    expect(reconciled.windows[0]?.title).toBe("Live title");
    host.dispose();
  });
});
