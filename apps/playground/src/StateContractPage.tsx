import {
  type WorkspaceActionResult,
  type WorkspaceController,
  type WorkspaceDocument,
} from "@setta/workspace/core";
import { Workspace, WorkspaceInteractionBoundary } from "@setta/workspace/react";
import { createWorkspaceTestDocument } from "@setta/workspace/testing";
import { useRef, useState } from "react";

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
  const [uncontrolledDocument, setUncontrolledDocument] = useState(testDocument);
  const [controlledDocument, setControlledDocument] = useState(testDocument);
  const [uncontrolledChanges, setUncontrolledChanges] = useState(0);
  const [controlledChanges, setControlledChanges] = useState(0);
  const [acceptControlledChanges, setAcceptControlledChanges] = useState(true);
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
            <button type="button" onClick={panControlledViewport}>
              Pan controlled viewport
            </button>
            <Workspace
              ariaLabel="Controlled workspace"
              controllerRef={controlledController}
              document={controlledDocument}
              onDocumentChange={(document) => {
                if (!acceptControlledChanges) {
                  setStatus("Controlled change rejected by host.");
                  return;
                }
                setControlledDocument(document);
                setControlledChanges((count) => count + 1);
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
