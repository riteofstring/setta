import {
  createWorkspaceShellViewState,
  DEFAULT_SECTION_TAG_COLOR_PALETTE,
  deleteSelectedWorkspaceItems,
  fitWorkspaceSections,
  insertWorkspaceItem,
  setGroupOverflowMode,
  setSectionTagColor,
  setWorkspaceColorMode,
  setWorkspaceSectionAttention,
  useWorkspaceAppearance,
  useWorkspaceHost,
  type WorkspaceItemDiagnosticRegistry,
  type WorkspaceCanvasConfiguration,
  type WorkspaceGraphEdge,
  type WorkspaceGraphPort,
  type WorkspaceSectionTagColorPalette,
  type WorkspaceShellTabDefinition,
  type WorkspaceShellTabIconProps,
} from "@riteofstring/setta";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  HostShortcutConflictAction,
  PlaygroundMenuActionReadout,
  PlaygroundShortcutList,
  usePlaygroundHostCommandState,
} from "./menuExtensions";
import { playgroundDocument } from "./playgroundDocument";
import {
  PLAYGROUND_INITIAL_ITEM_DIAGNOSTICS,
  PLAYGROUND_UPDATED_ITEM_DIAGNOSTICS,
} from "./sectionKinds";
import { PlaygroundWindowingDemo } from "./PlaygroundWindowingDemo";

type PlaygroundIconProps = {
  className?: string;
};

const PLAYGROUND_EXTERNAL_DROP_TYPE =
  "application/x-setta-workspace-playground";
const PLAYGROUND_ATTENTION_SECTION_IDS = [
  "idle-leaf",
  "locked-leaf",
  "styled-leaf",
] as const;

const PLAYGROUND_GRAPH_PORTS = [
  {
    family: "data",
    id: "idle-data-source",
    label: "Idle leaf data output",
    position: 0.3,
    sectionId: "idle-leaf",
    type: "source",
  },
  {
    family: "data",
    id: "locked-data-target",
    label: "Locked leaf data input",
    position: 0.3,
    sectionId: "locked-leaf",
    type: "target",
  },
  {
    family: "data",
    id: "styled-data-target",
    label: "Styled leaf data input",
    position: 0.3,
    sectionId: "styled-leaf",
    type: "target",
  },
  {
    family: "agentic",
    id: "idle-agentic-source",
    label: "Idle leaf agentic output",
    position: 0.5,
    sectionId: "idle-leaf",
    type: "source",
  },
  {
    family: "agentic",
    id: "locked-agentic-target",
    label: "Locked leaf agentic input",
    position: 0.5,
    sectionId: "locked-leaf",
    type: "target",
  },
  {
    family: "agentic",
    id: "styled-agentic-target",
    label: "Styled leaf agentic input",
    position: 0.5,
    sectionId: "styled-leaf",
    type: "target",
  },
  {
    family: "workflow",
    id: "locked-workflow-source",
    label: "Locked leaf workflow output",
    position: 0.7,
    sectionId: "locked-leaf",
    type: "source",
  },
  {
    family: "workflow",
    id: "idle-workflow-target",
    label: "Idle leaf workflow input",
    position: 0.7,
    sectionId: "idle-leaf",
    type: "target",
  },
  {
    family: "workflow",
    id: "styled-workflow-target",
    label: "Styled leaf workflow input",
    position: 0.7,
    sectionId: "styled-leaf",
    type: "target",
  },
] as const satisfies ReadonlyArray<WorkspaceGraphPort>;

const PLAYGROUND_GRAPH_EDGES = [
  {
    family: "data",
    id: "playground-data-edge",
    label: "data",
    source: { portId: "idle-data-source", sectionId: "idle-leaf" },
    target: { portId: "locked-data-target", sectionId: "locked-leaf" },
  },
  {
    family: "agentic",
    id: "playground-agentic-edge",
    label: "agentic",
    source: { portId: "idle-agentic-source", sectionId: "idle-leaf" },
    status: "running",
    target: { portId: "styled-agentic-target", sectionId: "styled-leaf" },
  },
  {
    family: "workflow",
    id: "playground-workflow-edge",
    label: "workflow",
    source: { portId: "locked-workflow-source", sectionId: "locked-leaf" },
    target: { portId: "styled-workflow-target", sectionId: "styled-leaf" },
  },
] as const satisfies ReadonlyArray<WorkspaceGraphEdge>;

function graphConnectionMatchesEdge(
  connection: Pick<WorkspaceGraphEdge, "family" | "source" | "target">,
  edge: WorkspaceGraphEdge,
): boolean {
  return (
    connection.family === edge.family &&
    connection.source.portId === edge.source.portId &&
    connection.source.sectionId === edge.source.sectionId &&
    connection.target.portId === edge.target.portId &&
    connection.target.sectionId === edge.target.sectionId
  );
}

function AppearanceIcon({ className }: PlaygroundIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 20 20"
    >
      <path d="M10 2.75v1.5M10 15.75v1.5M2.75 10h1.5M15.75 10h1.5M4.87 4.87l1.06 1.06M14.07 14.07l1.06 1.06M15.13 4.87l-1.06 1.06M5.93 14.07l-1.06 1.06" />
      <circle cx="10" cy="10" r="3.25" />
    </svg>
  );
}

function ReloadIcon({ className }: PlaygroundIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 20 20"
    >
      <path d="M15.75 7.25A6.25 6.25 0 1 0 16 11" />
      <path d="M15.75 3.75v3.5h-3.5" />
    </svg>
  );
}

function TuneIcon({ className }: PlaygroundIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 20 20"
    >
      <path d="M3 5.25h8M14 5.25h3M3 10h3M9 10h8M3 14.75h8M14 14.75h3" />
      <circle cx="12.5" cy="5.25" r="1.5" />
      <circle cx="7.5" cy="10" r="1.5" />
      <circle cx="12.5" cy="14.75" r="1.5" />
    </svg>
  );
}

function GuideIcon({ className }: PlaygroundIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 20 20"
    >
      <circle cx="10" cy="10" r="7" />
      <path d="M10 9v4M10 6.5v.25" />
    </svg>
  );
}

function ChevronIcon({ className }: PlaygroundIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 20 20"
    >
      <path d="m6.5 8 3.5 3.5L13.5 8" />
    </svg>
  );
}

function PlaygroundMark() {
  return (
    <span aria-hidden="true" className="playground-mark">
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}

function GroupOverflowModeToggle() {
  const host = useWorkspaceHost();
  return (
    <button
      className="playground-menu-action"
      type="button"
      onClick={() => {
        const group = host.getSnapshot().sections["root-group"];
        if (!group) {
          throw new Error("The playground root group is unavailable.");
        }
        setGroupOverflowMode(host, group.id, !group.overflowMode);
      }}
    >
      <span>Root group overflow</span>
      <span className="playground-menu-action-meta">Toggle</span>
    </button>
  );
}

function SectionTagColorToggle() {
  const host = useWorkspaceHost();
  return (
    <button
      className="playground-menu-action"
      type="button"
      onClick={() => {
        const section = host.getSnapshot().sections["idle-leaf"];
        if (!section) {
          throw new Error("The playground idle leaf is unavailable.");
        }
        setSectionTagColor(
          host,
          section.id,
          section.tagColor === null ? "#0f766e" : null,
        );
      }}
    >
      <span>Idle leaf color tag</span>
      <span className="playground-menu-action-meta">Toggle</span>
    </button>
  );
}

function HostParameterActions() {
  const host = useWorkspaceHost();
  return (
    <>
      <button
        className="playground-menu-action"
        onClick={() => insertWorkspaceItem(host, "item-panel")}
        type="button"
      >
        <span>Add parameter</span>
        <span className="playground-menu-action-meta">Host API</span>
      </button>
      <button
        className="playground-menu-action"
        onClick={() => deleteSelectedWorkspaceItems(host, "item-panel")}
        type="button"
      >
        <span>Delete selected parameter</span>
        <span className="playground-menu-action-meta">Host API</span>
      </button>
    </>
  );
}

function HostParameterDiagnosticActions({
  onClear,
  onShowInitial,
  onShowUpdated,
}: {
  onClear: () => void;
  onShowInitial: () => void;
  onShowUpdated: () => void;
}) {
  return (
    <div aria-label="Parameter diagnostics" role="group">
      <button
        className="playground-menu-action"
        onClick={onShowInitial}
        type="button"
      >
        <span>Show sample diagnostics</span>
        <span className="playground-menu-action-meta">3 severities</span>
      </button>
      <button
        className="playground-menu-action"
        onClick={onShowUpdated}
        type="button"
      >
        <span>Update diagnostics</span>
        <span className="playground-menu-action-meta">Live state</span>
      </button>
      <button
        className="playground-menu-action"
        onClick={onClear}
        type="button"
      >
        <span>Clear diagnostics</span>
        <span className="playground-menu-action-meta">Reset</span>
      </button>
    </div>
  );
}

function DocumentChangeReadout() {
  const host = useWorkspaceHost();
  const [documentChangeCount, setDocumentChangeCount] = useState(0);
  useEffect(() => {
    return host.subscribe(() => {
      setDocumentChangeCount((count) => count + 1);
    });
  }, [host]);
  return (
    <span
      aria-label={`${documentChangeCount} document ${documentChangeCount === 1 ? "change" : "changes"} reported`}
      className="playground-change-status"
      role="status"
    >
      <span aria-hidden="true" className="playground-change-status-dot" />
      <span className="playground-change-status-count">
        {documentChangeCount}
      </span>
      <span aria-hidden="true" className="playground-change-status-label">
        changes
      </span>
    </span>
  );
}

function AppearanceToggle({ darkMode }: { darkMode: boolean }) {
  const host = useWorkspaceHost();
  return (
    <button
      className="playground-toolbar-button"
      onClick={() => setWorkspaceColorMode(host, darkMode ? "light" : "dark")}
      title={`Switch to ${darkMode ? "light" : "dark"} mode`}
      type="button"
    >
      <AppearanceIcon className="playground-toolbar-icon" />
      <span className="playground-toolbar-label">
        {darkMode ? "Light mode" : "Dark mode"}
      </span>
    </button>
  );
}

function ReloadDocumentButton() {
  const host = useWorkspaceHost();
  return (
    <button
      className="playground-toolbar-button"
      onClick={() => host.loadDocument(playgroundDocument)}
      title="Reload the playground document"
      type="button"
    >
      <ReloadIcon className="playground-toolbar-icon" />
      <span className="playground-toolbar-label">Reload</span>
    </button>
  );
}

function PlaygroundCanvasActions({
  onRestoreGraph,
  onStatusChange,
  status,
}: {
  onRestoreGraph: () => void;
  onStatusChange: (status: string) => void;
  status: string;
}) {
  const host = useWorkspaceHost();

  return (
    <div aria-label="Canvas feature fixtures" role="group">
      <button
        className="playground-menu-action"
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "copy";
          event.dataTransfer.setData(
            PLAYGROUND_EXTERNAL_DROP_TYPE,
            "Playground canvas payload",
          );
        }}
        type="button"
      >
        <span>Drag sample onto canvas</span>
        <span className="playground-menu-action-meta">External drop</span>
      </button>
      <button
        className="playground-menu-action"
        onClick={() => {
          try {
            void fitWorkspaceSections(host, PLAYGROUND_ATTENTION_SECTION_IDS);
            setWorkspaceSectionAttention(
              host,
              PLAYGROUND_ATTENTION_SECTION_IDS,
            );
            onStatusChange("Fit and highlighted the three graph sections.");
          } catch (error) {
            onStatusChange(
              error instanceof Error
                ? error.message
                : "The graph sections could not be highlighted.",
            );
          }
        }}
        type="button"
      >
        <span>Fit and highlight graph</span>
        <span className="playground-menu-action-meta">Attention</span>
      </button>
      <button
        className="playground-menu-action"
        onClick={() => {
          setWorkspaceSectionAttention(host, []);
          onStatusChange("Cleared graph attention with the 650ms linger.");
        }}
        type="button"
      >
        <span>Clear graph highlight</span>
        <span className="playground-menu-action-meta">650 ms linger</span>
      </button>
      <button
        className="playground-menu-action"
        onClick={onRestoreGraph}
        type="button"
      >
        <span>Restore sample edges</span>
        <span className="playground-menu-action-meta">Controlled graph</span>
      </button>
      <p aria-live="polite" className="playground-host-action-status">
        {status}
      </p>
    </div>
  );
}

function PlaygroundActionMenu({
  canvasStatus,
  leadingPaneShiftsCanvas,
  onClearDiagnostics,
  onCanvasStatusChange,
  onRestoreGraph,
  onToggleLeadingPaneShift,
  onShowDiagnostics,
  onUpdateDiagnostics,
}: {
  canvasStatus: string;
  leadingPaneShiftsCanvas: boolean;
  onClearDiagnostics: () => void;
  onCanvasStatusChange: (status: string) => void;
  onRestoreGraph: () => void;
  onToggleLeadingPaneShift: () => void;
  onShowDiagnostics: () => void;
  onUpdateDiagnostics: () => void;
}) {
  return (
    <details className="playground-menu" name="playground-toolbar-menu">
      <summary className="playground-toolbar-button" title="Open test actions">
        <TuneIcon className="playground-toolbar-icon" />
        <span className="playground-toolbar-label">Test actions</span>
        <ChevronIcon className="playground-toolbar-chevron" />
      </summary>
      <div className="playground-menu-panel playground-actions-panel">
        <div className="playground-menu-heading">
          <strong>Test actions</strong>
          <span>Host-side acceptance fixtures</span>
        </div>
        <section className="playground-menu-group">
          <h2>Sections</h2>
          <GroupOverflowModeToggle />
          <SectionTagColorToggle />
        </section>
        <section className="playground-menu-group">
          <h2>Canvas</h2>
          <PlaygroundCanvasActions
            onRestoreGraph={onRestoreGraph}
            onStatusChange={onCanvasStatusChange}
            status={canvasStatus}
          />
        </section>
        <section className="playground-menu-group">
          <h2>Shell</h2>
          <button
            aria-pressed={leadingPaneShiftsCanvas}
            className="playground-menu-action"
            onClick={onToggleLeadingPaneShift}
            type="button"
          >
            <span>Leading pane shifts canvas</span>
            <span className="playground-menu-action-meta">
              {leadingPaneShiftsCanvas ? "On" : "Off"}
            </span>
          </button>
        </section>
        <section className="playground-menu-group">
          <h2>Parameters</h2>
          <HostParameterActions />
        </section>
        <section className="playground-menu-group">
          <h2>Shortcuts</h2>
          <HostShortcutConflictAction />
        </section>
        <section className="playground-menu-group">
          <h2>Diagnostics</h2>
          <HostParameterDiagnosticActions
            onClear={onClearDiagnostics}
            onShowInitial={onShowDiagnostics}
            onShowUpdated={onUpdateDiagnostics}
          />
        </section>
      </div>
    </details>
  );
}

function PlaygroundGuideMenu() {
  return (
    <details className="playground-menu" name="playground-toolbar-menu">
      <summary
        className="playground-toolbar-button"
        title="Open playground guide"
      >
        <GuideIcon className="playground-toolbar-icon" />
        <span className="playground-toolbar-label">Guide</span>
        <ChevronIcon className="playground-toolbar-chevron" />
      </summary>
      <div className="playground-menu-panel playground-guide-panel">
        <div className="playground-menu-heading">
          <strong>Quick guide</strong>
          <span>Useful gestures and shortcuts</span>
        </div>
        <dl className="playground-guide-list">
          <div>
            <dt>Canvas</dt>
            <dd>Drag empty space to pan. Press F to fit the workspace.</dd>
          </div>
          <div>
            <dt>Sections</dt>
            <dd>
              Drag a surface to move it. Hold Alt while dragging to nest it.
            </dd>
          </div>
          <div>
            <dt>Structural history</dt>
            <dd>
              Change section structure, then press Cmd/Ctrl+Z to undo and
              Cmd/Ctrl+Shift+Z to redo.
            </dd>
          </div>
          <div>
            <dt>Parameters</dt>
            <dd>
              Hold Cmd/Ctrl+Shift and click rows. Use Alt+Arrow to move or Tab
              to indent.
            </dd>
          </div>
          <div>
            <dt>Menus</dt>
            <dd>Right-click, or use Shift+F10 from the keyboard.</dd>
          </div>
          <div>
            <dt>Toolbar</dt>
            <dd>
              Add a note or use Auto Layout above the zoom group. Other host
              controls sit below it.
            </dd>
          </div>
          <div>
            <dt>Control help</dt>
            <dd>Hold Q while hovering a parameter control.</dd>
          </div>
        </dl>
        <div className="playground-menu-heading">
          <strong>Workspace shortcuts</strong>
          <span>Chords for this platform</span>
        </div>
        <PlaygroundShortcutList />
        <p className="playground-host-action-status">
          <PlaygroundMenuActionReadout />
        </p>
      </div>
    </details>
  );
}

function HostNotesIcon({
  className,
  ...iconProps
}: WorkspaceShellTabIconProps) {
  return (
    <svg
      {...iconProps}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      viewBox="0 0 16 16"
    >
      <path d="M3 2.5h10v11H3z" />
      <path d="M5.5 6h5M5.5 9h5" />
    </svg>
  );
}

function HostStatusIcon({
  className,
  ...iconProps
}: WorkspaceShellTabIconProps) {
  return (
    <svg
      {...iconProps}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      viewBox="0 0 16 16"
    >
      <circle cx="8" cy="8" r="5.5" />
      <path d="m5.5 8 1.7 1.7 3.6-3.8" />
    </svg>
  );
}

const leadingTabs: ReadonlyArray<WorkspaceShellTabDefinition> = [
  {
    id: "host-notes",
    label: "Host notes",
    icon: HostNotesIcon,
    renderContent: () => (
      <div className="playground-host-pane">
        <p>
          This pane is registered and rendered by the backend-free playground
          host.
        </p>
        <p>
          The package owns its rail, sizing, focus, and interaction behavior.
        </p>
      </div>
    ),
  },
  {
    id: "host-guide",
    label: "Host guide",
    icon: HostStatusIcon,
    renderContent: ({ closePane }) => (
      <div className="playground-host-pane">
        <p>Use Arrow keys, Home, and End to move between registered tabs.</p>
        <button
          className="playground-pane-action"
          onClick={closePane}
          type="button"
        >
          Close pane
        </button>
      </div>
    ),
  },
];

const baseTrailingTabs: ReadonlyArray<WorkspaceShellTabDefinition> = [
  {
    id: "host-status",
    label: "Host status",
    icon: HostStatusIcon,
    renderContent: () => (
      <div className="playground-host-pane">
        <p>The host controls and may serialize the complete pane view state.</p>
        <p>
          This content receives only the shell&apos;s documented public render
          props.
        </p>
      </div>
    ),
  },
  {
    id: "host-help",
    label: "Host help",
    icon: HostNotesIcon,
    renderContent: () => (
      <div className="playground-host-pane">
        <p>Drag the pane seam or focus it and use Arrow, Home, and End.</p>
      </div>
    ),
  },
];

const sectionTagColorPalette = [
  ...DEFAULT_SECTION_TAG_COLOR_PALETTE,
  { color: "#0f766e", description: "Host teal" },
] satisfies WorkspaceSectionTagColorPalette;

export function App() {
  const darkMode = useWorkspaceAppearance((state) => state.darkMode);
  const nextGraphEdgeNumber = useRef(1);

  usePlaygroundHostCommandState();
  const [shellViewState, setShellViewState] = useState(() =>
    createWorkspaceShellViewState(),
  );
  const [leadingPaneShiftsCanvas, setLeadingPaneShiftsCanvas] = useState(true);
  const [itemDiagnostics, setItemDiagnostics] =
    useState<WorkspaceItemDiagnosticRegistry>(
      PLAYGROUND_INITIAL_ITEM_DIAGNOSTICS,
    );
  const [graphEdges, setGraphEdges] = useState<
    ReadonlyArray<WorkspaceGraphEdge>
  >(() => [...PLAYGROUND_GRAPH_EDGES]);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [canvasStatus, setCanvasStatus] = useState(
    "Graph, attention, and external drop are ready.",
  );

  const canvas = useMemo<WorkspaceCanvasConfiguration>(
    () => ({
      externalDrop: {
        canDrop: (dataTransfer) =>
          Array.from(dataTransfer.types).includes(
            PLAYGROUND_EXTERNAL_DROP_TYPE,
          ),
        onDrop: (dataTransfer, position) => {
          const label =
            dataTransfer.getData(PLAYGROUND_EXTERNAL_DROP_TYPE) ||
            "Playground payload";
          setCanvasStatus(
            `${label} dropped at ${Math.round(position.x)}, ${Math.round(position.y)}.`,
          );
        },
      },
      graph: {
        canConnect: (connection) =>
          connection.source.sectionId !== connection.target.sectionId &&
          !graphEdges.some((edge) =>
            graphConnectionMatchesEdge(connection, edge),
          ),
        edges: graphEdges,
        onConnect: (connection) => {
          const id = `playground-created-edge-${nextGraphEdgeNumber.current}`;
          nextGraphEdgeNumber.current += 1;
          setGraphEdges((current) => [...current, { ...connection, id }]);
          setCanvasStatus(`Created ${connection.family} edge ${id}.`);
        },
        onDelete: (edgeIds) => {
          const deletedIds = new Set(edgeIds);
          setGraphEdges((current) =>
            current.filter((edge) => !deletedIds.has(edge.id)),
          );
          setSelectedEdgeIds(new Set());
          setCanvasStatus(`Deleted ${edgeIds.length} selected edge(s).`);
        },
        onReconnect: ({ connection, edgeId }) => {
          setGraphEdges((current) =>
            current.map((edge) =>
              edge.id === edgeId
                ? { ...edge, ...connection, id: edgeId }
                : edge,
            ),
          );
          setCanvasStatus(`Reconnected ${edgeId}.`);
        },
        onSelectedEdgeIdsChange: (edgeIds) => {
          setSelectedEdgeIds(new Set(edgeIds));
        },
        ports: PLAYGROUND_GRAPH_PORTS,
        selectedEdgeIds,
      },
    }),
    [graphEdges, selectedEdgeIds],
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  return (
    <main className="playground-shell">
      <header className="playground-header">
        <div className="playground-brand" translate="no">
          <PlaygroundMark />
          <div className="playground-brand-copy">
            <span>@riteofstring/setta</span>
            <h1>Workspace playground</h1>
          </div>
        </div>
        <nav aria-label="Playground controls" className="playground-toolbar">
          <DocumentChangeReadout />
          <span aria-hidden="true" className="playground-toolbar-divider" />
          <AppearanceToggle darkMode={darkMode} />
          <ReloadDocumentButton />
          <PlaygroundActionMenu
            canvasStatus={canvasStatus}
            leadingPaneShiftsCanvas={leadingPaneShiftsCanvas}
            onCanvasStatusChange={setCanvasStatus}
            onClearDiagnostics={() => setItemDiagnostics({})}
            onRestoreGraph={() => {
              setGraphEdges([...PLAYGROUND_GRAPH_EDGES]);
              setSelectedEdgeIds(new Set());
              setCanvasStatus("Restored the three reference graph edges.");
            }}
            onToggleLeadingPaneShift={() =>
              setLeadingPaneShiftsCanvas((enabled) => !enabled)
            }
            onShowDiagnostics={() =>
              setItemDiagnostics(PLAYGROUND_INITIAL_ITEM_DIAGNOSTICS)
            }
            onUpdateDiagnostics={() =>
              setItemDiagnostics(PLAYGROUND_UPDATED_ITEM_DIAGNOSTICS)
            }
          />
          <PlaygroundGuideMenu />
        </nav>
      </header>
      <PlaygroundWindowingDemo
        baseTrailingTabs={baseTrailingTabs}
        canvas={canvas}
        itemDiagnostics={itemDiagnostics}
        leadingPaneShiftsCanvas={leadingPaneShiftsCanvas}
        leadingTabs={leadingTabs}
        onShellViewStateChange={setShellViewState}
        sectionTagColorPalette={sectionTagColorPalette}
        shellViewState={shellViewState}
      />
    </main>
  );
}
