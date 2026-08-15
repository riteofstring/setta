/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialCanvasState, useReactFlow } from "../canvas/store";
import type { WorkspaceCreationCommand } from "../context-menu/workspaceMenuTypes";
import { getActiveSectionIds } from "../document/activeSections";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { setWorkspaceDocumentChangeCallback } from "../document/documentChangeCallback";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import { useActiveSections, useNodeInternals, useWorkspaceDocument } from "../document/stores";
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
  const d3Zoom = { transform } as unknown as NonNullable<typeof initialCanvasState.d3Zoom>;
  useReactFlow.setState({ d3Selection, d3Zoom });
  return transform;
}

function loadWorkspace(layouts: Record<string, { x: number; y: number }>) {
  loadWorkspaceDocument({
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
  });
}

describe("creating a section without a pointer", () => {
  beforeEach(() => {
    requestedPositions.length = 0;
    registerSectionKinds({
      sized: { renderContent: () => null, defaultSize: { width: 240, height: 120 } },
    });
    useReactFlow.setState({ ...initialCanvasState, width: 800, height: 600 });
  });

  afterEach(() => {
    setWorkspaceDocumentChangeCallback(null);
    useWorkspaceCapabilities.getState().reset();
    useWorkspaceDocument.getState().reset();
    useActiveSections.getState().reset();
    useNodeInternals.getState().reset();
    useReactFlow.setState({ ...initialCanvasState });
    registerSectionKinds({});
  });

  it("asks the command for a section with no place, then places it", () => {
    loadWorkspace({});
    const onChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onChange);

    expect(createWorkspaceSectionFromCommand(createCommand())).toBe(true);

    expect(requestedPositions).toEqual([null]);
    expect(useWorkspaceDocument.getState().topLevelSections.created).toMatchObject({
      x: 24,
      y: 24,
    });
    expect(getActiveSectionIds()).toEqual(["created"]);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("travels to a section it had to place out of sight", () => {
    loadWorkspace({ existing: { x: 2000, y: 2000 } });
    const transform = setupZoomRuntime();

    expect(createWorkspaceSectionFromCommand(createCommand())).toBe(true);

    expect(useWorkspaceDocument.getState().topLevelSections.created).toMatchObject({
      x: 2000,
      y: 2144,
    });
    expect(transform).toHaveBeenCalledTimes(1);
  });

  it("leaves the canvas alone when the section lands in view", () => {
    loadWorkspace({});
    const transform = setupZoomRuntime();

    createWorkspaceSectionFromCommand(createCommand());

    expect(transform).not.toHaveBeenCalled();
  });

  it("declines without creating anything when the workspace forbids structural edits", () => {
    loadWorkspace({});
    useWorkspaceCapabilities.setState({ canEditStructure: false });

    expect(createWorkspaceSectionFromCommand(createCommand())).toBe(false);

    expect(requestedPositions).toEqual([]);
    expect(useWorkspaceDocument.getState().sections.created).toBeUndefined();
  });

  it("declines when the command itself is unavailable", () => {
    loadWorkspace({});

    expect(createWorkspaceSectionFromCommand(createCommand({ isDisabled: () => true }))).toBe(
      false,
    );

    expect(requestedPositions).toEqual([]);
    expect(useWorkspaceDocument.getState().sections.created).toBeUndefined();
  });
});
