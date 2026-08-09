import {
  loadWorkspaceDocument,
  setWorkspaceDocumentChangeCallback,
  useWorkspaceAppearance,
  WorkspaceCanvas,
  WorkspaceControls,
  WorkspaceTooltip,
  type WorkspaceSection,
} from "@setta/workspace";
import { useEffect, useState } from "react";
import { sliceDocument } from "./sliceDocument";

function toggleDarkMode() {
  const next = !useWorkspaceAppearance.getState().darkMode;
  document.documentElement.classList.toggle("dark", next);
  useWorkspaceAppearance.setState({ darkMode: next });
}

// The host side of the renderer seam: the package owns the shell, chrome, header, and resize
// treatment; the host renders only the section body.
function SectionBody({ section }: { section: WorkspaceSection }) {
  return (
    <div className="section-full-no-title px-1">
      <p className="text-xs text-setta-500 dark:text-setta-400">{section.name}</p>
    </div>
  );
}

// The host side of the document-change callback: every package-initiated canonical commit
// (selection, move, resize, rename, flag toggles, delete, layout, viewport) invokes the
// callback with the serializable document; a host re-load never does. The count lives in its
// own component so per-frame viewport notifications re-render this readout, not the canvas.
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

export function App() {
  const darkMode = useWorkspaceAppearance((state) => state.darkMode);

  return (
    <main className="flex h-screen flex-col p-8">
      <header className="mb-8 flex items-center gap-4">
        <h1 className="text-sm font-semibold text-setta-600 dark:text-setta-300">
          @setta/workspace canvas preview
        </h1>
        <button
          type="button"
          onClick={toggleDarkMode}
          className="rounded-md border border-setta-200 px-2 py-1 text-xs text-setta-600 dark:border-setta-700 dark:text-setta-300"
        >
          Switch to {darkMode ? "light" : "dark"} mode
        </button>
        <button
          type="button"
          onClick={() => loadWorkspaceDocument(sliceDocument)}
          className="rounded-md border border-setta-200 px-2 py-1 text-xs text-setta-600 dark:border-setta-700 dark:text-setta-300"
        >
          Reload document
        </button>
        <p className="text-xs text-setta-500 dark:text-setta-400">
          <DocumentChangeReadout /> document changes reported. Drag sections or the background,
          scroll or pinch to pan and zoom, click to select, Cmd/Ctrl-click to multi-select,
          Shift-drag to draw a selection. Sections resize from their bottom and right edges, and
          their headers rename, lock, minimize, and delete. The toolbar zooms, fits, and toggles
          grid snapping; hold Q while hovering a control for its tooltip. Hold Alt and drag to move
          sections into, out of, and between groups; hold Cmd/Ctrl+Alt and drag to sort within a
          group. Reload restores the loaded document and camera in place without counting as a
          change.
        </p>
      </header>
      <div className="flex min-h-0 flex-1 gap-2">
        {/* The host side of the toolbar placement: the reference composes the toolbar at the
            bottom of the Overview left rail, outside the canvas. */}
        <aside className="flex w-9 flex-col pb-1">
          <WorkspaceControls />
        </aside>
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-setta-200 dark:border-setta-800">
          <WorkspaceCanvas renderSectionContent={(section) => <SectionBody section={section} />} />
        </div>
      </div>
      <WorkspaceTooltip />
    </main>
  );
}
