import {
  WORKSPACE_DOCUMENT_SCHEMA_VERSION,
  type WorkspaceActionResult,
  type WorkspaceAppearance,
  type WorkspaceChildLayout,
  type WorkspaceController,
  type WorkspaceDocument,
  type WorkspaceSection,
  type WorkspaceSectionPresentation,
  type WorkspaceViewport,
} from "@setta/workspace/core";
import { Workspace, type SectionDefinition } from "@setta/workspace/react";
import { useRef, useState } from "react";

type MatrixSectionData = string | null;

const DEFAULT_PRESENTATION: WorkspaceSectionPresentation = {
  accentColor: null,
  chrome: "default",
  tagColor: null,
};

const MATRIX_SECTION_DEFINITIONS: readonly SectionDefinition<MatrixSectionData>[] = [
  {
    defaultSize: { height: 168, width: 240 },
    displayName: "Matrix note",
    kind: "matrix-note",
    render: ({ data }) => <p className="canvas-shell-section-content">{data ?? "Matrix note."}</p>,
    resize: {
      axes: "both",
      maxSize: { height: 480, width: 560 },
      minSize: { height: 96, width: 176 },
      preserveAspectRatio: false,
    },
  },
  {
    canContainSections: true,
    defaultChildOrientation: "vertical",
    defaultChildOverflow: "grow",
    defaultSize: { height: 160, width: 240 },
    defaultSizeMode: { height: "content", width: "fixed" },
    displayName: "Matrix group",
    kind: "matrix-group",
    render: () => null,
  },
];

function matrixNote(
  id: string,
  title: string,
  body: string,
  presentation: Partial<WorkspaceSectionPresentation> = {},
  state: Partial<Pick<WorkspaceSection, "isMinimized" | "positionAndSizeLocked" | "size">> = {},
): WorkspaceSection<MatrixSectionData> {
  return {
    childLayout: null,
    data: body,
    id,
    isMinimized: false,
    kind: "matrix-note",
    positionAndSizeLocked: false,
    presentation: { ...DEFAULT_PRESENTATION, ...presentation },
    size: {
      height: { mode: "fixed", value: 168 },
      width: { mode: "fixed", value: 240 },
    },
    title,
    ...state,
  };
}

function matrixGroup(
  id: string,
  title: string,
  childLayout: WorkspaceChildLayout,
  width: number,
): WorkspaceSection<MatrixSectionData> {
  return {
    childLayout,
    data: null,
    id,
    isMinimized: false,
    kind: "matrix-group",
    positionAndSizeLocked: false,
    presentation: DEFAULT_PRESENTATION,
    size: {
      height: { mode: "content", value: 160 },
      width: { mode: "fixed", value: width },
    },
    title,
  };
}

function orderedChildren(
  orientation: "horizontal" | "vertical",
  sectionIds: readonly string[],
): WorkspaceChildLayout {
  return { orientation, overflow: "grow", positioning: "ordered", sectionIds };
}

const DEFAULT_MATRIX_VIEWPORT: WorkspaceViewport = { x: 88, y: 8, zoom: 0.6 };

function createVisualMatrixDocument(
  viewport: WorkspaceViewport,
): WorkspaceDocument<MatrixSectionData> {
  return {
    rootSections: [
      { position: { x: 24, y: 24 }, sectionId: "chrome-default" },
      { position: { x: 288, y: 24 }, sectionId: "chrome-compact" },
      { position: { x: 552, y: 24 }, sectionId: "chrome-transparent" },
      { position: { x: 816, y: 24 }, sectionId: "chrome-none" },
      { position: { x: 1_080, y: 24 }, sectionId: "accent-tag" },
      { position: { x: 24, y: 224 }, sectionId: "state-locked" },
      { position: { x: 288, y: 224 }, sectionId: "state-minimized" },
      { position: { x: 552, y: 224 }, sectionId: "selection-target" },
      { position: { x: 816, y: 224 }, sectionId: "empty-group" },
      { position: { x: 1_080, y: 224 }, sectionId: "freeform-group" },
      { position: { x: 24, y: 440 }, sectionId: "tower-group" },
    ],
    schemaVersion: WORKSPACE_DOCUMENT_SCHEMA_VERSION,
    sections: {
      "accent-tag": matrixNote("accent-tag", "Accent and tag", "Blue accent with an amber tag.", {
        accentColor: "oklch(0.62 0.14 255)",
        tagColor: "oklch(0.72 0.11 80)",
      }),
      "chrome-compact": matrixNote("chrome-compact", "Compact chrome", "Compact section chrome.", {
        chrome: "compact",
      }),
      "chrome-default": matrixNote("chrome-default", "Default chrome", "Default section chrome."),
      "chrome-none": matrixNote("chrome-none", "Headerless chrome", "Headerless section chrome.", {
        chrome: "none",
      }),
      "chrome-transparent": matrixNote(
        "chrome-transparent",
        "Transparent chrome",
        "Transparent section chrome.",
        { chrome: "transparent" },
      ),
      "deep-group": matrixGroup(
        "deep-group",
        "Deep group",
        orderedChildren("vertical", ["deep-leaf"]),
        280,
      ),
      "deep-leaf": matrixNote("deep-leaf", "Deep leaf", "Third nesting depth."),
      "empty-group": matrixGroup(
        "empty-group",
        "Empty container",
        orderedChildren("vertical", []),
        240,
      ),
      "free-note-a": matrixNote(
        "free-note-a",
        "Freeform note A",
        "Freeform child at 16, 16.",
        {},
        {
          size: {
            height: { mode: "fixed", value: 96 },
            width: { mode: "fixed", value: 184 },
          },
        },
      ),
      "free-note-b": matrixNote(
        "free-note-b",
        "Freeform note B",
        "Freeform child at 44, 128.",
        {},
        {
          size: {
            height: { mode: "fixed", value: 96 },
            width: { mode: "fixed", value: 184 },
          },
        },
      ),
      "freeform-group": {
        ...matrixGroup(
          "freeform-group",
          "Freeform container",
          {
            overflow: "grow",
            positioning: "freeform",
            positions: {
              "free-note-a": { x: 16, y: 16 },
              "free-note-b": { x: 44, y: 128 },
            },
            sectionIds: ["free-note-a", "free-note-b"],
          },
          260,
        ),
        size: {
          height: { mode: "fixed", value: 336 },
          width: { mode: "fixed", value: 260 },
        },
      },
      "nested-leaf": matrixNote("nested-leaf", "Nested leaf", "First nesting depth."),
      "row-group": matrixGroup(
        "row-group",
        "Horizontal row",
        orderedChildren("horizontal", ["row-leaf", "deep-group"]),
        560,
      ),
      "row-leaf": matrixNote("row-leaf", "Row leaf", "Horizontal sibling."),
      "selection-target": matrixNote(
        "selection-target",
        "Selection target",
        "Select this section with the matrix state controls.",
      ),
      "state-locked": matrixNote(
        "state-locked",
        "Locked section",
        "Position and size are locked.",
        {},
        { positionAndSizeLocked: true },
      ),
      "state-minimized": matrixNote(
        "state-minimized",
        "Minimized section",
        "Minimized to its header.",
        {},
        { isMinimized: true },
      ),
      "tower-group": matrixGroup(
        "tower-group",
        "Vertical pair",
        orderedChildren("vertical", ["nested-leaf", "row-group"]),
        600,
      ),
    },
    viewport,
  };
}

function matrixViewportNumber(search: URLSearchParams, name: string): number | null {
  const raw = search.get(name);
  if (raw === null) {
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new TypeError(
      `The visual matrix ${name} query must be a finite number, not ${JSON.stringify(raw)}.`,
    );
  }
  return value;
}

function matrixViewport(search: URLSearchParams): WorkspaceViewport {
  const zoom = matrixViewportNumber(search, "zoom");
  const x = matrixViewportNumber(search, "viewport-x");
  const y = matrixViewportNumber(search, "viewport-y");
  return {
    x: x ?? DEFAULT_MATRIX_VIEWPORT.x,
    y: y ?? DEFAULT_MATRIX_VIEWPORT.y,
    zoom: zoom ?? DEFAULT_MATRIX_VIEWPORT.zoom,
  };
}

function matrixAppearance(search: URLSearchParams): WorkspaceAppearance {
  const appearance = search.get("appearance") ?? "light";
  if (appearance !== "dark" && appearance !== "light" && appearance !== "system") {
    throw new TypeError(
      `The visual matrix appearance query must be dark, light, or system, not ${JSON.stringify(appearance)}.`,
    );
  }
  return appearance;
}

function selectionStatus(label: string, result: WorkspaceActionResult): string {
  return `${label}: ${result.status}${"reason" in result ? ` (${result.reason})` : ""}.`;
}

export function VisualMatrixPage() {
  const search = new URLSearchParams(window.location.search);
  const appearance = matrixAppearance(search);
  const readOnly = search.has("read-only");
  const controllerRef = useRef<WorkspaceController<MatrixSectionData>>(null);
  const [document, setDocument] = useState(() =>
    createVisualMatrixDocument(matrixViewport(search)),
  );
  const [status, setStatus] = useState("Visual matrix ready.");

  const selectSections = (label: string, sectionIds: readonly string[]) => {
    const controller = controllerRef.current;
    if (!controller) {
      throw new Error("The visual matrix controller is not mounted.");
    }
    setStatus(selectionStatus(label, controller.selectSections(sectionIds)));
  };

  return (
    <>
      <a className="skip-link" href="#visual-matrix-content">
        Skip to visual matrix
      </a>
      <header className="site-header site-header--compact">
        <p className="eyebrow" translate="no">
          Setta UI phase 0
        </p>
        <h1>Workspace visual matrix</h1>
        <p className="lede">
          Chrome variants, section states, nesting depths, and canvas controls rendered only through
          the public package API. Add appearance=dark or read-only to the query string to review the
          other appearance and interaction modes. The zoom, viewport-x, and viewport-y queries set
          the initial viewport for repeatable captures and interaction profiling.
        </p>
      </header>
      <main id="visual-matrix-content" tabIndex={-1}>
        <fieldset className="canvas-shell-settings">
          <legend>Matrix states</legend>
          <button
            type="button"
            onClick={() => selectSections("Select the selection target", ["selection-target"])}
          >
            Select the selection target
          </button>
          <button
            type="button"
            onClick={() =>
              selectSections("Select two sections", ["selection-target", "chrome-default"])
            }
          >
            Select two sections
          </button>
          <button
            type="button"
            onClick={() => {
              const controller = controllerRef.current;
              if (!controller) {
                throw new Error("The visual matrix controller is not mounted.");
              }
              setStatus(selectionStatus("Clear selection", controller.clearSelection()));
            }}
          >
            Clear selection
          </button>
          <button
            type="button"
            onClick={() => {
              const controller = controllerRef.current;
              if (!controller) {
                throw new Error("The visual matrix controller is not mounted.");
              }
              controller.clearSelection();
              setDocument(createVisualMatrixDocument(matrixViewport(search)));
              setStatus("Reset the matrix document.");
            }}
          >
            Reset matrix document
          </button>
        </fieldset>
        <p className="announcement" role="status" aria-live="polite">
          {status}
        </p>
        <div className="workspace-host">
          <Workspace
            appearanceOptions={{ appearance }}
            ariaLabel="Visual matrix workspace"
            controllerRef={controllerRef}
            document={document}
            onDocumentChange={(nextDocument, change) => {
              setDocument(nextDocument);
              setStatus(`Document change: ${change.reason}.`);
            }}
            readOnly={readOnly}
            sectionDefinitions={MATRIX_SECTION_DEFINITIONS}
          />
        </div>
      </main>
    </>
  );
}
