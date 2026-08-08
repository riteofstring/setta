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
    expect(markup).toContain("Start with a section.");
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
