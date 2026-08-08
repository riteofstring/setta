import { describe, expect, it, vi } from "vitest";

import type { WorkspaceDocument, WorkspaceDocumentChange } from "../src/core.js";
import {
  createWorkspaceCanvasController,
  type WorkspaceCanvasController,
} from "../src/internal/workspace-canvas-navigation.js";
import { createWorkspaceController } from "../src/internal/workspace-controller.js";
import type { WorkspaceGeometryMeasurements } from "../src/internal/workspace-geometry-service.js";
import { createWorkspaceTestDocument } from "../src/testing.js";

function navigationDocument(): WorkspaceDocument {
  const document = createWorkspaceTestDocument([
    { id: "alpha", title: "Alpha" },
    { id: "beta", title: "Beta" },
    { id: "gamma", title: "Gamma" },
  ]);
  return {
    ...document,
    rootSections: [
      { position: { x: 400, y: 200 }, sectionId: "alpha" },
      { position: { x: -200, y: 200 }, sectionId: "beta" },
      { position: { x: 0, y: -300 }, sectionId: "gamma" },
    ],
  };
}

function canvasController(focused: string[]): WorkspaceCanvasController {
  return {
    clientPointToWorkspace: (point) => point,
    fitSections: vi.fn(async () => ({ x: 12, y: 24, zoom: 0.75 })),
    focusElement: (sectionId) => focused.push(sectionId),
    focusSection: vi.fn(async (sectionId, viewport) => ({
      x: sectionId.length * -10,
      y: sectionId.length * 5,
      zoom: viewport.zoom,
    })),
    waitForViewport: vi.fn(async () => undefined),
    workspacePointToClient: (point) => point,
  };
}

function controllerFixture() {
  let document = navigationDocument();
  const changes: WorkspaceDocumentChange[] = [];
  const focused: string[] = [];
  const canvas = canvasController(focused);
  const controller = createWorkspaceController({
    commit: (nextDocument, change) => {
      document = nextDocument;
      changes.push(change);
    },
    getCapabilities: () => ({
      editLayout: false,
      editPresentation: false,
      editStructure: false,
    }),
    getCanvasController: () => canvas,
    getDocument: () => document,
  });
  return { canvas, changes, controller, document: () => document, focused };
}

describe("workspace geometry navigation controller", () => {
  it("focuses a measured section through one canonical viewport command", async () => {
    const fixture = controllerFixture();

    await expect(fixture.controller.focusSection("alpha")).resolves.toEqual({
      status: "applied",
    });

    expect(fixture.document().viewport).toEqual({ x: -50, y: 25, zoom: 1 });
    expect(fixture.focused).toEqual(["alpha"]);
    expect(fixture.changes).toEqual([{ reason: "viewport" }]);
  });

  it("fits unique section IDs and keeps empty fits as no-ops", async () => {
    const fixture = controllerFixture();

    await expect(
      fixture.controller.fitSections(["alpha", "alpha", "beta"], { padding: 0.2 }),
    ).resolves.toEqual({ status: "applied" });
    await expect(fixture.controller.fitSections([])).resolves.toEqual({ status: "unchanged" });

    expect(fixture.canvas.fitSections).toHaveBeenCalledWith(["alpha", "beta"], {
      padding: 0.2,
    });
    expect(fixture.changes).toHaveLength(1);
  });

  it.each([
    [null, "Workspace fit options must be an object"],
    [{ padding: null }, "Workspace fit padding must be a finite non-negative number"],
    [{ unknown: true }, "Unknown workspace fit option unknown"],
  ])("rejects malformed fit policy %# before measuring geometry", async (options, message) => {
    const controller = createWorkspaceCanvasController({} as WorkspaceGeometryMeasurements, () => ({
      maxZoom: 2,
      minZoom: 0.5,
    }));

    await expect(
      controller.fitSections(["alpha"], options as unknown as { padding?: number }),
    ).rejects.toThrow(message as string);
  });

  it("rejects imperative viewports outside live configured zoom bounds before commit", () => {
    let document = navigationDocument();
    const changes: WorkspaceDocumentChange[] = [];
    let bounds = { maxZoom: 2, minZoom: 0.5 };
    const controller = createWorkspaceController({
      commit: (nextDocument, change) => {
        document = nextDocument;
        changes.push(change);
      },
      getCapabilities: () => ({
        editLayout: true,
        editPresentation: true,
        editStructure: true,
      }),
      getDocument: () => document,
      getViewportBounds: () => bounds,
    });

    expect(() => controller.setViewport({ x: 12, y: 8, zoom: 3 })).toThrow(
      "viewport zoom must be within the configured gesture zoom bounds",
    );
    expect(document.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(changes).toEqual([]);

    bounds = { maxZoom: 4, minZoom: 1 };
    expect(controller.setViewport({ x: 12, y: 8, zoom: 3 })).toEqual({ status: "applied" });
    expect(document.viewport).toEqual({ x: 12, y: 8, zoom: 3 });
  });

  it("uses spatial root order followed by canonical descendants for adjacent focus", async () => {
    const fixture = controllerFixture();

    await fixture.controller.focusNextSection("gamma");
    await fixture.controller.focusPreviousSection("alpha");

    expect(fixture.focused).toEqual(["beta", "beta"]);
  });

  it("fails specifically for unknown sections and an unavailable canvas", async () => {
    const fixture = controllerFixture();
    await expect(fixture.controller.focusSection("missing")).rejects.toMatchObject({
      code: "unknown-section",
    });

    let document = navigationDocument();
    const controller = createWorkspaceController({
      commit: (nextDocument: WorkspaceDocument, _change: WorkspaceDocumentChange) => {
        document = nextDocument;
      },
      getCapabilities: () => ({
        editLayout: true,
        editPresentation: true,
        editStructure: true,
      }),
      getDocument: () => document,
    });
    await expect(controller.fitSection("alpha")).rejects.toThrow(
      "canvas controller is unavailable",
    );
  });
});
