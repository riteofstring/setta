import {
  type WorkspaceActionResult,
  type WorkspaceController,
  type WorkspaceDocument,
} from "@setta/workspace/core";
import {
  Workspace,
  WorkspaceInteractionBoundary,
  type SectionDefinition,
} from "@setta/workspace/react";
import { createWorkspaceTestDocument } from "@setta/workspace/testing";
import { useRef, useState } from "react";

const testSectionDefinitions = [
  {
    creation: { group: "Fixtures", keywords: ["state"] },
    defaultSize: { height: 180, width: 240 },
    defaultTitle: "Controlled fixture",
    displayName: "State fixture",
    kind: "test",
    render: ({ readOnly, sectionId }) => (
      <p className="state-contract-section-content">
        {sectionId} host renderer is {readOnly ? "read-only" : "editable"}.
      </p>
    ),
  },
] satisfies readonly SectionDefinition[];

function testDocument(): WorkspaceDocument {
  return createWorkspaceTestDocument([
    { id: "alpha", title: "Alpha" },
    { id: "beta", title: "Beta" },
  ]);
}

function resultMessage(action: string, result: WorkspaceActionResult): string {
  if (result.status === "rejected") {
    return `${action} rejected: ${result.reason}.`;
  }
  return `${action}: ${result.status}.`;
}

export function StateContractPage() {
  const uncontrolledController = useRef<WorkspaceController>(null);
  const controlledController = useRef<WorkspaceController>(null);
  const controlledSectionSequence = useRef(0);
  const [uncontrolledDocument, setUncontrolledDocument] = useState(testDocument);
  const [controlledDocument, setControlledDocument] = useState(testDocument);
  const [uncontrolledChanges, setUncontrolledChanges] = useState(0);
  const [controlledChanges, setControlledChanges] = useState(0);
  const [rejectedControlledDocument, setRejectedControlledDocument] =
    useState<WorkspaceDocument | null>(null);
  const [acceptControlledChanges, setAcceptControlledChanges] = useState(true);
  const [reuseExistingCreationId, setReuseExistingCreationId] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [status, setStatus] = useState("");

  const runUncontrolled = (
    action: string,
    run: (controller: WorkspaceController) => WorkspaceActionResult,
  ) => {
    const controller = uncontrolledController.current;
    if (!controller) {
      throw new Error("The uncontrolled workspace controller is not mounted.");
    }
    setStatus(resultMessage(action, run(controller)));
  };

  const panControlledViewport = () => {
    const controller = controlledController.current;
    if (!controller) {
      throw new Error("The controlled workspace controller is not mounted.");
    }
    setStatus(
      resultMessage("Controlled viewport", controller.setViewport({ x: 120, y: -48, zoom: 1.25 })),
    );
  };

  const focusControlledAlpha = async () => {
    const controller = controlledController.current;
    if (!controller) {
      throw new Error("The controlled workspace controller is not mounted.");
    }
    setStatus(resultMessage("Controlled focus", await controller.focusSection("alpha")));
  };

  const runHistory = (
    controllerReference: typeof controlledController,
    direction: "redo" | "undo",
  ) => {
    const controller = controllerReference.current;
    if (!controller) {
      throw new Error("The workspace history controller is not mounted.");
    }
    controller[direction]();
  };

  return (
    <>
      <a className="skip-link" href="#state-contract-content">
        Skip to state contract
      </a>
      <header className="site-header site-header--compact">
        <p className="eyebrow" translate="no">
          Phase 1 state boundary
        </p>
        <h1>Workspace state contract</h1>
        <p className="lede">
          A focused fixture for controlled and uncontrolled documents, capability changes, and host
          content continuity.
        </p>
      </header>
      <main id="state-contract-content" tabIndex={-1}>
        <p className="announcement" role="status" aria-live="polite">
          {status}
        </p>
        <div className="state-contract-grid">
          <section aria-labelledby="uncontrolled-heading">
            <h2 id="uncontrolled-heading">Uncontrolled document</h2>
            <fieldset className="state-contract-actions">
              <legend>Document actions</legend>
              <button type="button" onClick={() => setReadOnly((current) => !current)}>
                {readOnly ? "Turn editing on" : "Turn read-only on"}
              </button>
              <button
                type="button"
                onClick={() =>
                  runUncontrolled("Layout edit", (controller) =>
                    controller.setSectionsLocked(["alpha"], true),
                  )
                }
              >
                Lock Alpha
              </button>
              <button
                type="button"
                onClick={() =>
                  runUncontrolled("Presentation edit", (controller) =>
                    controller.setSectionMinimized("alpha", true),
                  )
                }
              >
                Minimize Alpha
              </button>
              <button
                type="button"
                onClick={() =>
                  runUncontrolled("Structure edit", (controller) =>
                    controller.deleteSections(["beta"]),
                  )
                }
              >
                Delete Beta
              </button>
              <button
                type="button"
                onClick={() =>
                  runUncontrolled("Viewport navigation", (controller) =>
                    controller.setViewport({ x: 64, y: 32, zoom: 1.5 }),
                  )
                }
              >
                Pan uncontrolled viewport
              </button>
              <button type="button" onClick={() => runHistory(uncontrolledController, "undo")}>
                Undo uncontrolled change
              </button>
              <button type="button" onClick={() => runHistory(uncontrolledController, "redo")}>
                Redo uncontrolled change
              </button>
            </fieldset>
            <Workspace
              ariaLabel="Uncontrolled workspace"
              controllerRef={uncontrolledController}
              defaultDocument={uncontrolledDocument}
              onDocumentChange={(document) => {
                setUncontrolledDocument(document);
                setUncontrolledChanges((count) => count + 1);
              }}
              overlaySlots={{
                canvas: () => (
                  <WorkspaceInteractionBoundary>
                    <label className="state-contract-host-field">
                      Host note
                      <input name="host-note" />
                    </label>
                  </WorkspaceInteractionBoundary>
                ),
              }}
              readOnly={readOnly}
              sectionDefinitions={testSectionDefinitions}
            />
            <p>Committed changes: {uncontrolledChanges}</p>
            <textarea
              aria-label="Uncontrolled document JSON"
              data-testid="uncontrolled-document"
              readOnly
              rows={16}
              spellCheck={false}
              value={JSON.stringify(uncontrolledDocument, null, 2)}
            />
          </section>

          <section aria-labelledby="controlled-heading">
            <h2 id="controlled-heading">Controlled document</h2>
            <label>
              <input
                checked={acceptControlledChanges}
                onChange={(event) => setAcceptControlledChanges(event.currentTarget.checked)}
                type="checkbox"
              />
              Accept controlled changes
            </label>
            <label>
              <input
                checked={reuseExistingCreationId}
                onChange={(event) => setReuseExistingCreationId(event.currentTarget.checked)}
                type="checkbox"
              />
              Reuse existing section ID for creation
            </label>
            <button type="button" onClick={panControlledViewport}>
              Pan controlled viewport
            </button>
            <button type="button" onClick={() => void focusControlledAlpha()}>
              Focus controlled Alpha
            </button>
            <button
              disabled={!rejectedControlledDocument}
              type="button"
              onClick={() => {
                if (!rejectedControlledDocument) {
                  return;
                }
                setControlledDocument(rejectedControlledDocument);
                setStatus("Last rejected controlled document applied as a host replacement.");
              }}
            >
              Apply last rejected document
            </button>
            <button type="button" onClick={() => runHistory(controlledController, "undo")}>
              Undo controlled change
            </button>
            <button type="button" onClick={() => runHistory(controlledController, "redo")}>
              Redo controlled change
            </button>
            <Workspace
              ariaLabel="Controlled workspace"
              controllerRef={controlledController}
              document={controlledDocument}
              onDocumentChange={(document) => {
                if (!acceptControlledChanges) {
                  setRejectedControlledDocument(document);
                  setStatus("Controlled change rejected by host.");
                  return;
                }
                setRejectedControlledDocument(null);
                setControlledDocument(document);
                setControlledChanges((count) => count + 1);
              }}
              sectionDefinitions={testSectionDefinitions}
              sectionFactory={() => {
                if (reuseExistingCreationId) {
                  return {
                    data: null,
                    id: "alpha",
                    title: "Duplicate controlled fixture",
                  };
                }
                controlledSectionSequence.current += 1;
                const sequence = controlledSectionSequence.current;
                return {
                  data: null,
                  id: `controlled-created-${String(sequence)}`,
                  title: `Controlled fixture ${String(sequence)}`,
                };
              }}
            />
            <p>Committed changes: {controlledChanges}</p>
            <textarea
              aria-label="Controlled document JSON"
              data-testid="controlled-document"
              readOnly
              rows={16}
              spellCheck={false}
              value={JSON.stringify(controlledDocument, null, 2)}
            />
          </section>
        </div>
      </main>
    </>
  );
}
