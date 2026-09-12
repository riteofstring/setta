/* @vitest-environment jsdom */
import {
  afterEach as afterEachWorkspaceTestHost,
  beforeEach as beforeEachWorkspaceTestHost,
} from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
  WorkspaceTestProvider,
} from "../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});
afterEachWorkspaceTestHost(() => {
  testWorkspace.host.dispose();
});

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerWorkspaceCommands } from "../commands/workspaceCommandRegistry";
import { SectionDndContext } from "../dnd/SectionDndContext";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import { SectionContainer } from "../section/container/SectionContainer";
import { setWorkspaceSavedViewEditing } from "./editing";
import {
  enableWorkspaceSavedViews,
  setWorkspaceSavedViewSectionVisibility,
} from "./operations";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function loadDocument(): void {
  loadWorkspaceDocument(testWorkspace.host, {
    activeIds: [],
    savedViews: null,
    sections: {
      leaf: {
        children: [],
        id: "leaf",
        isHorizontalOrientation: false,
        isMinimized: false,
        kind: "leaf",
        name: "Leaf section",
        overflowMode: false,
        positionAndSizeLocked: false,
        size: { height: 96, width: 224 },
        styleColor: null,
        tagColor: null,
      },
    },
    topLevelSections: {
      leaf: { h: 96, w: 224, x: 0, y: 0, zIndex: 0 },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
  });
  enableWorkspaceSavedViews(testWorkspace.host, {
    id: "overview",
    name: "Overview",
  });
}

describe("saved view editing presentation", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    registerWorkspaceCommands(testWorkspace.host, []);
    registerSectionKinds(testWorkspace.host, {
      leaf: { renderContent: () => null },
    });
    loadDocument();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    registerWorkspaceCommands(testWorkspace.host, []);
    registerSectionKinds(testWorkspace.host, {});
  });

  async function render(): Promise<void> {
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          <SectionDndContext>
            <SectionContainer isTopLevel sectionId="leaf" />
          </SectionDndContext>
        </WorkspaceTestProvider>,
      );
    });
  }

  function getVisibilityButton(action: "hide" | "show"): HTMLButtonElement {
    const button = container.querySelector<HTMLButtonElement>(
      `[data-workspace-saved-view-action="${action}"]`,
    );
    if (!button) {
      throw new Error(`Expected the saved-view ${action} button.`);
    }
    return button;
  }

  it("ghosts hidden sections and replaces delete with direct view controls", async () => {
    setWorkspaceSavedViewSectionVisibility(testWorkspace.host, ["leaf"], false);
    await render();
    expect(container.querySelector('[data-section-id="leaf"]')).toBeNull();

    await act(async () => {
      setWorkspaceSavedViewEditing(testWorkspace.host, true);
    });
    expect(container.querySelector('[data-section-id="leaf"]')).not.toBeNull();
    expect(
      container.querySelector<HTMLElement>('[style*="opacity: 0.3"]'),
    ).not.toBeNull();
    expect(container.querySelector('[aria-label="Delete section"]')).toBeNull();

    await act(async () => {
      getVisibilityButton("show").click();
    });
    getVisibilityButton("hide");
    expect(
      container.querySelector<HTMLElement>('[style*="opacity: 0.3"]'),
    ).toBeNull();

    await act(async () => {
      getVisibilityButton("hide").click();
    });
    getVisibilityButton("show");

    await act(async () => {
      setWorkspaceSavedViewEditing(testWorkspace.host, false);
    });
    expect(container.querySelector('[data-section-id="leaf"]')).toBeNull();
  });
});
