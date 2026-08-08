import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { createEmptyWorkspaceDocument } from "../src/core.js";
import { Workspace, WorkspaceInteractionBoundary, type WorkspaceProps } from "../src/react.js";

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
        readOnly
      >
        <input aria-label="Host content" />
      </Workspace>,
    );

    expect(markup).toContain('data-workspace-mode="controlled"');
    expect(markup).toContain('data-read-only="true"');
    expect(markup).not.toContain("aria-readonly");
    expect(markup).not.toContain("disabled");
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
