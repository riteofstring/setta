import {
  createEmptyWorkspaceDocument,
  type WorkspaceAppearance,
  type WorkspaceController,
  type WorkspaceDocument,
  type WorkspaceGestureOptions,
  type WorkspaceGridPattern,
  type WorkspacePanOnScrollMode,
  type WorkspaceSection,
} from "@setta/workspace/core";
import {
  Workspace,
  WorkspaceInteractionBoundary,
  type SectionDefinition,
  type WorkspaceMinimapPlacement,
  type WorkspaceToolbarControl,
} from "@setta/workspace/react";
import { useRef, useState, type ReactNode } from "react";

function HostToolbarIcon({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      viewBox="0 0 20 20"
    >
      {children}
    </svg>
  );
}

function GridProbeIcon() {
  return (
    <HostToolbarIcon>
      <circle cx="10" cy="10" r="4.5" />
      <path d="M10 3v3M10 14v3M3 10h3M14 10h3" />
    </HostToolbarIcon>
  );
}

function MoveMinimapIcon() {
  return (
    <HostToolbarIcon>
      <path d="m6.5 6-3 4 3 4M13.5 6l3 4-3 4M4 10h12" />
    </HostToolbarIcon>
  );
}

function RemoveExtensionsIcon() {
  return (
    <HostToolbarIcon>
      <path d="m5.5 5.5 9 9M14.5 5.5l-9 9" />
    </HostToolbarIcon>
  );
}

const scrollFixture = Array.from(
  { length: 16 },
  (_, index) => `Scrollable host line ${String(index + 1)}`,
).join("\n");
const HOST_EXTENSIONS_DEFAULT_QUERY = "(min-width: 40rem)";

const navigationSectionDefinitions = [
  {
    contentSizing: { height: true, width: true },
    defaultSize: { height: 180, width: 240 },
    displayName: "Navigation fixture",
    kind: "navigation fixture",
    render: ({ sectionId }) => (
      <p className="canvas-shell-section-content">Measured host renderer for {sectionId}.</p>
    ),
    resize: {
      axes: "both",
      maxSize: { height: 360, width: 480 },
      minSize: { height: 144, width: 192 },
      preserveAspectRatio: false,
    },
  },
  {
    canContainSections: true,
    defaultChildOrientation: "vertical",
    defaultChildOverflow: "grow",
    defaultSize: { height: 360, width: 480 },
    defaultTitle: "Section group",
    displayName: "Section group",
    kind: "navigation group",
    render: () => (
      <p className="canvas-shell-section-content">
        Grouped sections retain their identities and canonical order. Use Selection actions to
        ungroup them.
      </p>
    ),
    resize: {
      axes: "both",
      maxSize: { height: 1_600, width: 720 },
      minSize: { height: 180, width: 220 },
      preserveAspectRatio: false,
    },
  },
] satisfies readonly SectionDefinition[];

type PanOnDragMode = "all" | "disabled" | "middle" | "primary";

function panOnDrag(mode: PanOnDragMode): WorkspaceGestureOptions["panOnDrag"] {
  if (mode === "disabled") {
    return false;
  }
  if (mode === "middle") {
    return [1];
  }
  if (mode === "primary") {
    return [0];
  }
  return true;
}

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

function recursiveContainer(
  id: string,
  title: string,
  orientation: "horizontal" | "vertical",
  sectionIds: readonly string[],
  width: number,
  height: number,
): WorkspaceSection {
  return {
    ...navigationSection(id, title),
    childLayout: { orientation, overflow: "grow", sectionIds },
    kind: "navigation group",
    size: {
      height: { mode: "content", value: height },
      width: { mode: "fixed", value: width },
    },
  };
}

function createNavigationDocument(): WorkspaceDocument {
  const empty = createEmptyWorkspaceDocument();
  return {
    ...empty,
    rootSections: [
      { position: { x: 480, y: 80 }, sectionId: "alpha" },
      { position: { x: 1_140, y: 120 }, sectionId: "beta" },
      { position: { x: -300, y: -120 }, sectionId: "gamma" },
    ],
    sections: {
      alpha: navigationSection("alpha", "Alpha frame"),
      beta: navigationSection("beta", "Beta frame"),
      gamma: navigationSection("gamma", "Gamma frame"),
    },
  };
}

function createRecursiveDocument(): WorkspaceDocument {
  const empty = createEmptyWorkspaceDocument();
  return {
    ...empty,
    rootSections: [{ position: { x: 120, y: 80 }, sectionId: "recursive-root" }],
    sections: {
      "deep-container": recursiveContainer(
        "deep-container",
        "Deep container",
        "vertical",
        ["nested-gamma"],
        280,
        320,
      ),
      "empty-container": recursiveContainer(
        "empty-container",
        "Empty container",
        "vertical",
        [],
        240,
        180,
      ),
      "nested-alpha": {
        ...navigationSection("nested-alpha", "Nested Alpha"),
        size: {
          height: { mode: "fixed", value: 160 },
          width: { mode: "fixed", value: 240 },
        },
      },
      "nested-beta": {
        ...navigationSection("nested-beta", "Nested Beta"),
        size: {
          height: { mode: "fixed", value: 160 },
          width: { mode: "fixed", value: 240 },
        },
      },
      "nested-gamma": {
        ...navigationSection("nested-gamma", "Nested Gamma"),
        size: {
          height: { mode: "fixed", value: 160 },
          width: { mode: "fixed", value: 240 },
        },
      },
      "nested-row": recursiveContainer(
        "nested-row",
        "Nested row",
        "horizontal",
        ["nested-beta", "deep-container"],
        640,
        420,
      ),
      "recursive-root": recursiveContainer(
        "recursive-root",
        "Recursive workspace",
        "vertical",
        ["nested-alpha", "nested-row", "empty-container"],
        700,
        920,
      ),
    },
  };
}

function workspaceSectionsAvailable(
  document: WorkspaceDocument,
  mounted: boolean,
  sectionIds: readonly string[],
): boolean {
  return mounted && sectionIds.every((sectionId) => Object.hasOwn(document.sections, sectionId));
}

export function CanvasShellPage() {
  const controller = useRef<WorkspaceController>(null);
  const [document, setDocument] = useState<WorkspaceDocument>(createEmptyWorkspaceDocument);
  const [documentChangeCount, setDocumentChangeCount] = useState(0);
  const [appearance, setAppearance] = useState<WorkspaceAppearance>("system");
  const [customGridColor, setCustomGridColor] = useState(false);
  const [gridPattern, setGridPattern] = useState<WorkspaceGridPattern>("dots");
  const [gridSnap, setGridSnap] = useState(true);
  const [gridVisible, setGridVisible] = useState(true);
  const [minimapPlacement, setMinimapPlacement] = useState<WorkspaceMinimapPlacement>("right");
  const [minimapVisible, setMinimapVisible] = useState(true);
  const [panOnDragMode, setPanOnDragMode] = useState<PanOnDragMode>("all");
  const [panOnScroll, setPanOnScroll] = useState(true);
  const [panOnScrollMode, setPanOnScrollMode] = useState<WorkspacePanOnScrollMode>("free");
  const [panOnScrollSpeed, setPanOnScrollSpeed] = useState(0.5);
  const [preventHostPan, setPreventHostPan] = useState(true);
  const [preventHostWheel, setPreventHostWheel] = useState(true);
  const [showHostExtensions, setShowHostExtensions] = useState(
    () => window.matchMedia(HOST_EXTENSIONS_DEFAULT_QUERY).matches,
  );
  const [workspaceMounted, setWorkspaceMounted] = useState(true);
  const [zoomOnDoubleClick, setZoomOnDoubleClick] = useState(true);
  const [zoomOnPinch, setZoomOnPinch] = useState(true);
  const [zoomOnScroll, setZoomOnScroll] = useState(false);
  const [status, setStatus] = useState("Canvas ready.");

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

  const hasSections = document.rootSections.length > 0;
  const navigationAvailable = workspaceSectionsAvailable(document, workspaceMounted, [
    "alpha",
    "beta",
    "gamma",
  ]);
  const recursiveFixtureAvailable = workspaceSectionsAvailable(document, workspaceMounted, [
    "nested-alpha",
    "nested-gamma",
  ]);
  const toolbarControls = (
    showHostExtensions
      ? [
          {
            icon: <GridProbeIcon />,
            id: "grid-probe",
            label: "Set grid probe viewport",
            onPress: (workspaceController) => {
              const result = workspaceController.setViewport({ x: -37, y: 53, zoom: 1.5 });
              setStatus(`Grid probe viewport: ${result.status}.`);
            },
            placement: "project",
            pressed:
              document.viewport.x === -37 &&
              document.viewport.y === 53 &&
              document.viewport.zoom === 1.5,
          },
          {
            icon: <MoveMinimapIcon />,
            id: "move-minimap",
            label: `Move minimap to ${minimapPlacement === "left" ? "right" : "left"}`,
            onPress: () => {
              const nextPlacement = minimapPlacement === "left" ? "right" : "left";
              setMinimapPlacement(nextPlacement);
              setStatus(`Minimap moved to ${nextPlacement}.`);
            },
            placement: "utility",
          },
          {
            icon: <RemoveExtensionsIcon />,
            id: "remove-host-extensions",
            label: "Remove host extensions",
            onPress: () => {
              setShowHostExtensions(false);
              setStatus("Host extensions removed.");
            },
            placement: "utility",
          },
        ]
      : []
  ) satisfies readonly WorkspaceToolbarControl[];

  return (
    <>
      <a className="skip-link" href="#canvas-shell-content">
        Skip to canvas shell
      </a>
      <header className="site-header site-header--compact">
        <p className="eyebrow" translate="no">
          Phase 2 canvas boundary
        </p>
        <h1>Workspace canvas shell</h1>
        <p className="lede">
          A backend-free viewport with movable host-defined sections, runtime gesture policy,
          independent grid and snapping, scoped appearance, and package-owned controls.
        </p>
      </header>
      <main id="canvas-shell-content" tabIndex={-1}>
        <div className="canvas-shell-control-groups">
          <fieldset className="canvas-shell-settings">
            <legend>Viewport gestures</legend>
            <label>
              Drag to pan
              <select
                onChange={(event) => setPanOnDragMode(event.currentTarget.value as PanOnDragMode)}
                value={panOnDragMode}
              >
                <option value="disabled">Disabled</option>
                <option value="primary">Primary button</option>
                <option value="middle">Middle button</option>
                <option value="all">Primary or middle</option>
              </select>
            </label>
            <label>
              <input
                checked={panOnScroll}
                onChange={(event) => setPanOnScroll(event.currentTarget.checked)}
                type="checkbox"
              />
              Pan with wheel
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
            <label>
              Wheel pan speed
              <select
                onChange={(event) => setPanOnScrollSpeed(Number(event.currentTarget.value))}
                value={panOnScrollSpeed}
              >
                <option value="0.25">Slow</option>
                <option value="0.5">Default</option>
                <option value="1">Fast</option>
              </select>
            </label>
            <p className="canvas-shell-settings-hint">Hold Space to pan temporarily.</p>
          </fieldset>
          <fieldset className="canvas-shell-settings">
            <legend>Zoom gestures</legend>
            <label>
              <input
                checked={zoomOnScroll}
                onChange={(event) => setZoomOnScroll(event.currentTarget.checked)}
                type="checkbox"
              />
              Zoom with wheel
            </label>
            <label>
              <input
                checked={zoomOnPinch}
                onChange={(event) => setZoomOnPinch(event.currentTarget.checked)}
                type="checkbox"
              />
              Pinch to zoom
            </label>
            <label>
              <input
                checked={zoomOnDoubleClick}
                onChange={(event) => setZoomOnDoubleClick(event.currentTarget.checked)}
                type="checkbox"
              />
              Double-click to zoom
            </label>
            <p className="canvas-shell-settings-hint">
              Hold Alt to zoom with the wheel temporarily.
            </p>
          </fieldset>
          <fieldset className="canvas-shell-settings">
            <legend>Canvas preferences</legend>
            <label>
              <input
                checked={gridVisible}
                onChange={(event) => setGridVisible(event.currentTarget.checked)}
                type="checkbox"
              />
              Show grid
            </label>
            <label>
              Grid pattern
              <select
                onChange={(event) =>
                  setGridPattern(event.currentTarget.value as WorkspaceGridPattern)
                }
                value={gridPattern}
              >
                <option value="dots">Dots</option>
                <option value="lines">Lines</option>
                <option value="cross">Crosses</option>
              </select>
            </label>
            <label>
              Appearance
              <select
                onChange={(event) =>
                  setAppearance(event.currentTarget.value as WorkspaceAppearance)
                }
                value={appearance}
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <label>
              <input
                checked={customGridColor}
                onChange={(event) => setCustomGridColor(event.currentTarget.checked)}
                type="checkbox"
              />
              Use violet grid color
            </label>
            <label>
              <input
                checked={showHostExtensions}
                onChange={(event) => {
                  setShowHostExtensions(event.currentTarget.checked);
                  setStatus(
                    event.currentTarget.checked
                      ? "Host extensions registered."
                      : "Host extensions removed.",
                  );
                }}
                type="checkbox"
              />
              Show host extensions
            </label>
          </fieldset>
          <fieldset className="canvas-shell-settings">
            <legend>Canvas lifecycle</legend>
            <label>
              <input
                checked={preventHostPan}
                onChange={(event) => setPreventHostPan(event.currentTarget.checked)}
                type="checkbox"
              />
              Block canvas pan from host content
            </label>
            <label>
              <input
                checked={preventHostWheel}
                onChange={(event) => setPreventHostWheel(event.currentTarget.checked)}
                type="checkbox"
              />
              Block canvas wheel from host content
            </label>
            <label>
              <input
                checked={workspaceMounted}
                onChange={(event) => {
                  setWorkspaceMounted(event.currentTarget.checked);
                  setStatus(event.currentTarget.checked ? "Canvas mounted." : "Canvas unmounted.");
                }}
                type="checkbox"
              />
              Mount workspace canvas
            </label>
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
              type="button"
              onClick={() => {
                setDocument(createRecursiveDocument());
                setStatus("Recursive fixture loaded.");
              }}
            >
              Load recursive fixture
            </button>
            <button
              disabled={!navigationAvailable}
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
              disabled={!navigationAvailable}
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
              disabled={!navigationAvailable}
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
              disabled={!navigationAvailable}
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
              disabled={!recursiveFixtureAvailable}
              type="button"
              onClick={() =>
                void runNavigation("Focus Nested Gamma", (workspaceController) =>
                  workspaceController.focusSection("nested-gamma"),
                )
              }
            >
              Focus Nested Gamma
            </button>
            <button
              disabled={!recursiveFixtureAvailable}
              type="button"
              onClick={() =>
                void runNavigation("Fit recursive descendants", (workspaceController) =>
                  workspaceController.fitSections(["nested-alpha", "nested-gamma"]),
                )
              }
            >
              Fit recursive descendants
            </button>
            <button
              disabled={!hasSections}
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
          {status} Committed document changes:{" "}
          <span data-testid="canvas-shell-change-count">{documentChangeCount}</span>.
        </p>
        {workspaceMounted ? (
          <Workspace
            ariaLabel="Canvas shell workspace"
            appearanceOptions={
              customGridColor
                ? {
                    appearance,
                    dark: { gridColor: "oklch(0.68 0.11 305)" },
                    light: { gridColor: "oklch(0.58 0.12 305)" },
                  }
                : { appearance }
            }
            controllerRef={controller}
            document={document}
            emptyState="No sections yet. Use the gesture controls to explore the canvas."
            gestureOptions={{
              initialZoom: 1,
              maxZoom: 2,
              minZoom: 0.5,
              panActivationKey: "Space",
              panOnDrag: panOnDrag(panOnDragMode),
              panOnScroll,
              panOnScrollMode,
              panOnScrollSpeed,
              zoomActivationKey: "Alt",
              zoomOnDoubleClick,
              zoomOnPinch,
              zoomOnScroll,
            }}
            gridOptions={{
              markSize: 1,
              pattern: gridPattern,
              snap: gridSnap,
              spacing: [24, 24],
              visible: gridVisible,
            }}
            groupFactory={({ sectionIds }) => {
              let number = 1;
              while (Object.hasOwn(document.sections, `navigation-group-${String(number)}`)) {
                number += 1;
              }
              return {
                data: null,
                id: `navigation-group-${String(number)}`,
                kind: "navigation group",
                title: `Group ${String(number)} (${String(sectionIds.length)} sections)`,
              };
            }}
            minimapOptions={{ placement: minimapPlacement, visible: minimapVisible }}
            onDocumentChange={(nextDocument, change) => {
              setDocument(nextDocument);
              setDocumentChangeCount((count) => count + 1);
              setStatus(`Document change: ${change.reason}.`);
            }}
            onGridSnapChange={setGridSnap}
            onMinimapVisibilityChange={setMinimapVisible}
            sectionDefinitions={navigationSectionDefinitions}
            selectionOptions={{ marqueeMode: "full" }}
            overlaySlots={{
              canvas: () => (
                <WorkspaceInteractionBoundary
                  className="canvas-shell-host-fixture"
                  hidden={!showHostExtensions}
                  preventPan={preventHostPan}
                  preventWheel={preventHostWheel}
                >
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
              ),
              utility: (workspaceController) =>
                showHostExtensions ? (
                  <button
                    className="canvas-shell-overlay-action"
                    type="button"
                    onClick={() => {
                      const result = workspaceController.setViewport({ x: 0, y: 0, zoom: 1 });
                      setStatus(`Reset viewport: ${result.status}.`);
                    }}
                  >
                    Reset viewport
                  </button>
                ) : null,
            }}
            toolbarControls={toolbarControls}
          />
        ) : null}
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
