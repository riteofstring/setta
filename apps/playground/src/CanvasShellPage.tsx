import {
  createEmptyWorkspaceDocument,
  type WorkspaceController,
  type WorkspaceDocument,
  type WorkspacePanOnScrollMode,
} from "@setta/workspace/core";
import { Workspace, WorkspaceInteractionBoundary } from "@setta/workspace/react";
import { useRef, useState } from "react";

const scrollFixture = Array.from(
  { length: 16 },
  (_, index) => `Scrollable host line ${String(index + 1)}`,
).join("\n");

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
