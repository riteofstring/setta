import {
  WORKSPACE_DOCUMENT_SCHEMA_VERSION,
  type WorkspaceDocument,
  type WorkspaceSection,
} from "@setta/workspace/core";
import {
  Workspace,
  type SectionDefinition,
  type SectionRenderProps,
  type WorkspaceSectionTitleValidationRequest,
} from "@setta/workspace/react";
import { useState } from "react";

import { AdapterProofPage } from "./AdapterProofPage.js";
import { CanvasShellPage } from "./CanvasShellPage.js";
import { StateContractPage } from "./StateContractPage.js";

type PlaygroundSectionData = Readonly<{ body: string }>;

function SampleSection({ data }: SectionRenderProps<PlaygroundSectionData>) {
  return <p className="sample-section-copy">{data.body}</p>;
}

const sampleSectionDefinitions = [
  {
    chrome: "default",
    creation: { group: "Basics", icon: "N", keywords: ["example", "note"] },
    defaultSize: { height: 320, width: 320 },
    defaultTitle: "Sample section",
    displayName: "Sample note",
    kind: "sample-note",
    render: SampleSection,
  },
] satisfies readonly SectionDefinition<PlaygroundSectionData>[];

function sampleSection(id: string, title: string): WorkspaceSection<PlaygroundSectionData> {
  return {
    childLayout: null,
    data: { body: "Host-rendered content inside the package-owned section frame." },
    id,
    isMinimized: false,
    kind: "sample-note",
    positionAndSizeLocked: false,
    presentation: { accentColor: null, chrome: "default", tagColor: null },
    size: {
      height: { mode: "fixed", value: 320 },
      width: { mode: "fixed", value: 320 },
    },
    title,
  };
}

async function validateSampleSectionTitle({
  title,
}: WorkspaceSectionTitleValidationRequest): Promise<string | null> {
  await new Promise<void>((resolve) => window.setTimeout(resolve, 150));
  return title.toLocaleLowerCase() === "reserved"
    ? "Choose a different title. Reserved is unavailable."
    : null;
}

function emptyPlaygroundDocument(): WorkspaceDocument<PlaygroundSectionData> {
  return {
    rootSections: [],
    schemaVersion: WORKSPACE_DOCUMENT_SCHEMA_VERSION,
    sections: {},
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

export function App() {
  const search = new URLSearchParams(window.location.search);
  if (search.has("adapter-proof")) {
    return <AdapterProofPage />;
  }
  if (search.has("state-contract")) {
    return <StateContractPage />;
  }
  if (search.has("canvas-shell")) {
    return <CanvasShellPage />;
  }

  return <DefaultPlaygroundPage />;
}

function DefaultPlaygroundPage() {
  const [document, setDocument] = useState(emptyPlaygroundDocument);
  const [announcement, setAnnouncement] = useState("");

  const addSection = () => {
    const nextNumber = document.rootSections.length + 1;
    const id = `sample-${String(nextNumber)}`;
    const title = `Sample section ${String(nextNumber)}`;
    setDocument((current) => ({
      ...current,
      rootSections: [
        ...current.rootSections,
        { position: { x: 80 + (nextNumber - 1) * 280, y: 80 }, sectionId: id },
      ],
      sections: { ...current.sections, [id]: sampleSection(id, title) },
    }));
    setAnnouncement(`${title} added.`);
  };

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to workspace
      </a>
      <header className="site-header">
        <p className="eyebrow" translate="no">
          @setta/workspace
        </p>
        <h1>Blank-slate workspace</h1>
        <p className="lede">
          A backend-free consumer proving the package state, rendering, and canvas boundaries.
        </p>
      </header>
      <main id="main-content" tabIndex={-1}>
        <div className="playground-toolbar" aria-label="Playground actions">
          <button type="button" onClick={addSection}>
            Add sample section
          </button>
          <p className="announcement" role="status" aria-live="polite">
            {announcement}
          </p>
        </div>
        <Workspace
          ariaLabel="Section workspace"
          document={document}
          emptyState="No sections yet. Add a sample section to start."
          onDocumentChange={(nextDocument, change) => {
            setDocument(nextDocument);
            setAnnouncement(`Document change: ${change.reason}.`);
          }}
          sectionDefinitions={sampleSectionDefinitions}
          validateSectionTitle={validateSampleSectionTitle}
        />
      </main>
    </>
  );
}
