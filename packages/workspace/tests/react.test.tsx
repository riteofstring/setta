import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { createEmptyWorkspaceDocument } from "../src/core.js";
import {
  Workspace,
  WorkspaceInteractionBoundary,
  type WorkspaceProps,
  type WorkspaceToolbarControl,
} from "../src/react.js";

function workspaceControlIds(markup: string): readonly string[] {
  return [...markup.matchAll(/data-workspace-control-id="([^"]+)"/gu)].map(
    (match) => match[1] ?? "",
  );
}

describe("Workspace scaffold", () => {
  it("renders a named section with an empty state", () => {
    const markup = renderToStaticMarkup(
      <Workspace ariaLabel="Planning workspace" emptyState="Start with a section." />,
    );

    expect(markup).toContain('aria-label="Planning workspace"');
    expect(markup).toContain('aria-label="Planning workspace canvas"');
    expect(markup).toContain('data-workspace-grid-visible="true"');
    expect(markup).toContain('data-workspace-resolved-appearance="light"');
    expect(markup).toContain("Start with a section.");
  });

  it("preserves arbitrary host markup in the empty-state surface", () => {
    const markup = renderToStaticMarkup(
      <Workspace
        emptyState={
          <div data-empty-state="">
            <button type="button">Create first section</button>
          </div>
        }
      />,
    );

    expect(markup).toContain('<div class="setta-workspace__empty"><div data-empty-state="">');
    expect(markup).not.toContain('<p class="setta-workspace__empty">');
  });

  it("fails specifically when the workspace accessible name is blank", () => {
    expect(() => renderToStaticMarkup(<Workspace ariaLabel="   " />)).toThrow(
      "ariaLabel must be a non-empty string",
    );
  });

  it("keeps grid visibility, snapping, and scoped appearance independently configurable", () => {
    const markup = renderToStaticMarkup(
      <Workspace
        appearanceOptions={{
          appearance: "dark",
          dark: { gridColor: "oklch(0.68 0.11 305)" },
        }}
        gridOptions={{ pattern: "cross", snap: true, spacing: [30, 18], visible: false }}
      />,
    );

    expect(markup).toContain('data-workspace-appearance="dark"');
    expect(markup).toContain('data-workspace-resolved-appearance="dark"');
    expect(markup).toContain('data-workspace-grid-pattern="cross"');
    expect(markup).toContain('data-workspace-grid-snap="true"');
    expect(markup).toContain('data-workspace-grid-spacing="30 18"');
    expect(markup).toContain('data-workspace-grid-visible="false"');
    expect(markup).toContain("--setta-workspace-grid-color:oklch(0.68 0.11 305)");
    expect(markup).toContain("color-scheme:dark");
    expect(markup).not.toContain('data-testid="rf__background"');
  });

  it("fails specifically for invalid grid and appearance policy", () => {
    expect(() => renderToStaticMarkup(<Workspace gridOptions={{ spacing: [24, 0] }} />)).toThrow(
      "y spacing must be a positive finite number",
    );
    expect(() =>
      renderToStaticMarkup(<Workspace appearanceOptions={{ dark: { focus: "not-a-color" } }} />),
    ).toThrow("dark theme token focus must be a valid CSS color");
  });

  it("marks controlled and read-only state without applying unsupported ARIA to host content", () => {
    const document = createEmptyWorkspaceDocument();
    const markup = renderToStaticMarkup(
      <Workspace
        ariaLabel="Controlled workspace"
        document={document}
        onDocumentChange={() => undefined}
        overlaySlots={{ canvas: () => <input aria-label="Host content" /> }}
        readOnly
      />,
    );

    expect(markup).toContain('data-workspace-mode="controlled"');
    expect(markup).toContain('data-read-only="true"');
    expect(markup).not.toContain("aria-readonly");
  });

  it("orders built-in and host controls and renders controller-only overlay slots", () => {
    const controllers = new Set<unknown>();
    const renderedPlacements: string[] = [];
    const toolbarControls = [
      {
        icon: <span>P</span>,
        id: "host-project",
        label: "Open project action",
        onPress: () => undefined,
        placement: "project",
        pressed: true,
      },
      {
        disabled: true,
        icon: <span>V</span>,
        id: "host-viewport",
        label: "Run viewport action",
        onPress: () => undefined,
        placement: "viewport",
      },
      {
        icon: <span>U</span>,
        id: "host-utility",
        label: "Open utility action",
        onPress: () => undefined,
        placement: "utility",
      },
    ] satisfies readonly WorkspaceToolbarControl[];
    const overlay = (placement: string) => (controller: unknown) => {
      controllers.add(controller);
      renderedPlacements.push(placement);
      return <span>{placement}</span>;
    };
    const markup = renderToStaticMarkup(
      <Workspace
        ariaLabel="Extension workspace"
        overlaySlots={{
          canvas: overlay("canvas"),
          project: overlay("project"),
          utility: overlay("utility"),
          viewport: overlay("viewport"),
        }}
        toolbarControls={toolbarControls}
      />,
    );

    expect(workspaceControlIds(markup)).toEqual([
      "host-project",
      "zoom-in",
      "zoom-out",
      "reset-zoom",
      "fit-sections",
      "snap-to-grid",
      "host-viewport",
      "host-utility",
      "show-minimap",
    ]);
    expect(markup).toContain('role="toolbar"');
    expect(markup).toContain('aria-label="Extension workspace controls"');
    expect(markup).not.toContain("aria-describedby");
    expect(markup).toMatch(/aria-pressed="true"[^>]+data-workspace-control-id="host-project"/u);
    expect(markup).toMatch(/data-workspace-control-id="host-viewport"[^>]+disabled=""/u);
    expect(markup).toContain('role="img"');
    expect(markup).toContain("Extension workspace minimap");
    for (const placement of ["project", "utility", "viewport"]) {
      expect(markup).toContain(`data-workspace-overlay-placement="${placement}"`);
    }
    expect(renderedPlacements).toEqual(["canvas", "project", "utility", "viewport"]);
    expect(controllers.size).toBe(1);
  });

  it("fails specifically for malformed extension descriptors", () => {
    const duplicateControls = [
      {
        icon: null,
        id: "duplicate",
        label: "Run first action",
        onPress: () => undefined,
        placement: "project",
      },
      {
        icon: null,
        id: "duplicate",
        label: "Run second action",
        onPress: () => undefined,
        placement: "utility",
      },
    ] satisfies readonly WorkspaceToolbarControl[];

    expect(() => renderToStaticMarkup(<Workspace toolbarControls={duplicateControls} />)).toThrow(
      'Duplicate workspace toolbar control id "duplicate"',
    );
    expect(() =>
      renderToStaticMarkup(
        <Workspace
          toolbarControls={
            [
              {
                icon: null,
                id: "zoom-in",
                label: "Replace zoom",
                onPress: () => undefined,
                placement: "viewport",
              },
            ] as readonly WorkspaceToolbarControl[]
          }
        />,
      ),
    ).toThrow('toolbar control id "zoom-in" is reserved');
    expect(() =>
      renderToStaticMarkup(
        <Workspace
          overlaySlots={
            { project: "not a renderer" } as unknown as NonNullable<WorkspaceProps["overlaySlots"]>
          }
        />,
      ),
    ).toThrow("overlay slot project must be a render function");
    expect(() =>
      renderToStaticMarkup(
        <Workspace minimapOptions={{ placement: "center" } as unknown as { placement: "left" }} />,
      ),
    ).toThrow("minimap placement must be left or right");
    expect(() =>
      renderToStaticMarkup(
        <Workspace minimapOptions={{ placement: null } as unknown as { placement: "left" }} />,
      ),
    ).toThrow("minimap placement must be left or right");

    const sparseControls = new Array<WorkspaceToolbarControl>(1);
    expect(() => renderToStaticMarkup(<Workspace toolbarControls={sparseControls} />)).toThrow(
      "toolbar controls must be a dense array without extra fields",
    );

    const accessorControl = {
      icon: null,
      id: "accessor",
      onPress: () => undefined,
      placement: "project",
    } as Record<string, unknown>;
    Object.defineProperty(accessorControl, "label", {
      enumerable: true,
      get: () => {
        throw new Error("The toolbar getter must not run.");
      },
    });
    expect(() =>
      renderToStaticMarkup(
        <Workspace toolbarControls={[accessorControl as unknown as WorkspaceToolbarControl]} />,
      ),
    ).toThrow("workspace toolbar control field label");
  });

  it("keeps the minimap toggle's controlled target mounted while the minimap is hidden", () => {
    const markup = renderToStaticMarkup(<Workspace minimapOptions={{ visible: false }} />);
    const controlsId = /aria-controls="([^"]+)"[^>]+data-workspace-control-id="show-minimap"/u.exec(
      markup,
    )?.[1];

    expect(controlsId).toBeTruthy();
    expect(markup).toContain(`hidden="" id="${String(controlsId)}"`);
    expect(markup).not.toContain('role="img"');
  });

  it("fails clearly when runtime props mix controlled and uncontrolled ownership", () => {
    const document = createEmptyWorkspaceDocument();
    const invalidProps = {
      defaultDocument: document,
      document,
      onDocumentChange: () => undefined,
    } as unknown as WorkspaceProps;

    expect(() => renderToStaticMarkup(<Workspace {...invalidProps} />)).toThrow(
      "cannot receive both document and defaultDocument",
    );
  });

  it("fails clearly when a runtime controlled document has no change handler", () => {
    const invalidProps = {
      document: createEmptyWorkspaceDocument(),
    } as unknown as WorkspaceProps;

    expect(() => renderToStaticMarkup(<Workspace {...invalidProps} />)).toThrow(
      "requires onDocumentChange",
    );
  });

  it("rejects null ownership documents and malformed optional change handlers", () => {
    const nullControlled = {
      document: null,
      onDocumentChange: () => undefined,
    } as unknown as WorkspaceProps;
    const nullUncontrolled = { defaultDocument: null } as unknown as WorkspaceProps;
    const invalidHandler = { onDocumentChange: "notify" } as unknown as WorkspaceProps;

    expect(() => renderToStaticMarkup(<Workspace {...nullControlled} />)).toThrow(
      "expected an object",
    );
    expect(() => renderToStaticMarkup(<Workspace {...nullUncontrolled} />)).toThrow(
      "expected an object",
    );
    expect(() => renderToStaticMarkup(<Workspace {...invalidHandler} />)).toThrow(
      "onDocumentChange must be a function",
    );
  });

  it("uses the configured initial zoom for an empty uncontrolled canvas", () => {
    const markup = renderToStaticMarkup(
      <Workspace gestureOptions={{ initialZoom: 1.5, maxZoom: 2, minZoom: 0.5 }} />,
    );

    expect(markup).toContain("react-flow");
    expect(markup).toContain('data-workspace-mode="uncontrolled"');
  });

  it("fails when a restored viewport is outside the configured gesture bounds", () => {
    const document = {
      ...createEmptyWorkspaceDocument(),
      viewport: { x: 0, y: 0, zoom: 2 },
    };

    expect(() =>
      renderToStaticMarkup(
        <Workspace
          document={document}
          gestureOptions={{ initialZoom: 1, maxZoom: 1.5 }}
          onDocumentChange={() => undefined}
        />,
      ),
    ).toThrow("viewport zoom must be within");
  });
});

describe("WorkspaceInteractionBoundary", () => {
  it("hides internal suppression classes behind observable package markers", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceInteractionBoundary>
        <input aria-label="Host field" />
      </WorkspaceInteractionBoundary>,
    );

    expect(markup).toContain('data-workspace-prevent-pan="true"');
    expect(markup).toContain('data-workspace-prevent-wheel="true"');
    expect(markup).toContain('aria-label="Host field"');
  });

  it("allows either suppression family to remain available independently", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceInteractionBoundary preventPan={false} preventWheel>
        Content
      </WorkspaceInteractionBoundary>,
    );

    expect(markup).not.toContain("data-workspace-prevent-pan");
    expect(markup).toContain('data-workspace-prevent-wheel="true"');
  });
});

const controlledTypeContract: WorkspaceProps = {
  document: createEmptyWorkspaceDocument(),
  onDocumentChange: () => undefined,
};

const uncontrolledTypeContract: WorkspaceProps = {
  defaultDocument: createEmptyWorkspaceDocument(),
};

// @ts-expect-error A controlled workspace must provide its change handler.
const invalidControlledTypeContract: WorkspaceProps = {
  document: createEmptyWorkspaceDocument(),
};

void controlledTypeContract;
void uncontrolledTypeContract;
void invalidControlledTypeContract;
