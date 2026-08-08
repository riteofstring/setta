import {
  createEmptyWorkspaceDocument,
  type WorkspaceController,
  type WorkspaceDocument,
  type WorkspacePanOnScrollMode,
  type WorkspaceSection,
} from "@setta/workspace/core";
import { Workspace, WorkspaceInteractionBoundary } from "@setta/workspace/react";
import { useRef, useState } from "react";

const scrollFixture = Array.from(
  { length: 16 },
  (_, index) => `Scrollable host line ${String(index + 1)}`,
).join("\n");

function navigationSection(id: string, title: string): WorkspaceSection {
  return {
    childLayout: null,
    data: null,
    id,
    isMinimized: false,
    kind: "navigation fixture",
    positionAndSizeLocked: false,
    presentation: { accentColor: null, chrome: "default", tagColor: null },
    size: {
      height: { mode: "fixed", value: 180 },
      width: { mode: "fixed", value: 240 },
    },
    title,
  };
}

function createNavigationDocument(): WorkspaceDocument {
  const empty = createEmptyWorkspaceDocument();
  return {
    ...empty,
    rootSections: [
      { position: { x: 360, y: 160 }, sectionId: "alpha" },
      { position: { x: 1_500, y: 260 }, sectionId: "beta" },
      { position: { x: -520, y: -360 }, sectionId: "gamma" },
    ],
    sections: {
      alpha: navigationSection("alpha", "Alpha frame"),
      beta: navigationSection("beta", "Beta frame"),
      gamma: navigationSection("gamma", "Gamma frame"),
    },
  };
}

export function CanvasShellPage() {
  const controller = useRef<WorkspaceController>(null);
  const [document, setDocument] = useState<WorkspaceDocument>(createEmptyWorkspaceDocument);
  const [changeCount, setChangeCount] = useState(0);
  const [panOnScroll, setPanOnScroll] = useState(true);
  const [panOnScrollMode, setPanOnScrollMode] = useState<WorkspacePanOnScrollMode>("free");
  const [zoomOnScroll, setZoomOnScroll] = useState(false);
  const [status, setStatus] = useState("Canvas ready.");

  const resetViewport = () => {
    const result = controller.current?.setViewport({ x: 0, y: 0, zoom: 1 });
    setStatus(`Reset viewport: ${result?.status ?? "unavailable"}.`);
  };

  const runNavigation = async (
    label: string,
    action: (workspaceController: WorkspaceController) => Promise<{ status: string }>,
  ) => {
    const workspaceController = controller.current;
    if (!workspaceController) {
      throw new Error("The canvas shell controller is not mounted.");
    }
    const result = await action(workspaceController);
    setStatus(`${label}: ${result.status}.`);
  };

  const hasNavigationFixture = document.rootSections.length > 0;

  return (
    <>
      <a className="skip-link" href="#canvas-shell-content">
        Skip to canvas shell
      </a>
      <header className="site-header site-header--compact">
        <p className="eyebrow" translate="no">
          Phase 1 canvas boundary
        </p>
        <h1>Workspace canvas shell</h1>
        <p className="lede">
          A backend-free viewport with runtime gesture policy and isolated host controls.
        </p>
      </header>
      <main id="canvas-shell-content" tabIndex={-1}>
        <div className="canvas-shell-control-groups">
          <fieldset className="canvas-shell-settings">
            <legend>Viewport gestures</legend>
            <label>
              <input
                checked={panOnScroll}
                onChange={(event) => setPanOnScroll(event.currentTarget.checked)}
                type="checkbox"
              />
              Pan with wheel
            </label>
            <label>
              <input
                checked={zoomOnScroll}
                onChange={(event) => setZoomOnScroll(event.currentTarget.checked)}
                type="checkbox"
              />
              Zoom with wheel
            </label>
            <label>
              Wheel pan direction
              <select
                onChange={(event) =>
                  setPanOnScrollMode(event.currentTarget.value as WorkspacePanOnScrollMode)
                }
                value={panOnScrollMode}
              >
                <option value="free">Free</option>
                <option value="horizontal">Horizontal</option>
                <option value="vertical">Vertical</option>
              </select>
            </label>
            <button type="button" onClick={resetViewport}>
              Reset viewport
            </button>
          </fieldset>
          <fieldset className="canvas-shell-settings">
            <legend>Measured navigation</legend>
            <button
              type="button"
              onClick={() => {
                setDocument(createNavigationDocument());
                setStatus("Navigation fixture loaded.");
              }}
            >
              Load navigation fixture
            </button>
            <button
              disabled={!hasNavigationFixture}
              type="button"
              onClick={() =>
                void runNavigation("Focus Alpha", (workspaceController) =>
                  workspaceController.focusSection("alpha"),
                )
              }
            >
              Focus Alpha
            </button>
            <button
              disabled={!hasNavigationFixture}
              type="button"
              onClick={() =>
                void runNavigation("Focus next from Alpha", (workspaceController) =>
                  workspaceController.focusNextSection("alpha"),
                )
              }
            >
              Focus next from Alpha
            </button>
            <button
              disabled={!hasNavigationFixture}
              type="button"
              onClick={() =>
                void runNavigation("Focus previous from Alpha", (workspaceController) =>
                  workspaceController.focusPreviousSection("alpha"),
                )
              }
            >
              Focus previous from Alpha
            </button>
            <button
              disabled={!hasNavigationFixture}
              type="button"
              onClick={() =>
                void runNavigation("Fit navigation fixture", (workspaceController) =>
                  workspaceController.fitSections(["alpha", "beta", "gamma"]),
                )
              }
            >
              Fit navigation fixture
            </button>
            <button
              disabled={!hasNavigationFixture}
              type="button"
              onClick={() => {
                setDocument(createEmptyWorkspaceDocument());
                setStatus("Navigation fixture cleared.");
              }}
            >
              Clear navigation fixture
            </button>
          </fieldset>
        </div>
        <p className="announcement" role="status" aria-live="polite">
          {status} Committed viewport changes: {changeCount}.
        </p>
        <Workspace
          ariaLabel="Canvas shell workspace"
          controllerRef={controller}
          document={document}
          emptyState="No sections yet. Use the gesture controls to explore the canvas."
          gestureOptions={{
            initialZoom: 1,
            maxZoom: 2,
            minZoom: 0.5,
            panOnDrag: true,
            panOnScroll,
            panOnScrollMode,
            zoomOnDoubleClick: true,
            zoomOnScroll,
          }}
          onDocumentChange={(nextDocument, change) => {
            setDocument(nextDocument);
            setChangeCount((count) => count + 1);
            setStatus(`Document change: ${change.reason}.`);
          }}
        >
          <WorkspaceInteractionBoundary className="canvas-shell-host-fixture">
            <label>
              Host note
              <input name="canvas-shell-note" />
            </label>
            <label>
              Scrollable host content
              <textarea
                data-testid="canvas-shell-scroll-fixture"
                readOnly
                rows={5}
                spellCheck={false}
                value={scrollFixture}
              />
            </label>
          </WorkspaceInteractionBoundary>
        </Workspace>
        <label className="canvas-shell-document">
          Workspace document JSON
          <textarea
            data-testid="canvas-shell-document"
            readOnly
            rows={12}
            spellCheck={false}
            value={JSON.stringify(document, null, 2)}
          />
        </label>
      </main>
    </>
  );
}
