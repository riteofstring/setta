import { useWorkspaceAppearance, WorkspaceCanvas, type WorkspaceSection } from "@setta/workspace";

function toggleDarkMode() {
  const next = !useWorkspaceAppearance.getState().darkMode;
  document.documentElement.classList.toggle("dark", next);
  useWorkspaceAppearance.setState({ darkMode: next });
}

// The host side of the renderer seam: the package owns the shell, chrome, header, and resize
// treatment; the host renders only the section body.
function SectionBody({ section }: { section: WorkspaceSection }) {
  return (
    <div className="section-full px-1">
      <p className="text-xs text-setta-500 dark:text-setta-400">{section.name}</p>
    </div>
  );
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
        <p className="text-xs text-setta-500 dark:text-setta-400">
          Drag sections or the background, scroll or pinch to pan and zoom, click to select,
          Cmd/Ctrl-click to multi-select, Shift-drag to draw a selection. Sections resize from their
          bottom and right edges, and their headers rename, lock, minimize, and delete.
        </p>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-setta-200 dark:border-setta-800">
        <WorkspaceCanvas renderSectionContent={(section) => <SectionBody section={section} />} />
      </div>
    </main>
  );
}
