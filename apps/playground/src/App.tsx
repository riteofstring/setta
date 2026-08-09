import {
  DEFAULT_SECTION_BG_COLOR,
  deriveSectionStyleTheme,
  getSectionContainerShellClassName,
  getSectionSurfaceClassName,
  resolveSectionStyleVars,
} from "@setta/workspace";
import { useState } from "react";

type PreviewSectionProps = {
  title: string;
  darkMode: boolean;
  isActiveSection?: boolean;
  positionAndSizeLocked?: boolean;
  styleColor?: string;
};

// Mirrors the shell/surface composition of the reference's SectionContainerCore for the
// chrome states the Phase 1 slice reaches. The real section component replaces this preview
// once the document store and interaction batches land.
function PreviewSection({
  title,
  darkMode,
  isActiveSection = false,
  positionAndSizeLocked = false,
  styleColor,
}: PreviewSectionProps) {
  const sectionStyleTheme = styleColor ? deriveSectionStyleTheme(styleColor, darkMode) : null;
  const shellClassName = getSectionContainerShellClassName({
    isActiveSection,
    hasSectionStyleTheme: Boolean(sectionStyleTheme),
    positionAndSizeLocked,
  });
  const surfaceClassName = getSectionSurfaceClassName({
    bgColor: DEFAULT_SECTION_BG_COLOR,
    hasSectionStyleTheme: Boolean(sectionStyleTheme),
    positionAndSizeLocked,
  });

  return (
    <section
      className={`${shellClassName} ${isActiveSection ? "z-[150]" : "z-10"}`}
      data-section-active={isActiveSection ? "true" : "false"}
      style={resolveSectionStyleVars(sectionStyleTheme)}
    >
      <div className={surfaceClassName}>
        <div className="section-full h-24 w-56">
          <p className="text-xs text-setta-500 dark:text-setta-400">{title}</p>
        </div>
      </div>
    </section>
  );
}

export function App() {
  const [darkMode, setDarkMode] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );

  function toggleDarkMode() {
    const next = !darkMode;
    document.documentElement.classList.toggle("dark", next);
    setDarkMode(next);
  }

  return (
    <main className="min-h-screen p-8">
      <header className="mb-8 flex items-center gap-4">
        <h1 className="text-sm font-semibold text-setta-600 dark:text-setta-300">
          @setta/workspace chrome preview
        </h1>
        <button
          type="button"
          onClick={toggleDarkMode}
          className="rounded-md border border-setta-200 px-2 py-1 text-xs text-setta-600 dark:border-setta-700 dark:text-setta-300"
        >
          Switch to {darkMode ? "light" : "dark"} mode
        </button>
      </header>
      <div className="flex flex-wrap items-start gap-8">
        <PreviewSection title="Idle leaf" darkMode={darkMode} />
        <PreviewSection title="Selected leaf" darkMode={darkMode} isActiveSection />
        <PreviewSection title="Locked leaf" darkMode={darkMode} positionAndSizeLocked />
        <PreviewSection title="Style-colored leaf" darkMode={darkMode} styleColor="#3b82f6" />
        <PreviewSection
          title="Selected style-colored leaf"
          darkMode={darkMode}
          isActiveSection
          styleColor="#3b82f6"
        />
      </div>
    </main>
  );
}
