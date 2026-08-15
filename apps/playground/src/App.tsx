import {
  createWorkspaceShellViewState,
  DEFAULT_SECTION_TAG_COLOR_PALETTE,
  deleteSelectedWorkspaceItems,
  getWorkspaceDocument,
  insertWorkspaceItem,
  loadWorkspaceDocument,
  setGroupOverflowMode,
  setSectionTagColor,
  setWorkspaceColorMode,
  setWorkspaceDocumentChangeCallback,
  useWorkspaceAppearance,
  WorkspaceShell,
  type WorkspaceItemDiagnosticRegistry,
  type WorkspaceSectionTagColorPalette,
  type WorkspaceShellTabDefinition,
  type WorkspaceShellTabIconProps,
} from "@setta/workspace";
import { useEffect, useState } from "react";
import { PlaygroundMenuActionReadout } from "./menuExtensions";
import { playgroundDocument } from "./playgroundDocument";
import {
  PLAYGROUND_INITIAL_ITEM_DIAGNOSTICS,
  PLAYGROUND_UPDATED_ITEM_DIAGNOSTICS,
  PlaygroundItemDiagnosticsProvider,
} from "./sectionKinds";

function toggleDarkMode() {
  const next = !useWorkspaceAppearance.getState().darkMode;
  setWorkspaceColorMode(next ? "dark" : "light");
}

type PlaygroundIconProps = {
  className?: string;
};

function AppearanceIcon({ className }: PlaygroundIconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 20 20">
      <path d="M10 2.75v1.5M10 15.75v1.5M2.75 10h1.5M15.75 10h1.5M4.87 4.87l1.06 1.06M14.07 14.07l1.06 1.06M15.13 4.87l-1.06 1.06M5.93 14.07l-1.06 1.06" />
      <circle cx="10" cy="10" r="3.25" />
    </svg>
  );
}

function ReloadIcon({ className }: PlaygroundIconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 20 20">
      <path d="M15.75 7.25A6.25 6.25 0 1 0 16 11" />
      <path d="M15.75 3.75v3.5h-3.5" />
    </svg>
  );
}

function TuneIcon({ className }: PlaygroundIconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 20 20">
      <path d="M3 5.25h8M14 5.25h3M3 10h3M9 10h8M3 14.75h8M14 14.75h3" />
      <circle cx="12.5" cy="5.25" r="1.5" />
      <circle cx="7.5" cy="10" r="1.5" />
      <circle cx="12.5" cy="14.75" r="1.5" />
    </svg>
  );
}

function GuideIcon({ className }: PlaygroundIconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 20 20">
      <circle cx="10" cy="10" r="7" />
      <path d="M10 9v4M10 6.5v.25" />
    </svg>
  );
}

function ChevronIcon({ className }: PlaygroundIconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 20 20">
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

// The host side of the document-change callback: every package-initiated canonical commit
// (selection, move, resize, rename, flag toggles, delete, layout, viewport) invokes the
// callback with the serializable document; a host re-load never does. The count lives in its
// own component so per-frame viewport notifications re-render this readout, not the canvas.
function GroupOverflowModeToggle() {
  return (
    <button
      className="playground-menu-action"
      type="button"
      onClick={() => {
        const group = getWorkspaceDocument().sections["root-group"];
        if (!group) {
          throw new Error("The playground root group is unavailable.");
        }
        setGroupOverflowMode(group.id, !group.overflowMode);
      }}
    >
      <span>Root group overflow</span>
      <span className="playground-menu-action-meta">Toggle</span>
    </button>
  );
}

function SectionTagColorToggle() {
  return (
    <button
      className="playground-menu-action"
      type="button"
      onClick={() => {
        const section = getWorkspaceDocument().sections["idle-leaf"];
        if (!section) {
          throw new Error("The playground idle leaf is unavailable.");
        }
        setSectionTagColor(section.id, section.tagColor === null ? "#0f766e" : null);
      }}
    >
      <span>Idle leaf color tag</span>
      <span className="playground-menu-action-meta">Toggle</span>
    </button>
  );
}

function HostParameterActions() {
  return (
    <>
      <button
        className="playground-menu-action"
        onClick={() => insertWorkspaceItem("item-panel")}
        type="button"
      >
        <span>Add parameter</span>
        <span className="playground-menu-action-meta">Host API</span>
      </button>
      <button
        className="playground-menu-action"
        onClick={() => deleteSelectedWorkspaceItems("item-panel")}
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
      <button className="playground-menu-action" onClick={onShowInitial} type="button">
        <span>Show sample diagnostics</span>
        <span className="playground-menu-action-meta">3 severities</span>
      </button>
      <button className="playground-menu-action" onClick={onShowUpdated} type="button">
        <span>Update diagnostics</span>
        <span className="playground-menu-action-meta">Live state</span>
      </button>
      <button className="playground-menu-action" onClick={onClear} type="button">
        <span>Clear diagnostics</span>
        <span className="playground-menu-action-meta">Reset</span>
      </button>
    </div>
  );
}

function DocumentChangeReadout() {
  const [documentChangeCount, setDocumentChangeCount] = useState(0);
  useEffect(() => {
    setWorkspaceDocumentChangeCallback(() => {
      setDocumentChangeCount((count) => count + 1);
    });
    return () => setWorkspaceDocumentChangeCallback(null);
  }, []);
  return (
    <span
      aria-label={`${documentChangeCount} document ${documentChangeCount === 1 ? "change" : "changes"} reported`}
      className="playground-change-status"
      role="status"
    >
      <span aria-hidden="true" className="playground-change-status-dot" />
      <span className="playground-change-status-count">{documentChangeCount}</span>
      <span aria-hidden="true" className="playground-change-status-label">
        changes
      </span>
    </span>
  );
}

function AppearanceToggle({ darkMode }: { darkMode: boolean }) {
  return (
    <button
      className="playground-toolbar-button"
      onClick={toggleDarkMode}
      title={`Switch to ${darkMode ? "light" : "dark"} mode`}
      type="button"
    >
      <AppearanceIcon className="playground-toolbar-icon" />
      <span className="playground-toolbar-label">{darkMode ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}

function ReloadDocumentButton() {
  return (
    <button
      className="playground-toolbar-button"
      onClick={() => loadWorkspaceDocument(playgroundDocument)}
      title="Reload the playground document"
      type="button"
    >
      <ReloadIcon className="playground-toolbar-icon" />
      <span className="playground-toolbar-label">Reload</span>
    </button>
  );
}

function PlaygroundActionMenu({
  onClearDiagnostics,
  onShowDiagnostics,
  onUpdateDiagnostics,
}: {
  onClearDiagnostics: () => void;
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
          <h2>Parameters</h2>
          <HostParameterActions />
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
      <summary className="playground-toolbar-button" title="Open playground guide">
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
            <dd>Drag a surface to move it. Hold Alt while dragging to nest it.</dd>
          </div>
          <div>
            <dt>Parameters</dt>
            <dd>Hold Cmd/Ctrl+Shift and click rows. Use Alt+Arrow to move or Tab to indent.</dd>
          </div>
          <div>
            <dt>Menus</dt>
            <dd>Right-click, or use Shift+F10 from the keyboard.</dd>
          </div>
          <div>
            <dt>Control help</dt>
            <dd>Hold Q while hovering a parameter control.</dd>
          </div>
        </dl>
        <p className="playground-host-action-status">
          <PlaygroundMenuActionReadout />
        </p>
      </div>
    </details>
  );
}

function HostNotesIcon({ className, ...iconProps }: WorkspaceShellTabIconProps) {
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

function HostStatusIcon({ className, ...iconProps }: WorkspaceShellTabIconProps) {
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
        <p>This pane is registered and rendered by the backend-free playground host.</p>
        <p>The package owns its rail, sizing, focus, and interaction behavior.</p>
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
        <button className="playground-pane-action" onClick={closePane} type="button">
          Close pane
        </button>
      </div>
    ),
  },
];

const trailingTabs: ReadonlyArray<WorkspaceShellTabDefinition> = [
  {
    id: "host-status",
    label: "Host status",
    icon: HostStatusIcon,
    renderContent: () => (
      <div className="playground-host-pane">
        <p>The host controls and may serialize the complete pane view state.</p>
        <p>This content receives only the shell&apos;s documented public render props.</p>
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
  const [shellViewState, setShellViewState] = useState(() => createWorkspaceShellViewState());
  const [itemDiagnostics, setItemDiagnostics] = useState<WorkspaceItemDiagnosticRegistry>(
    PLAYGROUND_INITIAL_ITEM_DIAGNOSTICS,
  );

  // Package appearance is scoped to package roots. The playground mirrors the resolved mode only
  // for its own host chrome; real hosts can style their surrounding application independently.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  return (
    <main className="playground-shell">
      <header className="playground-header">
        <div className="playground-brand" translate="no">
          <PlaygroundMark />
          <div className="playground-brand-copy">
            <span>@setta/workspace</span>
            <h1>Workspace playground</h1>
          </div>
        </div>
        <nav aria-label="Playground controls" className="playground-toolbar">
          <DocumentChangeReadout />
          <span aria-hidden="true" className="playground-toolbar-divider" />
          <AppearanceToggle darkMode={darkMode} />
          <ReloadDocumentButton />
          <PlaygroundActionMenu
            onClearDiagnostics={() => setItemDiagnostics({})}
            onShowDiagnostics={() => setItemDiagnostics(PLAYGROUND_INITIAL_ITEM_DIAGNOSTICS)}
            onUpdateDiagnostics={() => setItemDiagnostics(PLAYGROUND_UPDATED_ITEM_DIAGNOSTICS)}
          />
          <PlaygroundGuideMenu />
        </nav>
      </header>
      <div className="playground-workspace">
        <PlaygroundItemDiagnosticsProvider diagnostics={itemDiagnostics}>
          <WorkspaceShell
            ariaLabel="Playground workspace"
            leadingTabs={leadingTabs}
            onViewStateChange={setShellViewState}
            sectionTagColorPalette={sectionTagColorPalette}
            trailingTabs={trailingTabs}
            viewState={shellViewState}
          />
        </PlaygroundItemDiagnosticsProvider>
      </div>
    </main>
  );
}
