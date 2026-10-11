import {
  setWorkspaceColorMode,
  StandaloneWorkspaceSectionSurface,
  useWorkspaceAppearance,
  useWorkspaceDocumentSnapshot,
  useWorkspaceHost,
} from "@riteofstring/setta";
import { useEffect } from "react";

type FocusedSectionAppProps = {
  sectionId: string;
};

function createCanvasHref(): string {
  const url = new URL(window.location.href);
  url.searchParams.delete("focused-section");
  return `${url.pathname}${url.search}${url.hash}`;
}

function FocusedSectionAppearanceToggle({ darkMode }: { darkMode: boolean }) {
  const host = useWorkspaceHost();
  return (
    <button
      className="playground-toolbar-button"
      onClick={() => setWorkspaceColorMode(host, darkMode ? "light" : "dark")}
      type="button"
    >
      {darkMode ? "Light mode" : "Dark mode"}
    </button>
  );
}

export function FocusedSectionApp({ sectionId }: FocusedSectionAppProps) {
  const darkMode = useWorkspaceAppearance((state) => state.darkMode);
  const documentState = useWorkspaceDocumentSnapshot();
  const section = documentState.sections[sectionId];
  const canvasHref = createCanvasHref();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  return (
    <main className="playground-shell playground-focused-section-shell">
      <header className="playground-header">
        <div className="playground-brand">
          <div className="playground-brand-copy">
            <span>@riteofstring/setta</span>
            <h1>Focused section</h1>
          </div>
        </div>
        <nav
          aria-label="Focused section controls"
          className="playground-toolbar"
        >
          <a className="playground-focused-section-route" href={canvasHref}>
            Open canvas
          </a>
          <FocusedSectionAppearanceToggle darkMode={darkMode} />
        </nav>
      </header>
      <section
        aria-label={
          section
            ? `${section.name} focused section`
            : "Focused section unavailable"
        }
        className="playground-focused-section-content"
      >
        {section ? (
          <StandaloneWorkspaceSectionSurface
            ariaLabel={`${section.name} focused section`}
            className="playground-focused-section-surface"
            headerActions={
              <a
                className="playground-focused-section-header-action"
                href={canvasHref}
              >
                Open canvas
              </a>
            }
            sectionId={sectionId}
          />
        ) : (
          <div className="playground-focused-section-missing" role="alert">
            No playground section matches “{sectionId}”.
          </div>
        )}
      </section>
    </main>
  );
}
