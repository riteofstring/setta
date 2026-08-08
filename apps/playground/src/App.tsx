import {
  WORKSPACE_DOCUMENT_SCHEMA_VERSION,
  type WorkspaceController,
  type WorkspaceDocument,
} from "@setta/workspace/core";
import {
  Workspace,
  WorkspaceInteractionBoundary,
  type SectionDefinition,
  type SectionRenderProps,
  type WorkspaceSectionTitleValidationRequest,
} from "@setta/workspace/react";
import { useRef, useState } from "react";

import { AdapterProofPage } from "./AdapterProofPage.js";
import { CanvasShellPage } from "./CanvasShellPage.js";
import { StateContractPage } from "./StateContractPage.js";

type PlaygroundSectionData = Readonly<{ body: string }>;
const EXTERNAL_SAMPLE_MIME = "application/x-setta-workspace-sample";

function SampleSection({ data }: SectionRenderProps<PlaygroundSectionData>) {
  return (
    <WorkspaceInteractionBoundary preventExternalDrop>
      <p className="sample-section-copy">{data.body}</p>
    </WorkspaceInteractionBoundary>
  );
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

function fileCountText(fileCount: number): string {
  return `${String(fileCount)} ${fileCount === 1 ? "file" : "files"}`;
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

  return <DefaultPlaygroundPage readOnly={search.has("read-only")} />;
}

function DefaultPlaygroundPage({ readOnly }: Readonly<{ readOnly: boolean }>) {
  const [document, setDocument] = useState(emptyPlaygroundDocument);
  const [announcement, setAnnouncement] = useState("");
  const controllerRef = useRef<WorkspaceController<PlaygroundSectionData>>(null);
  const externalSampleBodyRef = useRef<string | null>(null);
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
          controllerRef={controllerRef}
          document={document}
          emptyState="No sections yet. Use Add section to start."
          onDocumentChange={(nextDocument, change) => {
            setDocument(nextDocument);
            setAnnouncement(`Document change: ${change.reason}.`);
          }}
          onExternalDrop={({ candidate, dataTransfer, event, position }) => {
            const controller = controllerRef.current;
            if (!controller) {
              throw new Error("The playground workspace controller is unavailable.");
            }
            externalSampleBodyRef.current =
              dataTransfer.getData(EXTERNAL_SAMPLE_MIME) || "Imported host content.";
            const result = controller.createSection("sample-note", { position });
            externalSampleBodyRef.current = null;
            const destination = candidate.parentSectionId
              ? `in section ${candidate.parentSectionId}`
              : "on the canvas";
            const rejectionMessage =
              result.status === "rejected"
                ? `Unable to add dropped content (${result.reason}).`
                : "Nothing was added from the drop.";
            setAnnouncement(
              result.status === "applied"
                ? `Imported a sample note from ${event.dataTransferTypes.join(", ")} with ${fileCountText(event.fileCount)}. Placed it ${destination} at index ${String(candidate.insertionIndex)} and position ${String(Math.round(position.x))}, ${String(Math.round(position.y))}.`
                : rejectionMessage,
            );
          }}
          readOnly={readOnly}
          sectionDefinitions={sampleSectionDefinitions}
          sectionFactory={({ kind }) => {
            if (kind !== "sample-note") {
              throw new TypeError(`Unsupported playground section kind ${JSON.stringify(kind)}.`);
            }
            const nextNumber = nextSampleNumber();
            const externalBody = externalSampleBodyRef.current;
            return {
              data: {
                body:
                  externalBody ?? "Host-rendered content inside the package-owned section frame.",
              },
              id: `sample-${String(nextNumber)}`,
              title: `${externalBody ? "Imported" : "Sample"} section ${String(nextNumber)}`,
            };
          }}
          validateExternalDrop={({ event }) =>
            event.dataTransferTypes.includes(EXTERNAL_SAMPLE_MIME)
              ? { allowed: true, label: "Import sample note" }
              : {
                  allowed: false,
                  reason: "Only sample-note drops are supported here.",
                }
          }
          validateSectionTitle={validateSampleSectionTitle}
        />
      </main>
    </>
  );
}
