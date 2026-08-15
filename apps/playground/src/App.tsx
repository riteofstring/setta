import {
  activateItemSelect,
  createWorkspaceShellViewState,
  deactivateItemSelect,
  loadWorkspaceDocument,
  setWorkspaceColorMode,
  setWorkspaceDocumentChangeCallback,
  useItemSelectionMode,
  useWorkspaceAppearance,
  WorkspaceShell,
  type WorkspaceShellTabDefinition,
  type WorkspaceShellTabIconProps,
} from "@setta/workspace";
import { useEffect, useState } from "react";
import { PlaygroundMenuActionReadout } from "./menuExtensions";
import { playgroundDocument } from "./playgroundDocument";

function toggleDarkMode() {
  const next = !useWorkspaceAppearance.getState().darkMode;
  setWorkspaceColorMode(next ? "dark" : "light");
}

// The host side of the document-change callback: every package-initiated canonical commit
// (selection, move, resize, rename, flag toggles, delete, layout, viewport) invokes the
// callback with the serializable document; a host re-load never does. The count lives in its
// own component so per-frame viewport notifications re-render this readout, not the canvas.
// The package holds item-select mode through its Mod+Shift chord; this button is the
// host-driven alternative for pointer-only exploration.
function ItemSelectModeToggle() {
  const isSelectingItems = useItemSelectionMode((state) => state.isSelectingItems);
  return (
    <button
      type="button"
      onClick={() => (isSelectingItems ? deactivateItemSelect() : activateItemSelect())}
      className="playground-action rounded-md border border-setta-200 px-2 py-1 text-xs text-setta-600 dark:border-setta-700 dark:text-setta-300"
    >
      {isSelectingItems ? "Exit item select mode" : "Enter item select mode"}
    </button>
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
  return <>{documentChangeCount}</>;
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

export function App() {
  const darkMode = useWorkspaceAppearance((state) => state.darkMode);
  const [shellViewState, setShellViewState] = useState(() => createWorkspaceShellViewState());

  // Package appearance is scoped to package roots. The playground mirrors the resolved mode only
  // for its own host chrome; real hosts can style their surrounding application independently.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  return (
    <main className="playground-shell flex h-screen min-w-0 flex-col p-8">
      <header className="playground-header mb-8 flex min-w-0 items-center gap-4">
        <h1 className="text-sm font-semibold text-setta-600 dark:text-setta-300">
          @setta/workspace shell preview
        </h1>
        <button
          type="button"
          onClick={toggleDarkMode}
          className="playground-action rounded-md border border-setta-200 px-2 py-1 text-xs text-setta-600 dark:border-setta-700 dark:text-setta-300"
        >
          Switch to {darkMode ? "light" : "dark"} mode
        </button>
        <button
          type="button"
          onClick={() => loadWorkspaceDocument(playgroundDocument)}
          className="playground-action rounded-md border border-setta-200 px-2 py-1 text-xs text-setta-600 dark:border-setta-700 dark:text-setta-300"
        >
          Reload document
        </button>
        <ItemSelectModeToggle />
        <p className="playground-intro min-w-0 text-xs text-setta-500 dark:text-setta-400">
          <DocumentChangeReadout /> document changes reported. Drag sections or the background,
          scroll or pinch to pan and zoom, click to select, Cmd/Ctrl-click to multi-select,
          Shift-drag to draw a selection. Sections resize from their bottom and right edges, and
          their headers rename, lock, minimize, and delete; group headers also flip their child flow
          between vertical and horizontal. The toolbar zooms, fits, and toggles grid snapping; its
          minimap group hides the pannable, click-to-center minimap or moves it between the bottom
          corners. The twelve controls at the upper right use the headerless canvas presentation:
          edit text, calendar, time, numeric, choice, password, color, and dropzone values inside
          each control, or drag and resize from its remaining surface. Button and file actions stay
          in this backend-free host. Hold Q while hovering a control for its tooltip. Hold Alt and
          drag to move sections into, out of, and between groups; hold Cmd/Ctrl+Alt and drag to sort
          within a group. Hold Cmd/Ctrl+Shift (or use the button) for item select mode: click the
          item panel&apos;s rows to select them, drag rows to sort or re-parent them, then Alt+Arrow
          moves the selection, Tab and Shift+Tab indent and unindent it, and Escape clears it.
          Reload restores the loaded document and camera in place without counting as a change. The
          built-in Outline and Inspector tabs project selection directly; host notes, status, and
          help remain registered pane extensions. Right-click the canvas to create a host section,
          or open canvas, section, item, and Outline menus with Shift+F10.{" "}
          <PlaygroundMenuActionReadout />
        </p>
      </header>
      <div className="playground-workspace flex min-h-0 min-w-0 flex-1">
        <WorkspaceShell
          ariaLabel="Playground workspace"
          leadingTabs={leadingTabs}
          onViewStateChange={setShellViewState}
          trailingTabs={trailingTabs}
          viewState={shellViewState}
        />
      </div>
    </main>
  );
}
