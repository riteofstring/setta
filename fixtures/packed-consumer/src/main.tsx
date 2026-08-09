import {
  GROUP_SECTION_KIND,
  loadWorkspaceDocument,
  registerSectionKinds,
  setWorkspaceDocumentChangeCallback,
  useWorkspaceAppearance,
  WorkspaceCanvas,
  WorkspaceControls,
  WorkspaceTooltip,
  type WorkspaceDocumentInput,
  type WorkspaceSection,
  type WorkspaceSectionInput,
} from "@setta/workspace";
import "@setta/workspace/styles.css";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./consumer.css";

// An unrelated React application consuming the locally packed @setta/workspace artifact: it
// depends only on the tarball's public exports and compiled stylesheet, registers its own
// section kind with its own renderer, icon, and default size, and styles its host chrome
// with plain CSS — no Tailwind, no package source, and no Setta application code.

function getNoteText(section: WorkspaceSection): string {
  const data = section.data;
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`Note section ${section.id} is missing its note data.`);
  }
  const text = data["text"];
  if (typeof text !== "string") {
    throw new Error(`Note section ${section.id} is missing its note text.`);
  }
  return text;
}

function NoteBody({ section }: { section: WorkspaceSection }) {
  // The compiled stylesheet's section grid utility places the body across the content rows,
  // the same placement the playground consumer uses.
  return (
    <div className="section-full-no-title">
      <p className="consumer-note-body">{getNoteText(section)}</p>
    </div>
  );
}

function NoteIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeWidth="1.5"
      viewBox="0 0 16 16"
    >
      <path d="M3 2.5h10v8L9.5 13.5H3z" />
      <path d="M9.5 13.5v-3H13" />
    </svg>
  );
}

function makeNoteSection(id: string, name: string, text: string): WorkspaceSectionInput {
  return {
    id,
    kind: "note",
    name,
    // The note text is the kind's opaque data; the size comes from the kind's registered
    // default.
    data: { text },
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    tagColor: null,
    children: [],
  };
}

const consumerDocument: WorkspaceDocumentInput = {
  sections: {
    "welcome-note": makeNoteSection(
      "welcome-note",
      "Welcome note",
      "Rendered from the packed @setta/workspace artifact.",
    ),
    "notes-group": {
      id: "notes-group",
      kind: GROUP_SECTION_KIND,
      name: "Notes group",
      isMinimized: false,
      positionAndSizeLocked: false,
      isHorizontalOrientation: false,
      styleColor: null,
      tagColor: null,
      children: ["nested-note"],
    },
    "nested-note": makeNoteSection("nested-note", "Nested note", "A nested note inside the group."),
  },
  topLevelSections: {
    "welcome-note": { x: 24, y: 24, w: 240, h: 140, zIndex: 0 },
    "notes-group": { x: 24, y: 232, w: null, h: null, zIndex: 1 },
  },
  viewport: { x: 0, y: 0, zoom: 1 },
  activeIds: [],
};

function toggleDarkMode() {
  const next = !useWorkspaceAppearance.getState().darkMode;
  document.documentElement.classList.toggle("dark", next);
  useWorkspaceAppearance.setState({ darkMode: next });
}

// The host side of the document-change callback: every package-initiated canonical commit
// reports the serializable document once; the initial load never does.
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

function ConsumerApp() {
  const darkMode = useWorkspaceAppearance((state) => state.darkMode);

  return (
    <main className="consumer-shell">
      <header className="consumer-header">
        <h1>Packed @setta/workspace consumer</h1>
        <button type="button" onClick={toggleDarkMode}>
          Switch to {darkMode ? "light" : "dark"} mode
        </button>
        <p>
          <DocumentChangeReadout /> document changes reported.
        </p>
      </header>
      <div className="consumer-workspace">
        <aside className="consumer-toolbar">
          <WorkspaceControls />
        </aside>
        <div className="consumer-canvas">
          <WorkspaceCanvas />
        </div>
      </div>
      <WorkspaceTooltip />
    </main>
  );
}

// Kind registration precedes the load because loading validates section kinds against the
// registry, and the appearance store must reflect the boot appearance before node
// projection derives backgrounds from it.
useWorkspaceAppearance.setState({
  darkMode: document.documentElement.classList.contains("dark"),
});
registerSectionKinds({
  note: {
    renderContent: (section) => <NoteBody section={section} />,
    icon: NoteIcon,
    defaultSize: { width: 240, height: 140 },
  },
});
loadWorkspaceDocument(consumerDocument);

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Packed consumer root element missing.");
}

createRoot(rootElement).render(
  <StrictMode>
    <ConsumerApp />
  </StrictMode>,
);
