/* @vitest-environment jsdom */
import {
  afterEach as afterEachWorkspaceTestHost,
  beforeEach as beforeEachWorkspaceTestHost,
} from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
} from "../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});
afterEachWorkspaceTestHost(() => {
  testWorkspace.host.dispose();
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialCanvasState, useReactFlow } from "../canvas/store";
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
import { createWorkspaceSectionFromCommand } from "./createSectionAction";

const requestedPositions: Array<unknown> = [];

function createCommand(overrides: Partial<WorkspaceCreationCommand> = {}) {
  return {
    id: "host-note",
    label: "Host note",
    group: "Host",
    createSection: (context): WorkspaceSectionInput => {
      requestedPositions.push(context.workspacePosition);
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
    ...overrides,
  } satisfies WorkspaceCreationCommand;
}

function setupZoomRuntime() {
  const transform = vi.fn();
  const d3Selection = {
    transition: () => ({ duration: () => ({ id: "transition" }) }),
  } as unknown as NonNullable<typeof initialCanvasState.d3Selection>;
  const d3Zoom = { transform } as unknown as NonNullable<
    typeof initialCanvasState.d3Zoom
  >;
  testWorkspace.reactFlow.setState({ d3Selection, d3Zoom });
  return transform;
}

function loadWorkspace(layouts: Record<string, { x: number; y: number }>) {
  loadWorkspaceDocument(testWorkspace.host, {
    sections: Object.fromEntries(
      Object.keys(layouts).map((id) => [
        id,
        {
          id,
          kind: "sized",
          name: id,
          isMinimized: false,
          positionAndSizeLocked: false,
          isHorizontalOrientation: false,
          styleColor: null,
          overflowMode: false,
          tagColor: null,
          children: [],
        },
      ]),
    ),
    topLevelSections: Object.fromEntries(
      Object.entries(layouts).map(([id, layout]) => [
        id,
        { x: layout.x, y: layout.y, w: null, h: null, zIndex: 0 },
      ]),
    ),
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: [],
    savedViews: null,
  });
}

describe("creating a section without a pointer", () => {
  beforeEach(() => {
    requestedPositions.length = 0;
    registerSectionKinds(testWorkspace.host, {
      sized: {
        renderContent: () => null,
        defaultSize: { width: 240, height: 120 },
      },
    });
    testWorkspace.reactFlow.setState({
      ...initialCanvasState,
      width: 800,
      height: 600,
    });
  });

  afterEach(() => {
    testWorkspace.capabilities.getState().reset();
    testWorkspace.document.getState().reset();
    testWorkspace.activeSections.getState().reset();
    testWorkspace.nodeInternals.getState().reset();
    testWorkspace.reactFlow.setState({ ...initialCanvasState });
    registerSectionKinds(testWorkspace.host, {});
  });

  it("asks the command for a section with no place, then places it", () => {
    loadWorkspace({});
    const onChange = vi.fn();
    testWorkspace.host.subscribe(onChange);

    expect(
      createWorkspaceSectionFromCommand(testWorkspace.host, createCommand()),
    ).toBe(true);

    expect(requestedPositions).toEqual([null]);
    expect(
      testWorkspace.document.getState().topLevelSections.created,
    ).toMatchObject({
      x: 24,
      y: 24,
    });
    expect(getActiveSectionIds(testWorkspace.host)).toEqual(["created"]);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("travels to a section it had to place out of sight", () => {
    loadWorkspace({ existing: { x: 2000, y: 2000 } });
    const transform = setupZoomRuntime();

    expect(
      createWorkspaceSectionFromCommand(testWorkspace.host, createCommand()),
    ).toBe(true);

    expect(
      testWorkspace.document.getState().topLevelSections.created,
    ).toMatchObject({
      x: 2000,
      y: 2144,
    });
    expect(transform).toHaveBeenCalledTimes(1);
  });

  it("leaves the canvas alone when the section lands in view", () => {
    loadWorkspace({});
    const transform = setupZoomRuntime();

    createWorkspaceSectionFromCommand(testWorkspace.host, createCommand());

    expect(transform).not.toHaveBeenCalled();
  });

  it("declines without creating anything when the workspace forbids structural edits", () => {
    loadWorkspace({});
    testWorkspace.capabilities.setState({ canEditStructure: false });

    expect(
      createWorkspaceSectionFromCommand(testWorkspace.host, createCommand()),
    ).toBe(false);

    expect(requestedPositions).toEqual([]);
    expect(testWorkspace.document.getState().sections.created).toBeUndefined();
  });

  it("declines when the command itself is unavailable", () => {
    loadWorkspace({});

    expect(
      createWorkspaceSectionFromCommand(
        testWorkspace.host,
        createCommand({ isDisabled: () => true }),
      ),
    ).toBe(false);

    expect(requestedPositions).toEqual([]);
    expect(testWorkspace.document.getState().sections.created).toBeUndefined();
  });
});
