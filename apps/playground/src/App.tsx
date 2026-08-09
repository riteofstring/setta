import {
  applyActiveSectionChange,
  DEFAULT_SECTION_BG_COLOR,
  deriveSectionStyleTheme,
  getOnSectionClick,
  getSectionContainerShellClassName,
  getSectionSurfaceClassName,
  resolveSectionStyleVars,
  useActiveSections,
  useViewportInteractionActive,
  useWorkspaceAppearance,
  WorkspaceCanvas,
  type WorkspaceSection,
} from "@setta/workspace";

function toggleDarkMode() {
  const next = !useWorkspaceAppearance.getState().darkMode;
  document.documentElement.classList.toggle("dark", next);
  useWorkspaceAppearance.setState({ darkMode: next });
}

function CanvasSectionContent({ section }: { section: WorkspaceSection }) {
  const darkMode = useWorkspaceAppearance((state) => state.darkMode);
  const isActiveSection = useActiveSections((state) => state.activeIds.includes(section.id));
  const viewportInteractionActive = useViewportInteractionActive();
  const sectionStyleTheme = section.styleColor
    ? deriveSectionStyleTheme(section.styleColor, darkMode)
    : null;
  const shellClassName = getSectionContainerShellClassName({
    isActiveSection,
    hasSectionStyleTheme: Boolean(sectionStyleTheme),
    positionAndSizeLocked: section.positionAndSizeLocked,
  });
  const surfaceClassName = getSectionSurfaceClassName({
    bgColor: DEFAULT_SECTION_BG_COLOR,
    hasSectionStyleTheme: Boolean(sectionStyleTheme),
    positionAndSizeLocked: section.positionAndSizeLocked,
  });

  return (
    <section
      role="button"
      tabIndex={0}
      aria-pressed={isActiveSection}
      className={`${shellClassName} ${isActiveSection ? "z-[150]" : "z-10"}`}
      data-section-id={section.id}
      data-section-active={isActiveSection ? "true" : "false"}
      style={{
        ...resolveSectionStyleVars(sectionStyleTheme),
        // Mirrors the reference's pan/zoom compositing hint on the section shell.
        willChange: viewportInteractionActive ? "transform" : undefined,
      }}
      onClick={getOnSectionClick(section.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          applyActiveSectionChange({ interaction: "section-click", sectionId: section.id });
        }
      }}
    >
      <div className={surfaceClassName}>
        <div
          className="section-full"
          style={{
            width: section.size.width === "auto" ? undefined : section.size.width,
            height: section.size.height === "auto" ? undefined : section.size.height,
          }}
        >
          <p className="text-xs text-setta-500 dark:text-setta-400">{section.name}</p>
        </div>
      </div>
    </section>
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
          Cmd/Ctrl-click to multi-select, Shift-drag to draw a selection.
        </p>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-setta-200 dark:border-setta-800">
        <WorkspaceCanvas
          renderSectionContent={(section) => <CanvasSectionContent section={section} />}
        />
      </div>
    </main>
  );
}
