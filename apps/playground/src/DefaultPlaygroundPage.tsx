import {
  createWorkspaceJsonClipboardAdapter,
  type WorkspaceAppearance,
  type WorkspaceController,
  type WorkspaceDocument,
} from "@setta/workspace/core";
import {
  Workspace,
  WorkspaceDetachmentProvider,
  type WorkspaceSectionTitleValidationRequest,
} from "@setta/workspace/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PlaygroundDataPanel, type PlaygroundImportResult } from "./PlaygroundDataPanel.js";
import { createPlaygroundSectionDefinitions } from "./PlaygroundSections.js";
import {
  createPlaygroundExampleDocument,
  createPlaygroundFieldListData,
  formatPlaygroundDocument,
  loadPlaygroundState,
  parsePlaygroundDocument,
  persistPlaygroundDocument,
  persistPlaygroundPreferences,
  playgroundImportErrorMessage,
  validatePlaygroundClipboardSectionData,
  type PlaygroundFieldListData,
  type PlaygroundPreferences,
  type PlaygroundSectionData,
} from "./playground-model.js";

const EXTERNAL_SAMPLE_MIME = "application/x-setta-workspace-sample";
const DETACHED_NOTE_HEAD_STYLE = `
.sample-section-copy {
  margin: 0;
  color: var(--setta-workspace-section-local-text);
  font-weight: 600;
}
`;

async function validateSampleSectionTitle({
  title,
}: WorkspaceSectionTitleValidationRequest): Promise<string | null> {
  await new Promise<void>((resolve) => window.setTimeout(resolve, 150));
  return title.toLocaleLowerCase() === "reserved"
    ? "Choose a different title. Reserved is unavailable."
    : null;
}

function fileCountText(fileCount: number): string {
  return `${String(fileCount)} ${fileCount === 1 ? "file" : "files"}`;
}

function nextSectionNumber(
  document: WorkspaceDocument<PlaygroundSectionData>,
  prefix: string,
): number {
  let number = 1;
  while (Object.hasOwn(document.sections, `${prefix}-${String(number)}`)) {
    number += 1;
  }
  return number;
}

function reportPersistenceFailure(
  message: string | null,
  setAnnouncement: (value: string) => void,
) {
  if (message) {
    setAnnouncement(message);
  }
}

export function DefaultPlaygroundPage({ readOnly }: Readonly<{ readOnly: boolean }>) {
  const [initialState] = useState(loadPlaygroundState);
  const [document, setDocument] = useState(initialState.document);
  const [preferences, setPreferences] = useState(initialState.preferences);
  const [announcement, setAnnouncement] = useState(initialState.message);
  const [fieldListSelectionEpoch, setFieldListSelectionEpoch] = useState(0);
  const controllerRef = useRef<WorkspaceController<PlaygroundSectionData>>(null);
  const clipboardSectionNumberRef = useRef(1);
  const externalSampleBodyRef = useRef<string | null>(null);
  const documentJson = useMemo(() => formatPlaygroundDocument(document), [document]);
  const handleFieldListDataChange = useCallback(
    (sectionId: string, data: PlaygroundFieldListData, message: string) => {
      setDocument((current) => {
        const section = current.sections[sectionId];
        if (!section || section.kind !== "sample-field-list") {
          throw new TypeError(`Field-list section ${JSON.stringify(sectionId)} is unavailable.`);
        }
        return {
          ...current,
          sections: { ...current.sections, [sectionId]: { ...section, data } },
        };
      });
      setAnnouncement(message);
    },
    [],
  );
  const sectionDefinitions = useMemo(
    () => createPlaygroundSectionDefinitions(handleFieldListDataChange, fieldListSelectionEpoch),
    [fieldListSelectionEpoch, handleFieldListDataChange],
  );
  const clipboardAdapter = useMemo(() => {
    if (!navigator.clipboard) return undefined;
    return createWorkspaceJsonClipboardAdapter<PlaygroundSectionData>({
      allocateSectionId: ({ kind }) => {
        let sectionId: string;
        do {
          sectionId = `${kind}-copy-${String(clipboardSectionNumberRef.current)}`;
          clipboardSectionNumberRef.current += 1;
        } while (Object.hasOwn(document.sections, sectionId));
        return sectionId;
      },
      clipboard: navigator.clipboard,
      validateSectionData: validatePlaygroundClipboardSectionData,
    });
  }, [document.sections]);

  useEffect(() => {
    reportPersistenceFailure(persistPlaygroundDocument(document), setAnnouncement);
  }, [document]);

  useEffect(() => {
    reportPersistenceFailure(persistPlaygroundPreferences(preferences), setAnnouncement);
  }, [preferences]);

  const updatePreferences = (updates: Partial<PlaygroundPreferences>) => {
    setPreferences((current) => ({ ...current, ...updates }));
  };

  const importDocument = (serialized: string): PlaygroundImportResult => {
    try {
      const importedDocument = parsePlaygroundDocument(serialized);
      const documentJson = formatPlaygroundDocument(importedDocument);
      setFieldListSelectionEpoch((current) => current + 1);
      setDocument(importedDocument);
      setAnnouncement(
        `Workspace imported. ${String(Object.keys(importedDocument.sections).length)} sections restored.`,
      );
      return { documentJson, status: "applied" };
    } catch (error) {
      return { message: playgroundImportErrorMessage(error), status: "rejected" };
    }
  };

  const nextFactoryResult = (kind: string) => {
    if (kind === "sample-note") {
      const nextNumber = nextSectionNumber(document, "sample");
      const externalBody = externalSampleBodyRef.current;
      return {
        data: {
          body: externalBody ?? "Host-rendered content inside the package-owned section frame.",
          type: "note" as const,
        },
        id: `sample-${String(nextNumber)}`,
        title: `${externalBody ? "Imported" : "Sample"} section ${String(nextNumber)}`,
      };
    }
    if (kind === "sample-status") {
      const nextNumber = nextSectionNumber(document, "status");
      return {
        data: { count: 0, label: "checks ready", type: "status" as const },
        id: `status-${String(nextNumber)}`,
        title: `Workspace status ${String(nextNumber)}`,
      };
    }
    if (kind === "sample-field-list") {
      const nextNumber = nextSectionNumber(document, "fields");
      return {
        data: createPlaygroundFieldListData(),
        id: `fields-${String(nextNumber)}`,
        title: `Profile fields ${String(nextNumber)}`,
      };
    }
    throw new TypeError(`Unsupported playground section kind ${JSON.stringify(kind)}.`);
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
          A backend-free consumer proving package state, host rendering, local persistence, and
          canvas boundaries.
        </p>
      </header>
      <main id="main-content" tabIndex={-1}>
        <div className="playground-host-controls">
          <fieldset className="playground-preferences">
            <legend>Workspace preferences</legend>
            <label>
              Appearance
              <select
                onChange={(event) =>
                  updatePreferences({
                    appearance: event.currentTarget.value as WorkspaceAppearance,
                  })
                }
                value={preferences.appearance}
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <label>
              <input
                checked={preferences.gridVisible}
                onChange={(event) =>
                  updatePreferences({ gridVisible: event.currentTarget.checked })
                }
                type="checkbox"
              />
              Show grid
            </label>
            <label>
              <input
                checked={preferences.gridSnap}
                onChange={(event) => updatePreferences({ gridSnap: event.currentTarget.checked })}
                type="checkbox"
              />
              Snap to grid
            </label>
          </fieldset>
          <PlaygroundDataPanel
            currentDocumentJson={documentJson}
            onImport={importDocument}
            onReset={() => {
              setFieldListSelectionEpoch((current) => current + 1);
              setDocument(createPlaygroundExampleDocument());
              setAnnouncement(
                "Example workspace restored with a note, status, and field-list section.",
              );
            }}
            onStatus={setAnnouncement}
            readOnly={readOnly}
          />
        </div>
        <div className="playground-toolbar">
          <p className="announcement" role="status" aria-live="polite">
            {announcement}
          </p>
        </div>
        <WorkspaceDetachmentProvider
          getInitialWindowBounds={() => ({ height: 560, width: 720 })}
          onWindowChange={({ bounds, open, title }) => {
            setAnnouncement(
              open
                ? `${title} opened in a ${String(Math.round(bounds.width))} by ${String(Math.round(bounds.height))} window.`
                : `${title} returned to the workspace.`,
            );
          }}
          renderWindowHead={({ kind }) =>
            kind === "sample-note" ? (
              <>
                <meta content="playground-note" name="setta-workspace-renderer" />
                <style>{DETACHED_NOTE_HEAD_STYLE}</style>
              </>
            ) : null
          }
          validateDetachment={({ kind, title }) =>
            kind === "sample-note" && title !== "Docked-only note"
              ? { allowed: true }
              : {
                  allowed: false,
                  reason: "The playground host requires this section to stay docked.",
                }
          }
        >
          <Workspace
            {...(clipboardAdapter ? { clipboardAdapter } : {})}
            appearanceOptions={{ appearance: preferences.appearance }}
            ariaLabel="Section workspace"
            controllerRef={controllerRef}
            document={document}
            emptyState="No sections yet. Use Add section or restore the example to start."
            gridOptions={{ snap: preferences.gridSnap, visible: preferences.gridVisible }}
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
            onGridSnapChange={(gridSnap) => updatePreferences({ gridSnap })}
            readOnly={readOnly}
            sectionDefinitions={sectionDefinitions}
            sectionFactory={({ kind }) => nextFactoryResult(kind)}
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
        </WorkspaceDetachmentProvider>
      </main>
    </>
  );
}
