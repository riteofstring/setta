import {
  DEFAULT_SECTION_BG_COLOR,
  deriveSectionStyleTheme,
  getActiveSectionIds,
  getHighestAncestor,
  getSectionContainerShellClassName,
  getSectionSurfaceClassName,
  resolveActiveSectionChange,
  resolveSectionStyleVars,
  setActiveSectionIds,
  setZIndices,
  useActiveSections,
  useNodeInternals,
  useWorkspaceAppearance,
  useWorkspaceDocument,
  type Node,
  type WorkspaceSection,
} from "@setta/workspace";

// Mirrors the reference's active-section controller wiring inline; the extracted controller
// arrives with the canvas batch, which owns the multi-selection key state.
function applySectionClick(sectionId: string, multiSelectionActive: boolean) {
  const decision = resolveActiveSectionChange({
    interaction: "section-click",
    activeIds: getActiveSectionIds(),
    sectionId,
    multiSelectionActive,
  });
  setActiveSectionIds(decision.nextActiveIds);
  if (decision.updateZIndex) {
    setZIndices([getHighestAncestor(sectionId)]);
  }
}

function applyPaneClick() {
  const decision = resolveActiveSectionChange({
    interaction: "pane-click",
    activeIds: getActiveSectionIds(),
  });
  setActiveSectionIds(decision.nextActiveIds);
}

function toggleDarkMode() {
  const next = !useWorkspaceAppearance.getState().darkMode;
  document.documentElement.classList.toggle("dark", next);
  useWorkspaceAppearance.setState({ darkMode: next });
}

type CanvasSectionProps = {
  section: WorkspaceSection;
  node: Node;
  isActiveSection: boolean;
};

function CanvasSection({ section, node, isActiveSection }: CanvasSectionProps) {
  const darkMode = useWorkspaceAppearance((state) => state.darkMode);
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
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isActiveSection}
      className="absolute left-0 top-0"
      style={{
        transform: `translate(${node.position.x}px, ${node.position.y}px)`,
        zIndex: node.tempZIndex,
      }}
      onClick={(event) => {
        event.stopPropagation();
        applySectionClick(section.id, event.shiftKey);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          applySectionClick(section.id, event.shiftKey);
        }
      }}
    >
      <section
        className={`${shellClassName} ${isActiveSection ? "z-[150]" : "z-10"}`}
        data-section-id={section.id}
        data-section-active={isActiveSection ? "true" : "false"}
        style={resolveSectionStyleVars(sectionStyleTheme)}
      >
        <div className={surfaceClassName}>
          <div
            className="section-full"
            style={{
              width: node.width ?? undefined,
              height: node.height ?? undefined,
            }}
          >
            <p className="text-xs text-setta-500 dark:text-setta-400">{section.name}</p>
          </div>
        </div>
      </section>
    </div>
  );
}

export function App() {
  const sections = useWorkspaceDocument((state) => state.sections);
  const nodes = useNodeInternals((state) => state.x);
  const activeIds = useActiveSections((state) => state.activeIds);
  const darkMode = useWorkspaceAppearance((state) => state.darkMode);

  return (
    <main className="min-h-screen p-8">
      <header className="mb-8 flex items-center gap-4">
        <h1 className="text-sm font-semibold text-setta-600 dark:text-setta-300">
          @setta/workspace document preview
        </h1>
        <button
          type="button"
          onClick={toggleDarkMode}
          className="rounded-md border border-setta-200 px-2 py-1 text-xs text-setta-600 dark:border-setta-700 dark:text-setta-300"
        >
          Switch to {darkMode ? "light" : "dark"} mode
        </button>
        <p className="text-xs text-setta-500 dark:text-setta-400">
          Click selects a section, shift-click multi-selects, background click deselects.
        </p>
      </header>
      <div
        role="button"
        tabIndex={0}
        aria-label="Deselect all sections"
        className="relative h-[520px] overflow-hidden rounded-lg border border-setta-200 dark:border-setta-800"
        onClick={applyPaneClick}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            applyPaneClick();
          }
        }}
      >
        {[...nodes.values()].map((node) => {
          const section = sections[node.id];
          if (!section) {
            throw new Error(`Node ${node.id} has no section record.`);
          }
          return (
            <CanvasSection
              key={node.id}
              section={section}
              node={node}
              isActiveSection={activeIds.includes(node.id)}
            />
          );
        })}
      </div>
    </main>
  );
}
