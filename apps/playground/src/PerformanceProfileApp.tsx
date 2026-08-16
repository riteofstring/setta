import {
  useWorkspaceHost,
  WorkspaceCanvas,
  WorkspaceControls,
  WorkspaceTooltip,
} from "@setta/workspace";
import {
  PERFORMANCE_PROFILE_DRAG_TARGET_ID,
  PERFORMANCE_PROFILE_SECTION_COUNT,
  performanceProfileDocument,
} from "./performanceProfileDocument";

// Production-only-by-query profiling host. It composes the same package canvas, controls,
// minimap, tooltip, registered leaf renderer, compiled stylesheet, and host chrome as the normal
// playground while removing unrelated control fixtures from the measured document.
export function PerformanceProfileApp() {
  const host = useWorkspaceHost();
  return (
    <main
      className="playground-shell flex h-screen min-w-0 flex-col p-8"
      data-performance-profile="large-document"
      data-performance-section-count={PERFORMANCE_PROFILE_SECTION_COUNT}
      data-performance-drag-target={PERFORMANCE_PROFILE_DRAG_TARGET_ID}
    >
      <header className="playground-header mb-4 flex min-w-0 items-center gap-4">
        <h1 className="text-sm font-semibold text-setta-600 dark:text-setta-300">
          @setta/workspace large-document profile
        </h1>
        <p className="playground-intro min-w-0 text-xs text-setta-500 dark:text-setta-400">
          {PERFORMANCE_PROFILE_SECTION_COUNT} fixed-size top-level sections;
          package controls and minimap enabled.
        </p>
        <button
          type="button"
          className="playground-action rounded-md border border-setta-200 px-2 py-1 text-xs text-setta-600 dark:border-setta-700 dark:text-setta-300"
          data-performance-profile-reset="true"
          onClick={() => host.loadDocument(performanceProfileDocument)}
        >
          Reset profile
        </button>
      </header>
      <div className="playground-workspace flex min-h-0 min-w-0 flex-1 gap-2">
        <aside className="playground-toolbar flex w-9 flex-col pb-1">
          <WorkspaceControls />
        </aside>
        <div className="playground-canvas min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg border border-setta-200 dark:border-setta-800">
          <WorkspaceCanvas />
        </div>
      </div>
      <WorkspaceTooltip />
    </main>
  );
}
