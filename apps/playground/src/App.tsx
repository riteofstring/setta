import { WORKSPACE_DOCUMENT_SCHEMA_VERSION, type WorkspaceDocument } from "@setta/workspace/core";
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
  const nextSampleNumber = () => {
    let number = 1;
    while (Object.hasOwn(document.sections, `sample-${String(number)}`)) {
      number += 1;
    }
    return number;
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
        <div className="playground-toolbar">
          <p className="announcement" role="status" aria-live="polite">
            {announcement}
          </p>
        </div>
        <Workspace
          ariaLabel="Section workspace"
          document={document}
          emptyState="No sections yet. Use Add section to start."
          onDocumentChange={(nextDocument, change) => {
            setDocument(nextDocument);
            setAnnouncement(`Document change: ${change.reason}.`);
          }}
          sectionDefinitions={sampleSectionDefinitions}
          sectionFactory={({ kind }) => {
            if (kind !== "sample-note") {
              throw new TypeError(`Unsupported playground section kind ${JSON.stringify(kind)}.`);
            }
            const nextNumber = nextSampleNumber();
            return {
              data: { body: "Host-rendered content inside the package-owned section frame." },
              id: `sample-${String(nextNumber)}`,
              title: `Sample section ${String(nextNumber)}`,
            };
          }}
          validateSectionTitle={validateSampleSectionTitle}
        />
      </main>
    </>
  );
}
