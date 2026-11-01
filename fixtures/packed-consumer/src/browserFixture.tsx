import {
  createWorkspaceCodeSection,
  createWorkspaceCodeSectionData,
  createWorkspaceHost,
  createWorkspaceShellViewState,
  createWorkspaceWindowingState,
  MetaControl,
  ItemDndContext,
  WorkspaceItemList,
  registerSectionKinds,
  setWorkspaceColorMode,
  WorkspaceCanvas,
  WorkspaceControls,
  WorkspaceProvider,
  WorkspaceShell,
  WorkspaceTooltip,
  WORKSPACE_CODE_SECTION_KIND,
  type WorkspaceCanvasConfiguration,
  type WorkspaceDocumentInput,
  type WorkspaceGraphEdge,
  type WorkspaceGraphPort,
  type WorkspaceSectionInput,
} from "@riteofstring/setta";
import { StrictMode, useMemo, useState } from "react";
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
      "sort-group": {
        ...leaf("sort-group"),
        kind: "group",
        children: ["sort-first", "sort-second", "sort-third"],
      },
      ...Object.fromEntries(
        ["sort-first", "sort-second", "sort-third"].map((id) => [
          id,
          { ...leaf(id), size: { width: 200, height: 72 } },
        ]),
      ),
      "selection-first": leaf("selection-first"),
      "selection-second": leaf("selection-second"),
      "meta-text": { ...leaf("meta-text"), kind: "text-control" },
      parameters: {
        ...leaf("parameters"),
        kind: "parameters",
        itemTree: {
          rootId: "root",
          selectedItemIds: [],
          items: {
            root: { id: "root", children: ["first", "second"] },
            first: {
              id: "first",
              children: [],
              presentation: {
                label: "First",
                labelEditable: false,
                control: {
                  kind: "text",
                  value: "Editable",
                  configuration: {
                    disabled: false,
                    placeholder: null,
                    autocomplete: "off",
                    singleLine: true,
                    wrapLines: false,
                  },
                },
              },
            },
            second: {
              id: "second",
              children: [],
              presentation: {
                label: "Second",
                labelEditable: false,
                control: {
                  kind: "text",
                  value: "Still editable",
                  configuration: {
                    disabled: false,
                    placeholder: null,
                    autocomplete: "off",
                    singleLine: true,
                    wrapLines: false,
                  },
                },
              },
            },
          },
        },
      },
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
      "sort-group": { x: 40, y: 180, w: 280, h: 320, zIndex: 0 },
      "selection-first": { x: 750, y: 320, w: 200, h: 122, zIndex: 0 },
      "selection-second": { x: 790, y: 405, w: 200, h: 122, zIndex: 1 },
      "meta-text": { x: 1040, y: 40, w: 200, h: 44, zIndex: 2 },
      "code-editor": { x: 400, y: 20, w: 500, h: 120, zIndex: 3 },
      parameters: { x: 40, y: 20, w: 300, h: 130, zIndex: 4 },
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

function graphDocument(): WorkspaceDocumentInput {
  const module = (id: string) => ({
    ...leaf(id),
    size: { width: 180, height: 122 },
  });
  return {
    sections: {
      drift: module("drift"),
      chain: {
        ...leaf("chain"),
        kind: "group",
        isHorizontalOrientation: true,
        children: ["filter", "amp"],
      },
      filter: { ...module("filter"), kind: "control-module" },
      amp: module("amp"),
      rack: {
        ...leaf("rack"),
        kind: "group",
        overflowMode: true,
        size: { width: 280, height: 220 },
        children: ["lfo", "env"],
      },
      lfo: module("lfo"),
      env: module("env"),
    },
    topLevelSections: {
      drift: { x: 40, y: 60, w: 180, h: 122, zIndex: 0 },
      chain: { x: 320, y: 40, w: 520, h: 200, zIndex: 1 },
      rack: { x: 600, y: 320, w: 280, h: 220, zIndex: 2 },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: [],
    savedViews: null,
  };
}

const GRAPH_PORTS: ReadonlyArray<WorkspaceGraphPort> = [
  ["drift-out", "drift", "source"],
  ["filter-in", "filter", "target"],
  ["filter-out", "filter", "source"],
  ["amp-in", "amp", "target"],
  ["amp-cv", "amp", "target", 0.8],
  ["env-out", "env", "source"],
].map(([id, sectionId, type, position]) => ({
  family: "audio",
  id: String(id),
  label: String(id),
  position: typeof position === "number" ? position : 0.5,
  sectionId: String(sectionId),
  type: type as WorkspaceGraphPort["type"],
}));

const GRAPH_EDGES: ReadonlyArray<WorkspaceGraphEdge> = [
  ["drift-filter", "drift-out", "filter-in"],
  ["filter-amp", "filter-out", "amp-in"],
  ["drift-amp", "drift-out", "amp-cv"],
  ["env-amp", "env-out", "amp-in"],
].map(([id, source, target]) => {
  const port = (portId: string) => ({
    portId,
    sectionId: GRAPH_PORTS.find((value) => value.id === portId)!.sectionId,
  });
  return {
    family: "audio",
    id: id!,
    source: port(source!),
    target: port(target!),
  };
});

function ControlModule() {
  const [presses, setPresses] = useState(0);
  return (
    <button
      data-presses={presses}
      data-testid="graph-module-control"
      onClick={() => setPresses((value) => value + 1)}
      style={{ width: "100%", height: 48 }}
      type="button"
    >
      Cutoff
    </button>
  );
}

function GraphFixture() {
  const [edges, setEdges] = useState(GRAPH_EDGES);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const canvas = useMemo<WorkspaceCanvasConfiguration>(
    () => ({
      graph: {
        canConnect: () => true,
        edges,
        families: { audio: { color: "#0891b2" } },
        onConnect: (connection) =>
          setEdges((current) => [
            ...current,
            { ...connection, id: `edge-${current.length}` },
          ]),
        onSelectedEdgeIdsChange: setSelectedEdgeIds,
        ports: GRAPH_PORTS,
        selectedEdgeIds,
      },
    }),
    [edges, selectedEdgeIds],
  );
  return (
    <main className="browser-interaction-fixture">
      <WorkspaceCanvas configuration={canvas} />
    </main>
  );
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
  if (mode !== "interactions" && mode !== "performance" && mode !== "graph") {
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
    parameters: {
      renderContent: (section) => (
        <ItemDndContext>
          <WorkspaceItemList
            sectionId={section.id}
            listKey="fixture-parameters"
            topLevelItemIds={section.itemTree!.items.root!.children}
          />
        </ItemDndContext>
      ),
      itemArea: { toolbar: "hidden" },
    },
    "control-module": { renderContent: () => <ControlModule /> },
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
    {
      graph: graphDocument,
      interactions: interactionDocument,
      performance: performanceDocument,
    }[mode](),
  );
  createRoot(root).render(
    <StrictMode>
      <WorkspaceProvider host={host}>
        {
          {
            graph: <GraphFixture />,
            interactions: <InteractionFixture />,
            performance: <PerformanceFixture />,
          }[mode]
        }
      </WorkspaceProvider>
    </StrictMode>,
  );
}
