import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  createEmptyWorkspaceDocument,
  type WorkspaceDocument,
  type WorkspaceSection,
} from "../src/core.js";
import {
  SortableItemLists,
  SortableItemTree,
  Workspace,
  WorkspaceDetachmentProvider,
  WorkspaceInteractionBoundary,
  type SectionDefinition,
  type SectionRenderProps,
  type WorkspaceProps,
  type WorkspaceToolbarControl,
} from "../src/react.js";
import { createWorkspaceTestDocument } from "../src/testing.js";

function workspaceControlIds(markup: string): readonly string[] {
  return [...markup.matchAll(/data-workspace-control-id="([^"]+)"/gu)].map(
    (match) => match[1] ?? "",
  );
}

function recursiveRenderDocument(): WorkspaceDocument {
  const base = createWorkspaceTestDocument([
    { id: "root", title: "Root container" },
    { id: "first", title: "First child" },
    { id: "nested", title: "Nested row" },
    { id: "deep", title: "Deep child" },
    { id: "empty", title: "Empty container" },
  ]);
  const section = (sectionId: string) => base.sections[sectionId] as WorkspaceSection;
  return {
    ...base,
    rootSections: [{ position: { x: 40, y: 60 }, sectionId: "root" }],
    sections: {
      ...base.sections,
      empty: {
        ...section("empty"),
        childLayout: {
          orientation: "vertical",
          overflow: "grow",
          positioning: "ordered",
          sectionIds: [],
        },
      },
      nested: {
        ...section("nested"),
        childLayout: {
          orientation: "horizontal",
          overflow: "scroll",
          positioning: "ordered",
          sectionIds: ["deep"],
        },
      },
      root: {
        ...section("root"),
        childLayout: {
          orientation: "vertical",
          overflow: "grow",
          positioning: "ordered",
          sectionIds: ["first", "nested", "empty"],
        },
        isMinimized: true,
      },
    },
  };
}

function freeformRenderDocument(): WorkspaceDocument {
  const document = recursiveRenderDocument();
  const root = document.sections.root as WorkspaceSection;
  return {
    ...document,
    sections: {
      ...document.sections,
      root: {
        ...root,
        childLayout: {
          overflow: "grow",
          positioning: "freeform",
          positions: {
            empty: { x: 96, y: 420 },
            first: { x: 16, y: 20 },
            nested: { x: 288, y: 48 },
          },
          sectionIds: ["first", "nested", "empty"],
        },
      },
    },
  };
}

describe("Workspace scaffold", () => {
  it("renders a named section with an empty state", () => {
    const markup = renderToStaticMarkup(
      <Workspace ariaLabel="Planning workspace" emptyState="Start with a section." />,
    );

    expect(markup).toContain('aria-label="Planning workspace"');
    expect(markup).toContain('aria-label="Planning workspace canvas"');
    expect(markup).toContain('data-workspace-grid-visible="true"');
    expect(markup).toContain('data-workspace-external-drop-state="idle"');
    expect(markup).toContain('data-workspace-external-drop-announcement=""');
    expect(markup).toContain('data-workspace-container-layout-announcement=""');
    expect(markup).toContain('data-workspace-container-orientation-announcement=""');
    expect(markup).toContain('data-workspace-creation-announcement=""');
    expect(markup).toContain('data-workspace-history-announcement=""');
    expect(markup).toContain('data-workspace-section-state-announcement=""');
    expect(markup).toContain('data-workspace-sizing-announcement=""');
    expect(markup).toContain('data-workspace-structure-movement-announcement=""');
    expect(markup).toContain('data-workspace-section-move-mode="sort"');
    expect(markup).toContain('data-workspace-interaction-owner="none"');
    expect(markup).toContain('data-workspace-resolved-appearance="light"');
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain("Start with a section.");
    expect(markup).toContain("Control+Shift+Z");
    expect(markup).toContain("Shift+F10 ContextMenu");
  });

  it("exposes strict opt-in viewport culling without changing server-rendered content", () => {
    const document = createWorkspaceTestDocument([{ id: "alpha", title: "Alpha note" }]);
    const definitions = [
      {
        defaultSize: { height: 180, width: 240 },
        displayName: "Host note",
        kind: "test",
        render: () => <span>Server-rendered host body</span>,
      },
    ] satisfies readonly SectionDefinition[];
    const markup = renderToStaticMarkup(
      <Workspace
        defaultDocument={document}
        sectionDefinitions={definitions}
        viewportCullingOptions={{ enabled: true, overscan: 96 }}
      />,
    );

    expect(markup).toContain('data-workspace-viewport-culling="true"');
    expect(markup).toContain('data-workspace-viewport-culling-overscan="96"');
    expect(markup).toContain('data-workspace-culled="false"');
    expect(markup).toContain("Server-rendered host body");
    expect(() =>
      renderToStaticMarkup(
        <Workspace viewportCullingOptions={{ overscan: Number.POSITIVE_INFINITY }} />,
      ),
    ).toThrow("overscan must be a finite non-negative number");
  });

  it("advertises clipboard shortcuts and keeps a pre-rendered announcement when configured", () => {
    const clipboardAdapter = {
      cloneSections: () => ({ allowed: true as const, sections: [] }),
      read: async () => null,
      write: async () => undefined,
    };
    const markup = renderToStaticMarkup(<Workspace clipboardAdapter={clipboardAdapter} />);

    expect(markup).toContain("Control+C Meta+C Control+V Meta+V");
    expect(markup).toContain('data-workspace-clipboard-announcement=""');
    expect(() =>
      renderToStaticMarkup(
        <Workspace
          clipboardAdapter={
            { ...clipboardAdapter, read: null } as unknown as typeof clipboardAdapter
          }
        />,
      ),
    ).toThrow("Workspace clipboard adapter read must be a function");
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

  it("renders a registry-driven creation control and searchable native dialog", () => {
    const definitions = [
      {
        creation: { group: "Basics", keywords: ["memo"] },
        defaultSize: { height: 180, width: 240 },
        displayName: "Host note",
        kind: "note",
        render: () => null,
      },
    ] satisfies readonly SectionDefinition[];
    const markup = renderToStaticMarkup(
      <Workspace
        sectionDefinitions={definitions}
        sectionFactory={() => ({ data: null, id: "note-1" })}
      />,
    );

    expect(markup).toMatch(
      /aria-controls="setta-workspace-creation-[^"]+"[^>]+aria-label="Add section"/u,
    );
    expect(markup).toContain('data-workspace-control-id="add-section"');
    expect(markup).toMatch(/<dialog[^>]+aria-labelledby="[^"]+"/u);
    expect(markup).toContain("Search sections");
    expect(markup).toContain("Host note");
  });

  it("renders registered host content inside an accessible package-owned section frame", () => {
    const document = createWorkspaceTestDocument([{ id: "alpha", title: "Alpha note" }]);
    const Renderer = ({ appearance, data, readOnly, sectionId }: SectionRenderProps) => (
      <label data-appearance={appearance} data-read-only={String(readOnly)}>
        Host field for {sectionId}
        <input defaultValue={String(data)} />
      </label>
    );
    const definitions = [
      {
        creation: { group: "Basics", keywords: ["note"] },
        defaultSize: { height: 180, width: 240 },
        displayName: "Host note",
        kind: "test",
        render: Renderer,
      },
    ] satisfies readonly SectionDefinition[];

    const markup = renderToStaticMarkup(
      <Workspace
        appearanceOptions={{ appearance: "dark" }}
        defaultDocument={document}
        readOnly
        sectionDefinitions={definitions}
      />,
    );

    expect(markup).toContain('data-workspace-section-id="alpha"');
    expect(markup).toMatch(/<article[^>]+aria-labelledby="[^"]+"/u);
    expect(markup).toContain("Alpha note");
    expect(markup).toMatch(/aria-label="Select Alpha note"[^>]+aria-pressed="false"/u);
    expect(markup).toContain('data-workspace-selected="false"');
    expect(markup).toContain('data-workspace-minimap-interactive="true"');
    expect(markup).toContain("Host note");
    expect(markup).toContain("Host field for alpha");
    expect(markup).toContain('data-appearance="dark"');
    expect(markup).toContain('data-read-only="true"');
    expect(markup).toMatch(/<button[^>]+aria-label="Move Alpha note"[^>]+disabled/u);
    expect(markup).toMatch(
      /<button[^>]+aria-label="Lock Alpha note"[^>]+aria-pressed="false"[^>]+disabled/u,
    );
    expect(markup).toMatch(
      /<button[^>]+aria-expanded="true"[^>]+aria-label="Minimize Alpha note"[^>]+disabled/u,
    );
    expect(markup).toMatch(/<button[^>]+aria-label="Rename Alpha note"[^>]+disabled/u);
    expect(markup).toMatch(/<button[^>]+aria-label="Style Alpha note"[^>]+disabled/u);
    expect(markup).toContain("setta-workspace__interaction-boundary");
    expect(markup).toContain('data-workspace-prevent-pan="true"');
    expect(markup).toContain('data-workspace-prevent-wheel="true"');
    expect(markup).toMatch(/setta-workspace__section-content[^>]+tabindex="0"/u);
  });

  it("exposes detachment only through an explicit provider and opt-in definition", () => {
    const document = createWorkspaceTestDocument([{ id: "alpha", title: "Portable note" }]);
    const definitions = [
      {
        defaultSize: { height: 180, width: 240 },
        detachable: true,
        displayName: "Portable host",
        kind: "test",
        render: () => <span>Portable body</span>,
      },
    ] satisfies readonly SectionDefinition[];

    const providerMarkup = renderToStaticMarkup(
      <WorkspaceDetachmentProvider>
        <Workspace defaultDocument={document} sectionDefinitions={definitions} />
      </WorkspaceDetachmentProvider>,
    );
    const unprovidedMarkup = renderToStaticMarkup(
      <Workspace defaultDocument={document} sectionDefinitions={definitions} />,
    );

    expect(providerMarkup).toMatch(
      /aria-label="Open Portable note in a new window"[^>]+aria-pressed="false"/u,
    );
    expect(providerMarkup).toContain('data-workspace-detachment-announcement=""');
    expect(unprovidedMarkup).not.toContain("data-workspace-section-detachment-control");
  });

  it("keeps headerless titles accessible and unmounts minimized host renderers", () => {
    const base = createWorkspaceTestDocument([{ id: "alpha", title: "Quiet note" }]);
    const section = base.sections.alpha as WorkspaceSection;
    const document: WorkspaceDocument = {
      ...base,
      sections: {
        ...base.sections,
        alpha: {
          ...section,
          isMinimized: true,
          presentation: { ...section.presentation, chrome: "none" },
        },
      },
    };
    const definitions = [
      {
        defaultSize: { height: 180, width: 240 },
        displayName: "Quiet host",
        kind: "test",
        render: () => <span>Host body must be absent</span>,
      },
    ] satisfies readonly SectionDefinition[];

    const markup = renderToStaticMarkup(
      <Workspace defaultDocument={document} sectionDefinitions={definitions} />,
    );

    expect(markup).toContain('data-workspace-chrome="none"');
    expect(markup).toContain('data-workspace-minimized="true"');
    expect(markup).toContain("Quiet note");
    expect(markup).toContain("Minimized");
    expect(markup).toContain('aria-label="Move Quiet note"');
    expect(markup).toContain('aria-label="Select Quiet note"');
    expect(markup).toContain('aria-label="Rename Quiet note"');
    expect(markup).toContain('aria-label="Style Quiet note"');
    expect(markup).toMatch(/aria-expanded="false"[^>]+aria-label="Expand Quiet note"/u);
    const contentId = /aria-controls="([^"]+)"[^>]+aria-expanded="false"/u.exec(markup)?.[1];
    expect(contentId).toBeTruthy();
    expect(markup).toContain(`hidden="" id="${String(contentId)}"`);
    expect(markup).toContain('aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"');
    expect(markup).not.toContain("Host body must be absent");
  });

  it("renders ordered descendants recursively beside a minimized host body", () => {
    const markup = renderToStaticMarkup(
      <Workspace
        defaultDocument={recursiveRenderDocument()}
        sectionDefinitions={[
          {
            canContainSections: true,
            defaultSize: { height: 180, width: 240 },
            displayName: "Recursive fixture",
            kind: "test",
            render: ({ sectionId }) => <span>Host body for {sectionId}</span>,
          },
        ]}
      />,
    );

    expect(markup.match(/<article/gu)).toHaveLength(5);
    expect(markup).toContain('data-workspace-section-id="root"');
    expect(markup).toContain('data-workspace-minimize-scope="body"');
    expect(markup).toContain('data-workspace-descendants-collapsed="false"');
    expect(markup).toContain('data-workspace-depth="0"');
    expect(markup).toMatch(
      /data-workspace-section-id="first"[^>]+data-workspace-depth="1"|data-workspace-depth="1"[^>]+data-workspace-section-id="first"/u,
    );
    expect(markup).toContain('data-workspace-parent-section-id="root"');
    expect(markup).toContain('data-workspace-parent-section-id="nested"');
    expect(markup).toContain('aria-label="Root container child sections"');
    expect(markup).toContain('data-workspace-child-orientation="vertical"');
    expect(markup).toContain('data-workspace-child-surface-positioning="ordered"');
    expect(markup).toContain('data-workspace-child-placement="first"');
    expect(markup).toContain('data-workspace-child-placement-positioning="ordered"');
    expect(markup).toContain('aria-label="Nested row child sections"');
    expect(markup).toContain('data-workspace-child-orientation="horizontal"');
    expect(markup).toContain('data-workspace-child-overflow="scroll"');
    expect(markup).toContain('data-workspace-empty-child-container=""');
    expect(markup).toContain("Drop a section here");
    expect(markup).toMatch(
      /aria-label="Scroll Nested row child sections"[^>]+aria-pressed="true"/u,
    );
    expect(markup).toMatch(
      /aria-label="Arrange Nested row child sections vertically"[^>]+data-workspace-next-orientation="vertical"/u,
    );
    expect(markup).toContain('aria-label="Use freeform positioning for Nested row child sections"');
    expect(markup).toMatch(
      /aria-label="Scroll Root container child sections"[^>]+aria-pressed="false"[^>]+disabled/u,
    );
    expect(markup).toMatch(
      /aria-label="Arrange Root container child sections horizontally"[^>]+data-workspace-next-orientation="horizontal"/u,
    );
    expect(markup).toMatch(
      /aria-label="Use freeform positioning for Root container child sections"[^>]+disabled/u,
    );
    expect(markup).not.toContain("Host body for root");
    expect(markup).toContain("Host body for first");
    expect(markup).toContain("Host body for deep");
    expect(markup).toMatch(
      /aria-label="Move First child"[^>]+data-workspace-section-drag-mode="sort"/u,
    );
    expect(markup).not.toMatch(/aria-label="Move First child"[^>]+disabled/u);
  });

  it("renders nested freeform positions through absolute recursive DOM wrappers", () => {
    const markup = renderToStaticMarkup(
      <Workspace
        capabilities={{ editLayout: true, editPresentation: true, editStructure: false }}
        defaultDocument={freeformRenderDocument()}
        sectionDefinitions={[
          {
            canContainSections: true,
            defaultSize: { height: 180, width: 240 },
            displayName: "Recursive fixture",
            kind: "test",
            render: ({ sectionId }) => <span>Host body for {sectionId}</span>,
          },
        ]}
      />,
    );

    expect(markup).toContain('data-workspace-child-positioning="freeform"');
    expect(markup).toContain('data-workspace-child-surface-positioning="freeform"');
    expect(markup).toContain('data-workspace-freeform-child-surface=""');
    expect(markup).toContain('data-workspace-child-placement="first"');
    expect(markup).toContain('data-workspace-child-placement-positioning="freeform"');
    expect(markup).toContain('data-workspace-freeform-child-placement="first"');
    expect(markup).toContain("transform:translate(16px, 20px)");
    expect(markup).toContain('data-workspace-freeform-child-placement="nested"');
    expect(markup).toContain("transform:translate(288px, 48px)");
    expect(markup).toContain(
      "Positioning keeps this section in its current freeform parent. Press Enter or Space to start keyboard movement.",
    );
    expect(markup).toMatch(
      /aria-label="Move First child"[^>]+data-workspace-section-drag-mode="sort"/u,
    );
    expect(markup).not.toMatch(/aria-label="Move First child"[^>]+disabled/u);
    expect(markup).toMatch(/aria-label="Move Deep child"[^>]+disabled/u);
    expect(markup).not.toMatch(
      /data-workspace-section-id="root"[^>]+data-workspace-child-orientation/u,
    );
    expect(markup).not.toContain("Arrange Root container child sections horizontally");
    expect(markup).toContain('aria-label="Change Root container child positioning"');
    expect(markup).toContain("Arrange Nested row child sections vertically");
    expect(markup).toContain('aria-label="Use freeform positioning for Nested row child sections"');
    expect(markup).toMatch(
      /<dialog[^>]+setta-workspace__section-positioning-dialog[^>]+data-workspace-local-shortcuts=""/u,
    );
  });

  it("omits minimize controls for a section kind that opts out", () => {
    const document = createWorkspaceTestDocument([{ id: "alpha", title: "Fixed frame" }]);
    const definitions = [
      {
        defaultSize: { height: 180, width: 240 },
        displayName: "Fixed host",
        kind: "test",
        minimizable: false,
        render: () => null,
      },
    ] satisfies readonly SectionDefinition[];

    const markup = renderToStaticMarkup(
      <Workspace defaultDocument={document} sectionDefinitions={definitions} />,
    );

    expect(markup).toContain('aria-label="Lock Fixed frame"');
    expect(markup).not.toContain('aria-label="Minimize Fixed frame"');
    expect(markup).not.toContain('data-workspace-section-state-control="minimize"');
  });

  it("fails specifically when a document uses an unregistered section kind", () => {
    const document = createWorkspaceTestDocument([{ id: "alpha", title: "Alpha" }]);

    expect(() => renderToStaticMarkup(<Workspace defaultDocument={document} />)).toThrow(
      'section "alpha" uses unregistered kind "test"',
    );
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
    expect(() =>
      renderToStaticMarkup(
        <Workspace
          selectionOptions={{ marqueeMode: "touching" } as unknown as { marqueeMode: "full" }}
        />,
      ),
    ).toThrow("marquee selection mode must be full or partial");
    expect(() =>
      renderToStaticMarkup(<Workspace sectionMoveMode={"reparent" as unknown as "free"} />),
    ).toThrow("section move mode must be sort or free");
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
    const toolbarControlTags = [
      ...markup.matchAll(/<button[^>]+data-workspace-control-id[^>]*>/gu),
    ];
    expect(toolbarControlTags).toHaveLength(9);
    expect(toolbarControlTags.every(([tag]) => !tag.includes("aria-describedby"))).toBe(true);
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

  it("renders scoped accent, tag, and definition icon presentation without replacing state cues", () => {
    const base = createWorkspaceTestDocument([{ id: "alpha", title: "Styled note" }]);
    const section = base.sections.alpha as WorkspaceSection;
    const document: WorkspaceDocument = {
      ...base,
      sections: {
        ...base.sections,
        alpha: {
          ...section,
          presentation: {
            accentColor: "oklch(0.62 0.14 255)",
            chrome: "transparent",
            tagColor: "oklch(0.72 0.11 80)",
          },
        },
      },
    };
    const definitions = [
      {
        creation: { icon: <span data-section-icon="">N</span> },
        defaultSize: { height: 180, width: 240 },
        displayName: "Styled host",
        kind: "test",
        render: () => <span>Host body</span>,
      },
    ] satisfies readonly SectionDefinition[];

    const markup = renderToStaticMarkup(
      <Workspace defaultDocument={document} sectionDefinitions={definitions} />,
    );

    expect(markup).toContain('data-workspace-accent-color="oklch(0.62 0.14 255)"');
    expect(markup).toContain('data-workspace-tag-color="oklch(0.72 0.11 80)"');
    expect(markup).toContain("--setta-workspace-section-accent:oklch(0.62 0.14 255)");
    expect(markup).toContain('data-workspace-chrome="transparent"');
    expect(markup).toContain('data-section-icon=""');
    expect(markup).toContain("Tagged");
    expect(markup).toContain('aria-label="Rename Styled note"');
    expect(markup).toContain('aria-label="Style Styled note"');
    expect(markup).not.toMatch(/aria-label="Rename Styled note"[^>]+disabled/u);
  });

  it("rejects malformed title validation and section color palette props", () => {
    expect(() =>
      renderToStaticMarkup(<Workspace validateSectionTitle={null as unknown as () => null} />),
    ).toThrow("validateSectionTitle must be a function");
    expect(() =>
      renderToStaticMarkup(
        <Workspace
          validateSectionMove={
            null as unknown as NonNullable<WorkspaceProps["validateSectionMove"]>
          }
        />,
      ),
    ).toThrow("validateSectionMove must be a function");
    expect(() =>
      renderToStaticMarkup(
        <Workspace sectionColorPalette={[{ color: "invalid", label: "Broken" }]} />,
      ),
    ).toThrow("color must be a valid CSS color");
    expect(() =>
      renderToStaticMarkup(
        <Workspace groupFactory={null as unknown as NonNullable<WorkspaceProps["groupFactory"]>} />,
      ),
    ).toThrow("groupFactory must be a function");
    expect(() =>
      renderToStaticMarkup(
        <Workspace
          onExternalDrop={"drop" as unknown as NonNullable<WorkspaceProps["onExternalDrop"]>}
        />,
      ),
    ).toThrow("onExternalDrop must be a function");
    expect(() =>
      renderToStaticMarkup(<Workspace validateExternalDrop={() => ({ allowed: true })} />),
    ).toThrow("validateExternalDrop requires onExternalDrop");
  });

  it("keeps the minimap toggle's controlled target mounted while the minimap is hidden", () => {
    const markup = renderToStaticMarkup(<Workspace minimapOptions={{ visible: false }} />);
    const controlsId = /aria-controls="([^"]+)"[^>]+data-workspace-control-id="show-minimap"/u.exec(
      markup,
    )?.[1];

    expect(controlsId).toBeTruthy();
    expect(markup).toContain(`hidden="" id="${String(controlsId)}"`);
    expect(markup).toContain('data-workspace-minimap-interactive="false"');
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

describe("SortableItemTree scaffold", () => {
  const itemTree = {
    childrenByParent: {
      group: ["nested"],
      root: ["name", "group"],
    },
    itemIds: ["name", "group", "nested"],
    rootId: "root",
  } as const;

  it("renders native selection and movement controls around editable host content", () => {
    const markup = renderToStaticMarkup(
      <SortableItemTree
        ariaLabel="Profile fields"
        canContainChildren={(itemId) => itemId === "group"}
        getItemLabel={(itemId) =>
          ({ group: "Preferences", name: "Name", nested: "Theme" })[itemId] ?? itemId
        }
        onMove={() => undefined}
        onSelectedItemIdsChange={() => undefined}
        renderItem={(itemId) =>
          itemId === "group" ? (
            <strong>Preferences</strong>
          ) : (
            <label>
              {itemId}
              <input defaultValue={itemId} />
            </label>
          )
        }
        selectedItemIds={["name"]}
        tree={itemTree}
      />,
    );

    expect(markup).toContain('role="group"');
    expect(markup).toContain('aria-label="Profile fields"');
    expect(markup).toContain('aria-label="Top-level items"');
    expect(markup).toContain('aria-label="Preferences child items"');
    expect(markup).toMatch(/aria-label="Deselect Name"[^>]+aria-pressed="true"/u);
    expect(markup).toContain('aria-label="Move Name"');
    expect(markup).toContain('aria-roledescription="draggable"');
    expect(markup).toContain("logical forward to indent");
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("<input");
    expect(markup).not.toMatch(/aria-label="Move Name"[^>]+disabled/u);
  });

  it("disables movement without removing selection or host input semantics", () => {
    const markup = renderToStaticMarkup(
      <SortableItemTree
        disabled
        onMove={() => undefined}
        onSelectedItemIdsChange={() => undefined}
        renderItem={(itemId) => <input aria-label={`${itemId} value`} />}
        selectedItemIds={[]}
        tree={itemTree}
      />,
    );

    expect(markup).toContain('data-sortable-item-disabled="true"');
    expect(markup).toMatch(/aria-label="Move name"[^>]+disabled/u);
    expect(markup).toContain('aria-label="Select name"');
    expect(markup).toContain('aria-label="name value"');
  });

  it("preserves the single-tree empty-state copy", () => {
    const markup = renderToStaticMarkup(
      <SortableItemTree
        onMove={() => undefined}
        onSelectedItemIdsChange={() => undefined}
        renderItem={() => null}
        selectedItemIds={[]}
        tree={{ childrenByParent: { root: [] }, itemIds: [], rootId: "root" }}
      />,
    );

    expect(markup).toContain(">No items</li>");
    expect(markup).not.toContain("No items in Top-level items");
  });

  it("fails specifically for an invalid accessible label or stale selection", () => {
    expect(() =>
      renderToStaticMarkup(
        <SortableItemTree
          ariaLabel=" "
          onMove={() => undefined}
          onSelectedItemIdsChange={() => undefined}
          renderItem={() => null}
          selectedItemIds={[]}
          tree={itemTree}
        />,
      ),
    ).toThrow("ariaLabel must be a non-empty string");
    expect(() =>
      renderToStaticMarkup(
        <SortableItemTree
          onMove={() => undefined}
          onSelectedItemIdsChange={() => undefined}
          renderItem={() => null}
          selectedItemIds={["missing"]}
          tree={itemTree}
        />,
      ),
    ).toThrow("selectedItemIds must contain only known item IDs");
    expect(() =>
      renderToStaticMarkup(
        <SortableItemTree
          canContainChildren={() => false}
          onMove={() => undefined}
          onSelectedItemIdsChange={() => undefined}
          renderItem={() => null}
          selectedItemIds={[]}
          tree={itemTree}
        />,
      ),
    ).toThrow('item "group" has children but canContainChildren rejected it');
  });

  it("renders multiple named list regions under one movement owner", () => {
    const lists = [
      {
        label: "Required fields",
        listId: "required",
        tree: {
          childrenByParent: { "required-root": ["name"] },
          itemIds: ["name"],
          rootId: "required-root",
        },
      },
      {
        label: "Optional fields",
        listId: "optional",
        tree: {
          childrenByParent: { "optional-root": [] },
          itemIds: [],
          rootId: "optional-root",
        },
      },
    ] as const;
    const markup = renderToStaticMarkup(
      <SortableItemLists
        ariaLabel="Profile field lists"
        getItemLabel={() => "Name"}
        lists={lists}
        onMove={() => undefined}
        onSelectedItemIdsChange={() => undefined}
        renderItem={() => <input aria-label="Name" />}
        selectedItemIds={["name"]}
      />,
    );

    expect(markup).toContain('aria-label="Profile field lists"');
    expect(markup).toContain('data-sortable-item-lists=""');
    expect(markup).toContain('data-sortable-item-list-id="required"');
    expect(markup).toContain('data-sortable-item-list-id="optional"');
    expect(markup).toContain(">Required fields</div>");
    expect(markup).toContain(">Optional fields</div>");
    expect(markup).toContain('aria-label="Required fields"');
    expect(markup).toContain('aria-label="Optional fields"');
    expect(markup).toContain("No items in Optional fields");
    expect(markup).toContain(
      'aria-keyshortcuts="Enter Space ArrowUp ArrowDown ArrowLeft ArrowRight PageUp PageDown Escape"',
    );
    expect(markup).toContain("Page Up or Page Down to move between named lists");
  });

  it("renders an accessible filtered projection while retaining canonical empty-state context", () => {
    const lists = [
      {
        label: "Required fields",
        listId: "required",
        tree: {
          childrenByParent: { group: ["theme"], root: ["name", "email", "group"] },
          itemIds: ["name", "email", "group", "theme"],
          rootId: "root",
        },
      },
      {
        label: "Optional fields",
        listId: "optional",
        tree: {
          childrenByParent: { root: ["notes"] },
          itemIds: ["notes"],
          rootId: "root",
        },
      },
    ] as const;
    const markup = renderToStaticMarkup(
      <SortableItemLists
        canContainChildren={(itemId) => itemId === "group"}
        getItemLabel={(itemId) => itemId}
        lists={lists}
        onMove={() => undefined}
        onSelectedItemIdsChange={() => undefined}
        renderItem={(itemId) => <span>{itemId}</span>}
        selectedItemIds={[]}
        visibleItemIds={["name", "group"]}
      />,
    );

    expect(markup).toContain('data-sortable-item-filtered=""');
    expect(markup).toContain('data-sortable-item-canonical-count="5"');
    expect(markup).toContain('data-sortable-item-visible-count="2"');
    expect(markup).toContain("Filtered view. 2 of 5 items shown.");
    expect(markup).toContain('data-sortable-item-id="name"');
    expect(markup).toContain('data-sortable-item-id="group"');
    expect(markup).not.toContain('data-sortable-item-id="email"');
    expect(markup).not.toContain('data-sortable-item-id="theme"');
    expect(markup).not.toContain('data-sortable-item-id="notes"');
    expect(markup).toContain("No matching child items");
    expect(markup).toContain("No matching items in Optional fields");
  });

  it("rejects hidden selection and ancestry gaps in a filtered React surface", () => {
    expect(() =>
      renderToStaticMarkup(
        <SortableItemTree
          onMove={() => undefined}
          onSelectedItemIdsChange={() => undefined}
          renderItem={() => null}
          selectedItemIds={["nested"]}
          tree={itemTree}
          visibleItemIds={["name", "group"]}
        />,
      ),
    ).toThrow("selectedItemIds must contain only visible item IDs while filtered");
    expect(() =>
      renderToStaticMarkup(
        <SortableItemTree
          onMove={() => undefined}
          onSelectedItemIdsChange={() => undefined}
          renderItem={() => null}
          selectedItemIds={[]}
          tree={itemTree}
          visibleItemIds={["nested"]}
        />,
      ),
    ).toThrow('requires visible ancestor "group"');
  });

  it("fails before rendering inconsistent named-list callbacks or selection", () => {
    const lists = [
      {
        label: "Groups",
        listId: "groups",
        tree: {
          childrenByParent: { group: ["child"], root: ["group"] },
          itemIds: ["group", "child"],
          rootId: "root",
        },
      },
    ] as const;

    expect(() =>
      renderToStaticMarkup(
        <SortableItemLists
          canContainChildren={() => false}
          lists={lists}
          onMove={() => undefined}
          onSelectedItemIdsChange={() => undefined}
          renderItem={() => null}
          selectedItemIds={[]}
        />,
      ),
    ).toThrow('item "group" has children but canContainChildren rejected it');
    expect(() =>
      renderToStaticMarkup(
        <SortableItemLists
          lists={lists}
          onMove={() => undefined}
          onSelectedItemIdsChange={() => undefined}
          renderItem={() => null}
          selectedItemIds={["missing"]}
        />,
      ),
    ).toThrow("selectedItemIds must contain only known item IDs");
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

  it("lets host content opt out of package external-drop handling independently", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceInteractionBoundary preventExternalDrop preventPan={false} preventWheel={false}>
        Host drop surface
      </WorkspaceInteractionBoundary>,
    );

    expect(markup).toContain('data-workspace-prevent-external-drop="true"');
    expect(markup).not.toContain("data-workspace-prevent-pan");
    expect(markup).not.toContain("data-workspace-prevent-wheel");
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
