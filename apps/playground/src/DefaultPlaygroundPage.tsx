import {
  createWorkspaceJsonClipboardAdapter,
  type WorkspaceActionResult,
  type WorkspaceAppearance,
  type WorkspaceController,
  type WorkspaceDocument,
  type WorkspaceViewportPreset,
} from "@setta/workspace/core";
import {
  Workspace,
  WorkspaceDetachmentProvider,
  WorkspaceOutline,
  WorkspaceViewportPresets,
  type WorkspacePaneRegistration,
  type WorkspaceSectionTitleValidationRequest,
  type WorkspaceToolbarControl,
  type WorkspaceViewportPresetCreateRequest,
  type WorkspaceViewportPresetRenameRequest,
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
const VIEWPORT_CULLING_OPTIONS = Object.freeze({ enabled: true, overscan: 160 });

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

function ArrangeSectionsIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeWidth="1.5"
      viewBox="0 0 20 20"
    >
      <rect height="5" rx="1" width="5" x="3.5" y="3.5" />
      <rect height="5" rx="1" width="5" x="11.5" y="3.5" />
      <rect height="5" rx="1" width="5" x="3.5" y="11.5" />
      <rect height="5" rx="1" width="5" x="11.5" y="11.5" />
    </svg>
  );
}

function SectionsPaneIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeWidth="1.5"
      viewBox="0 0 20 20"
    >
      <path d="M6 4.5h8M6 10h8M6 15.5h8" />
      <circle cx="3.5" cy="4.5" r="1" />
      <circle cx="3.5" cy="10" r="1" />
      <circle cx="3.5" cy="15.5" r="1" />
    </svg>
  );
}

function SavedViewsPaneIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeWidth="1.5"
      viewBox="0 0 20 20"
    >
      <path d="M5 3.5h10v13l-5-3-5 3z" />
      <path d="M7.5 7h5" />
    </svg>
  );
}

function nextViewportPresetId(presets: readonly WorkspaceViewportPreset[]): string {
  let number = 1;
  while (presets.some(({ id }) => id === `saved-view-${String(number)}`)) number += 1;
  return `saved-view-${String(number)}`;
}

function autoLayoutAnnouncement(result: WorkspaceActionResult): string {
  if (result.status === "applied") {
    return "Top-level sections arranged.";
  }
  if (result.status === "unchanged") {
    return "Top-level sections are already arranged.";
  }
  if (!("reason" in result)) {
    return "Unable to arrange top-level sections.";
  }
  const messages = {
    "canvas-unavailable": "The workspace canvas is unavailable.",
    "layout-edit-disabled": "Turn on layout editing to arrange sections.",
    "section-geometry-unavailable": "Sections are still being measured. Try arranging them again.",
    "section-locked": "Unlock all top-level sections before arranging them.",
  } as const;
  return (
    messages[result.reason as keyof typeof messages] ?? "Unable to arrange top-level sections."
  );
}

export function DefaultPlaygroundPage({ readOnly }: Readonly<{ readOnly: boolean }>) {
  const [initialState] = useState(loadPlaygroundState);
  const [document, setDocument] = useState(initialState.document);
  const [preferences, setPreferences] = useState(initialState.preferences);
  const [announcement, setAnnouncement] = useState(initialState.message);
  const [fieldListSelectionEpoch, setFieldListSelectionEpoch] = useState(0);
  const [activePaneId, setActivePaneId] = useState<string | null>(null);
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
  const toolbarControls = useMemo<readonly WorkspaceToolbarControl<PlaygroundSectionData>[]>(
    () => [
      {
        disabled: readOnly || document.rootSections.length < 2,
        icon: <ArrangeSectionsIcon />,
        id: "arrange-sections",
        label: "Arrange sections",
        onPress: (controller) => {
          setAnnouncement(autoLayoutAnnouncement(controller.autoLayoutRootSections()));
        },
        placement: "project",
      },
    ],
    [document.rootSections.length, readOnly],
  );

  useEffect(() => {
    reportPersistenceFailure(persistPlaygroundDocument(document), setAnnouncement);
  }, [document]);

  useEffect(() => {
    reportPersistenceFailure(persistPlaygroundPreferences(preferences), setAnnouncement);
  }, [preferences]);

  const updatePreferences = (updates: Partial<PlaygroundPreferences>) => {
    setPreferences((current) => ({ ...current, ...updates }));
  };

  const createViewportPreset = useCallback(
    ({ name, viewport }: WorkspaceViewportPresetCreateRequest) => {
      setPreferences((current) => ({
        ...current,
        viewportPresets: [
          ...current.viewportPresets,
          { id: nextViewportPresetId(current.viewportPresets), name, viewport },
        ],
      }));
    },
    [],
  );

  const renameViewportPreset = useCallback(
    ({ name, presetId }: WorkspaceViewportPresetRenameRequest) => {
      setPreferences((current) => ({
        ...current,
        viewportPresets: current.viewportPresets.map((preset) =>
          preset.id === presetId ? { ...preset, name } : preset,
        ),
      }));
    },
    [],
  );

  const deleteViewportPreset = useCallback((presetId: string) => {
    setPreferences((current) => ({
      ...current,
      viewportPresets: current.viewportPresets.filter(({ id }) => id !== presetId),
    }));
  }, []);

  const panes = useMemo<readonly WorkspacePaneRegistration<PlaygroundSectionData>[]>(
    () => [
      {
        icon: <SectionsPaneIcon />,
        id: "sections",
        label: "Sections",
        placement: "start",
        render: (workspaceController) => (
          <WorkspaceOutline ariaLabel="Workspace sections" controller={workspaceController} />
        ),
      },
      {
        icon: <SavedViewsPaneIcon />,
        id: "saved-views",
        label: "Saved views",
        placement: "end",
        render: (workspaceController) => (
          <WorkspaceViewportPresets
            controller={workspaceController}
            onCreatePreset={createViewportPreset}
            onDeletePreset={deleteViewportPreset}
            onRenamePreset={renameViewportPreset}
            presets={preferences.viewportPresets}
          />
        ),
      },
    ],
    [createViewportPreset, deleteViewportPreset, preferences.viewportPresets, renameViewportPreset],
  );

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
            activePaneId={activePaneId}
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
              const placement =
                candidate.placement.type === "ordered"
                  ? `at index ${String(candidate.placement.index)}`
                  : `${candidate.parentSectionId ? "at local" : "at"} position ${String(Math.round(candidate.placement.position.x))}, ${String(Math.round(candidate.placement.position.y))}`;
              const rejectionMessage =
                result.status === "rejected"
                  ? `Unable to add dropped content (${result.reason}).`
                  : "Nothing was added from the drop.";
              setAnnouncement(
                result.status === "applied"
                  ? `Imported a sample note from ${event.dataTransferTypes.join(", ")} with ${fileCountText(event.fileCount)}. Placed it ${destination} ${placement}; workspace position ${String(Math.round(position.x))}, ${String(Math.round(position.y))}.`
                  : rejectionMessage,
              );
            }}
            onGridSnapChange={(gridSnap) => updatePreferences({ gridSnap })}
            onActivePaneChange={setActivePaneId}
            panes={panes}
            readOnly={readOnly}
            sectionDefinitions={sectionDefinitions}
            sectionFactory={({ kind }) => nextFactoryResult(kind)}
            toolbarControls={toolbarControls}
            validateExternalDrop={({ event }) =>
              event.dataTransferTypes.includes(EXTERNAL_SAMPLE_MIME)
                ? { allowed: true, label: "Import sample note" }
                : {
                    allowed: false,
                    reason: "Only sample-note drops are supported here.",
                  }
            }
            validateSectionTitle={validateSampleSectionTitle}
            viewportCullingOptions={VIEWPORT_CULLING_OPTIONS}
          />
        </WorkspaceDetachmentProvider>
      </main>
    </>
  );
}
