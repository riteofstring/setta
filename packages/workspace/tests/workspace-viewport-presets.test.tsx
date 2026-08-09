import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  parseWorkspaceViewportPresets,
  serializeWorkspaceViewportPresets,
  validateWorkspaceViewportPresets,
  WORKSPACE_VIEWPORT_PRESETS_SCHEMA_VERSION,
  type WorkspaceViewportPreset,
} from "../src/core.js";
import { WorkspaceViewportPresets } from "../src/react.js";
import { createWorkspaceTestDocument, WorkspaceInMemoryHost } from "../src/testing.js";

function viewportPresets(): readonly WorkspaceViewportPreset[] {
  return [
    { id: "overview", name: "Overview", viewport: { x: 0, y: 0, zoom: 1 } },
    { id: "details", name: "Detail review", viewport: { x: -84.5, y: 42, zoom: 1.5 } },
  ];
}

describe("workspace viewport presets", () => {
  it("round-trips a versioned, ordered, immutable host preference payload", () => {
    const presets = viewportPresets();
    const serialized = serializeWorkspaceViewportPresets(presets);

    expect(JSON.parse(serialized)).toEqual({
      presets,
      schemaVersion: WORKSPACE_VIEWPORT_PRESETS_SCHEMA_VERSION,
    });
    const parsed = parseWorkspaceViewportPresets(serialized);
    expect(parsed).toEqual(presets);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(
      parsed.every((preset) => Object.isFrozen(preset) && Object.isFrozen(preset.viewport)),
    ).toBe(true);
  });

  it("rejects malformed arrays, fields, IDs, names, and viewports specifically", () => {
    expect(() => validateWorkspaceViewportPresets(Array(1))).toThrow(
      "Workspace viewport presets must be a dense array without extra fields",
    );
    expect(() =>
      validateWorkspaceViewportPresets([{ ...viewportPresets()[0], extra: true }]),
    ).toThrow("Unknown workspace viewport preset field extra");
    expect(() =>
      validateWorkspaceViewportPresets([
        viewportPresets()[0],
        { ...viewportPresets()[1], id: "overview" },
      ]),
    ).toThrow('Workspace viewport preset id "overview" is duplicated');
    expect(() =>
      validateWorkspaceViewportPresets([{ ...viewportPresets()[0], name: " " }]),
    ).toThrow("name must be a non-empty string");
    expect(() =>
      validateWorkspaceViewportPresets([{ ...viewportPresets()[0], name: " Overview" }]),
    ).toThrow("name must not start or end with whitespace");
    expect(() =>
      validateWorkspaceViewportPresets([
        { ...viewportPresets()[0], viewport: { x: 0, y: 0, zoom: 11 } },
      ]),
    ).toThrow("expected a zoom from 0.1 through 10");
  });

  it("rejects accessor-backed preset data without evaluating it", () => {
    let nameRead = false;
    const preset = Object.defineProperty(
      { id: "unsafe", viewport: { x: 0, y: 0, zoom: 1 } },
      "name",
      {
        enumerable: true,
        get: () => {
          nameRead = true;
          return "Unsafe";
        },
      },
    );

    expect(() => validateWorkspaceViewportPresets([preset])).toThrow(
      "Unknown workspace viewport preset field name",
    );
    expect(nameRead).toBe(false);
  });

  it("rejects malformed serialized envelopes without accepting unknown versions or fields", () => {
    expect(() => parseWorkspaceViewportPresets("{")).toThrow(
      "Workspace viewport presets must contain valid JSON",
    );
    expect(() => parseWorkspaceViewportPresets("[]")).toThrow(
      "Workspace viewport preset payload must be an object",
    );
    expect(() =>
      parseWorkspaceViewportPresets(JSON.stringify({ presets: [], schemaVersion: 2 })),
    ).toThrow("unsupported schema version");
    expect(() =>
      parseWorkspaceViewportPresets(JSON.stringify({ extra: true, presets: [], schemaVersion: 1 })),
    ).toThrow("Unknown workspace viewport preset payload field extra");
  });

  it("renders native save, restore, rename, and delete controls with a pre-mounted status", () => {
    const host = new WorkspaceInMemoryHost(createWorkspaceTestDocument([]));
    const markup = renderToStaticMarkup(
      <WorkspaceViewportPresets
        ariaLabel="Review views"
        controller={host.controller}
        heading="Views"
        onCreatePreset={vi.fn()}
        onDeletePreset={vi.fn()}
        onRenamePreset={vi.fn()}
        presets={viewportPresets()}
      />,
    );

    expect(markup).toContain('<section aria-label="Review views"');
    expect(markup).toContain("Views");
    expect(markup).toContain('aria-label="Save current view"');
    expect(markup).toContain("View name");
    expect(markup).toContain('data-workspace-viewport-presets-announcement=""');
    expect(markup).toContain('aria-label="Restore Overview"');
    expect(markup).toContain('aria-label="Rename Detail review"');
    expect(markup).toContain('aria-label="Delete Detail review"');
    expect(markup).toContain("150% · x -84.5 · y 42");
  });

  it("supports restore-only hosts and rejects malformed public labels and presets", () => {
    const host = new WorkspaceInMemoryHost(createWorkspaceTestDocument([]));
    const markup = renderToStaticMarkup(
      <WorkspaceViewportPresets controller={host.controller} presets={viewportPresets()} />,
    );
    expect(markup).not.toContain("Save current view");
    expect(markup).not.toContain("Rename Overview");
    expect(markup).not.toContain("Delete Overview");
    expect(markup).toContain("Restore Overview");

    expect(() =>
      renderToStaticMarkup(
        <WorkspaceViewportPresets ariaLabel=" " controller={host.controller} presets={[]} />,
      ),
    ).toThrow("Workspace viewport presets ariaLabel must be a non-empty string");
    expect(() =>
      renderToStaticMarkup(
        <WorkspaceViewportPresets
          controller={host.controller}
          presets={[{ id: "bad", name: "Bad", viewport: { x: 0, y: 0, zoom: Infinity } }]}
        />,
      ),
    ).toThrow("expected a finite number");
  });
});
