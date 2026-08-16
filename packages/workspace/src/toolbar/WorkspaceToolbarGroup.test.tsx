/* @vitest-environment jsdom */
import { beforeEach as beforeEachWorkspaceTestHost } from "vitest";
import { createWorkspaceTestHost, type WorkspaceTestHost, WorkspaceTestProvider } from "../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});


import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialCanvasState, useReactFlow } from "../canvas/store";
import { registerWorkspaceCommands } from "../commands/workspaceCommandRegistry";
import type {
  WorkspaceCommandDefinition,
  WorkspacePaneCommandContext,
} from "../commands/workspaceCommandTypes";
import { registerWorkspaceCreationCommands } from "../context-menu/workspaceMenuRegistry";
import type { WorkspaceCreationCommand } from "../context-menu/workspaceMenuTypes";
import { getActiveSectionIds } from "../document/activeSections";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import {
  useActiveSections,
  useNodeInternals,
  useWorkspaceDocument,
} from "../document/stores";
import type { WorkspaceSectionInput } from "../document/types";
import { WorkspaceToolbarGroup } from "./WorkspaceToolbarGroup";
import { registerWorkspaceToolbarContributions } from "./workspaceToolbarRegistry";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function Icon() {
  return createElement("svg");
}

const runs: Array<WorkspacePaneCommandContext> = [];
let toggled = false;

const reportCommand: WorkspaceCommandDefinition = {
  id: "host-report",
  scope: "pane",
  surfaces: ["context-menu", "toolbar"],
  label: "Report the workspace",
  run: (context) => {
    runs.push(context);
  },
};

const toggleCommand: WorkspaceCommandDefinition = {
  id: "host-toggle",
  scope: "pane",
  surfaces: ["toolbar"],
  label: "Highlight the workspace",
  isChecked: () => toggled,
  run: () => {
    toggled = !toggled;
  },
};

const lockedCommand: WorkspaceCommandDefinition = {
  id: "host-locked",
  scope: "pane",
  surfaces: ["toolbar"],
  label: "Publish the workspace",
  getDisabledReason: () => "Connect a project to publish this workspace.",
  run: () => {
    throw new Error("A refusing command never runs.");
  },
};

const creationCommand: WorkspaceCreationCommand = {
  id: "host-note",
  label: "Host note",
  group: "Host",
  createSection: (context): WorkspaceSectionInput => {
    runs.push({
      host: testWorkspace.host,
      scope: "pane",
      workspacePosition: context.workspacePosition,
    });
    return {
      id: "created",
      kind: "sized",
      name: "Created",
      isMinimized: false,
      positionAndSizeLocked: false,
      isHorizontalOrientation: false,
      styleColor: null,
      overflowMode: false,
      tagColor: null,
      children: [],
    };
  },
};

describe("WorkspaceToolbarGroup", () => {
  let host: HTMLDivElement;
  let root: Root;

  async function render(
    placement: "before-viewport" | "before-minimap",
  ): Promise<void> {
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          {createElement(WorkspaceToolbarGroup, { placement })
        }</WorkspaceTestProvider>,
      );
    });
  }

  function getButton(label: string): HTMLButtonElement {
    const button = host.querySelector<HTMLButtonElement>(
      `button[aria-label="${label}"]`,
    );
    if (!button) {
      throw new Error(`Missing contributed control: ${label}`);
    }
    return button;
  }

  beforeEach(() => {
    runs.length = 0;
    toggled = false;
    registerSectionKinds(testWorkspace.host, {
      sized: {
        renderContent: () => null,
        defaultSize: { width: 240, height: 120 },
      },
    });
    registerWorkspaceCommands(testWorkspace.host, [reportCommand, toggleCommand, lockedCommand]);
    registerWorkspaceCreationCommands(testWorkspace.host, [creationCommand]);
    testWorkspace.reactFlow.setState({ ...initialCanvasState, width: 800, height: 600 });
    loadWorkspaceDocument(testWorkspace.host, {
      sections: {},
      topLevelSections: {},
      viewport: { x: 0, y: 0, zoom: 1 },
      activeIds: [],
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    registerWorkspaceToolbarContributions(testWorkspace.host, []);
    registerWorkspaceCommands(testWorkspace.host, []);
    registerWorkspaceCreationCommands(testWorkspace.host, []);
    registerSectionKinds(testWorkspace.host, {});
    testWorkspace.capabilities.getState().reset();
    testWorkspace.document.getState().reset();
    testWorkspace.activeSections.getState().reset();
    testWorkspace.nodeInternals.getState().reset();
    testWorkspace.reactFlow.setState({ ...initialCanvasState });
  });

  it("renders nothing, including a divider, when the host contributes nothing here", async () => {
    registerWorkspaceToolbarContributions(testWorkspace.host, [
      {
        kind: "command",
        commandId: reportCommand.id,
        icon: Icon,
        placement: "before-viewport",
      },
    ]);

    await render("before-minimap");

    expect(host.innerHTML).toBe("");
  });

  it("paints contributed controls in registration order and closes the group with one divider", async () => {
    registerWorkspaceToolbarContributions(testWorkspace.host, [
      {
        kind: "creation",
        commandId: creationCommand.id,
        icon: Icon,
        placement: "before-viewport",
      },
      {
        kind: "command",
        commandId: reportCommand.id,
        icon: Icon,
        placement: "before-viewport",
      },
      {
        kind: "command",
        commandId: toggleCommand.id,
        icon: Icon,
        placement: "before-minimap",
      },
    ]);

    await render("before-viewport");

    expect(
      Array.from(host.querySelectorAll("button")).map(
        (button) => button.ariaLabel,
      ),
    ).toEqual(["Host note", "Report the workspace"]);
    expect(host.querySelectorAll("div")).toHaveLength(1);
    expect(host.querySelector("div")?.className).toContain("h-px");
    expect(
      Array.from(host.querySelectorAll("button")).every(
        (button) => button.dataset.settaWorkspaceTouchTarget === "compact",
      ),
    ).toBe(true);
    expect(host.querySelector("button span")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });

  it("runs a pane command with no position and presses a toggle from its checked state", async () => {
    registerWorkspaceToolbarContributions(testWorkspace.host, [
      {
        kind: "command",
        commandId: reportCommand.id,
        icon: Icon,
        placement: "before-minimap",
      },
      {
        kind: "command",
        commandId: toggleCommand.id,
        icon: Icon,
        placement: "before-minimap",
      },
    ]);

    await render("before-minimap");

    expect(getButton("Report the workspace").getAttribute("aria-pressed")).toBe(
      null,
    );
    const toggle = getButton("Highlight the workspace");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(toggle.className).not.toContain("bg-blue-500");

    await act(async () => {
      getButton("Report the workspace").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      toggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(runs).toEqual([
      { host: testWorkspace.host, scope: "pane", workspacePosition: null },
    ]);
    expect(toggled).toBe(true);

    // A contributed control paints host-owned state, so the host's own re-render is what updates
    // it — the same contract the panes, the Outline, and the Inspector already follow.
    await render("before-minimap");

    expect(
      getButton("Highlight the workspace").getAttribute("aria-pressed"),
    ).toBe("true");
    expect(getButton("Highlight the workspace").className).toContain(
      "bg-blue-500",
    );
  });

  it("explains a refusing command in place and never runs it", async () => {
    registerWorkspaceToolbarContributions(testWorkspace.host, [
      {
        kind: "command",
        commandId: lockedCommand.id,
        icon: Icon,
        placement: "before-minimap",
      },
    ]);

    await render("before-minimap");

    const button = getButton("Publish the workspace");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.disabled).toBe(false);
    const reason = host.querySelector(
      `#${button.getAttribute("aria-describedby")}`,
    );
    expect(reason?.textContent).toBe(
      "Connect a project to publish this workspace.",
    );

    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  });

  it("creates a section in empty space, and refuses when structural editing is off", async () => {
    registerWorkspaceToolbarContributions(testWorkspace.host, [
      {
        kind: "creation",
        commandId: creationCommand.id,
        icon: Icon,
        placement: "before-viewport",
      },
    ]);

    await render("before-viewport");
    await act(async () => {
      getButton("Host note").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(runs).toEqual([
      { host: testWorkspace.host, scope: "pane", workspacePosition: null },
    ]);
    expect(
      testWorkspace.document.getState().topLevelSections.created,
    ).toMatchObject({
      x: 24,
      y: 24,
    });
    expect(getActiveSectionIds(testWorkspace.host)).toEqual(["created"]);

    await act(async () => {
      testWorkspace.capabilities.setState({ canEditStructure: false });
    });

    const button = getButton("Host note");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.getAttribute("aria-describedby")).toBe(null);

    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(runs).toHaveLength(1);
  });

  it("repaints a contributed control when the workspace state behind it changes", async () => {
    const getDisabledReason = vi.fn(() =>
      testWorkspace.document.getState().topLevelSections.created
        ? "Already reported."
        : null,
    );
    registerWorkspaceCommands(testWorkspace.host, [{ ...reportCommand, getDisabledReason }]);
    registerWorkspaceToolbarContributions(testWorkspace.host, [
      {
        kind: "command",
        commandId: reportCommand.id,
        icon: Icon,
        placement: "before-minimap",
      },
    ]);

    await render("before-minimap");
    expect(
      getButton("Report the workspace").getAttribute("aria-disabled"),
    ).toBe(null);

    await act(async () => {
      loadWorkspaceDocument(testWorkspace.host, {
        sections: {
          created: {
            id: "created",
            kind: "sized",
            name: "Created",
            isMinimized: false,
            positionAndSizeLocked: false,
            isHorizontalOrientation: false,
            styleColor: null,
            overflowMode: false,
            tagColor: null,
            children: [],
          },
        },
        topLevelSections: {
          created: { x: 0, y: 0, w: null, h: null, zIndex: 0 },
        },
        viewport: { x: 0, y: 0, zoom: 1 },
        activeIds: [],
      });
    });

    expect(
      getButton("Report the workspace").getAttribute("aria-disabled"),
    ).toBe("true");
  });
});
