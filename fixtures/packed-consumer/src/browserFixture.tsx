import {
  createWorkspaceCodeSection,
  createWorkspaceCodeSectionData,
  createWorkspaceHost,
  createWorkspaceShellViewState,
  createWorkspaceWindowingState,
  MetaControl,
  registerSectionKinds,
  setWorkspaceColorMode,
  WorkspaceCanvas,
  WorkspaceControls,
  WorkspaceProvider,
  WorkspaceShell,
  WorkspaceTooltip,
  WORKSPACE_CODE_SECTION_KIND,
  type WorkspaceDocumentInput,
  type WorkspaceSectionInput,
} from "@riteofstring/setta";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";

function leaf(id: string): WorkspaceSectionInput {
  return {
    id,
    kind: "leaf",
    name: id,
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    overflowMode: false,
    tagColor: null,
    children: [],
  };
}

function interactionDocument(): WorkspaceDocumentInput {
  return {
    sections: {
      "selection-first": leaf("selection-first"),
      "selection-second": leaf("selection-second"),
      "meta-text": { ...leaf("meta-text"), kind: "text-control" },
      "code-editor": {
        ...leaf("code-editor"),
        kind: WORKSPACE_CODE_SECTION_KIND,
        data: createWorkspaceCodeSectionData({
          code: "const message = 'Browser interaction fixture';",
          language: "typescript",
        }),
      },
    },
    topLevelSections: {
      "selection-first": { x: 750, y: 320, w: 200, h: 122, zIndex: 0 },
      "selection-second": { x: 790, y: 405, w: 200, h: 122, zIndex: 1 },
      "meta-text": { x: 1040, y: 40, w: 200, h: 44, zIndex: 2 },
      "code-editor": { x: 400, y: 20, w: 500, h: 120, zIndex: 3 },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: [],
    savedViews: null,
  };
}

function performanceDocument(): WorkspaceDocumentInput {
  const sections: WorkspaceDocumentInput["sections"] = {};
  const topLevelSections: WorkspaceDocumentInput["topLevelSections"] = {};
  for (let row = 0; row < 16; row += 1) {
    for (let column = 0; column < 16; column += 1) {
      const id =
        row === 1 && column === 3
          ? "performance-drag-target"
          : `performance-section-${row}-${column}`;
      sections[id] = leaf(id);
      topLevelSections[id] = {
        x: 45 + column * 270,
        y: 45 + row * 165,
        w: 200,
        h: 122,
        zIndex: row * 16 + column,
      };
    }
  }
  return {
    sections,
    topLevelSections,
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: [],
    savedViews: null,
  };
}

function TextControl({ sectionId }: { sectionId: string }) {
  const [value, setValue] = useState("");
  return (
    <MetaControl
      sectionId={sectionId}
      sectionName="Modifier drag target"
      showSectionTitle={false}
      control={{
        kind: "text",
        controlId: sectionId,
        ariaLabel: "Modifier drag text",
        value,
        onValueChange: setValue,
      }}
    />
  );
}

function InteractionFixture() {
  const [viewState, setViewState] = useState(() => {
    const state = createWorkspaceShellViewState();
    return { ...state, leading: { ...state.leading, visible: false } };
  });
  const [windowingState, setWindowingState] = useState(() =>
    createWorkspaceWindowingState({
      windows: [
        {
          bounds: { height: 320, width: 400, x: 536, y: 150 },
          contentId: "checklist",
          id: "fixture-checklist-window",
          rendererData: null,
          surfaceKind: "checklist",
          title: "Marquee crossing target",
        },
      ],
    }),
  );
  return (
    <main className="browser-interaction-fixture">
      <WorkspaceShell
        ariaLabel="Browser interaction fixture"
        leadingTabs={[]}
        trailingTabs={[]}
        viewState={viewState}
        onViewStateChange={setViewState}
        windowing={{
          state: windowingState,
          onStateChange: setWindowingState,
          renderers: {
            checklist: () => <p>Keep this window open during selection.</p>,
          },
        }}
      />
    </main>
  );
}

function PerformanceFixture() {
  return (
    <main
      className="browser-performance-fixture"
      data-performance-profile="large-document"
      data-performance-section-count={256}
    >
      <header>256-section render, pan, and drag fixture</header>
      <aside>
        <WorkspaceControls />
      </aside>
      <div className="browser-performance-canvas">
        <WorkspaceCanvas />
      </div>
      <WorkspaceTooltip />
    </main>
  );
}

export function mountBrowserFixture(root: HTMLElement, mode: string): void {
  if (mode !== "interactions" && mode !== "performance") {
    throw new Error(`Unknown browser fixture ${mode}.`);
  }
  const host = createWorkspaceHost();
  setWorkspaceColorMode(
    host,
    new URLSearchParams(location.search).get("color-mode") === "dark"
      ? "dark"
      : "light",
  );
  registerSectionKinds(host, {
    leaf: {
      renderContent: (section) => <p>{section.name}</p>,
      defaultSize: { width: 200, height: 122 },
    },
    "text-control": {
      renderContent: (section) => <TextControl sectionId={section.id} />,
      presentation: {
        type: "meta-control",
        resolveControlKind: () => "text",
        onEdit: () => {
          root.querySelector<HTMLElement>('[role="textbox"]')?.focus();
        },
      },
    },
    [WORKSPACE_CODE_SECTION_KIND]: createWorkspaceCodeSection(),
  });
  host.loadDocument(
    mode === "performance" ? performanceDocument() : interactionDocument(),
  );
  createRoot(root).render(
    <StrictMode>
      <WorkspaceProvider host={host}>
        {mode === "performance" ? (
          <PerformanceFixture />
        ) : (
          <InteractionFixture />
        )}
      </WorkspaceProvider>
    </StrictMode>,
  );
}
